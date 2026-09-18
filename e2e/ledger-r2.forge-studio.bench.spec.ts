import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type ApiRenderJob, apiRenderJobSchema } from '@continuum/contracts';
import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { type MintedSession, mintSessionBundleForEmail } from './support/auth';
import {
  FORGE_FIXTURE,
  type ForgeFixtures,
  installForgeFixtures,
  STARCRAFT_BRAND_ID,
} from './support/forge-studio-fixtures';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// forge:studio:e2e:bench — the Render ledger, round 2, in a real Chrome.
//
// Same harness as forge-studio.bench.spec.ts: a real minted StarCraft session, the server-rendered
// /forge page, every /api/ai-studio/** call answered by contract-parsed fixtures and the backend a
// dead port. This file swaps the fixture jobs for four that each carry one round-2 fact:
//
//   Expired link    — failed, with the backend's full sentence, and a thumbnail whose signed URL
//                     now answers 404.
//   Legacy failure  — failed with the bare `render_error` literal every old fleet failure carries.
//   Carrier drop    — a Final (`test: false`) pinned to source revision 2.
//   Reel            — one comp delivered as MP4 + MOV + MXF.
//
// Render files live on `renders.invalid`, answered 404 here, so the fallback path is real.
//
// It proves: the column reads "Template version" and "Rev 2 · Sep 10" with the full digest in its
// tooltip; Proof and Final are marked; every failure sentence is on screen whole and the legacy
// code never is; the reel lists and downloads every file; and no broken image is ever left on
// screen — in the ledger, or in either job's detail.
//
// It does NOT exercise the Fastify backend (the revision number, per-job `test` and the failure
// sentences are S4's) — the envelope says so.
//
// Usage:
//   cd Continuum-Frontend && FORGE_STUDIO_E2E_PORT=3415 \
//     FORGE_STUDIO_DIST_DIR=.next/forge-studio-e2e-s5 \
//     bun run forge:studio:e2e:bench -- e2e/ledger-r2.forge-studio.bench.spec.ts

const { publishableKey, serviceRoleKey } = loadProdSupabaseEnv();

const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const OWNER_EMAIL = 'duane@continuumai.agency';
const RUN_ID = process.env.FORGE_STUDIO_RUN_ID ?? String(Date.now());
const SHOTS_DIR = resolve(__dirname, '__screenshots__/forge-studio');
// Shared with the other forge-studio specs: one run, one results file, one complete envelope.
const RESULTS_PATH = join(tmpdir(), `forge-studio-bench-${RUN_ID}.jsonl`);

const FILES_HOST = 'https://renders.invalid';
const SHA = `${'c0ffee'.repeat(10)}abcd`;
const SENTENCE =
  'The render farm stopped this render after 15 minutes without a file. Render it again; if it keeps timing out, the template may be too heavy for one pass.';
const LEGACY_SENTENCE = 'The render farm reported an error and sent no file.';
const SQUARE = { name: FORGE_FIXTURE.promo.compName, width: 1080, height: 1080 };
const STORY = { name: 'Story 1080x1920', width: 1080, height: 1920 };
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhAG/7Z0t0QAAAABJRU5ErkJggg==';

const LABEL = {
  expired: 'Expired link',
  legacy: 'Legacy failure',
  final: 'Carrier drop',
  reel: 'Reel',
} as const;

let session: MintedSession | null = null;
const opened: BrowserContext[] = [];
const activeFixtures: ForgeFixtures[] = [];

// --- session and envelope (the pattern of forge-studio.bench.spec.ts) ------------------------

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('[ledger-r2-bench] access token has no payload');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    session_id?: string;
  };
  if (!claims.sub || !claims.session_id) {
    throw new Error('[ledger-r2-bench] access token carries no sub or session_id claim');
  }
  return { sub: claims.sub, session_id: claims.session_id };
}

/** Pins THIS session to StarCraft through the member's own RLS, then reads the pin back. */
async function pinSessionToStarCraft(accessToken: string): Promise<void> {
  const { sub, session_id } = claimsOf(accessToken);
  const member = createClient(PROD_SUPABASE_URL, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await member.schema('brand_profiles').from('user_session_brands').upsert(
    {
      user_id: sub,
      session_id,
      active_brand_id: STARCRAFT_BRAND_ID,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,session_id' },
  );
  if (error) throw new Error(`[ledger-r2-bench] session brand pin failed: ${error.message}`);
  const { data, error: resolveError } = await member
    .schema('brand_profiles')
    .rpc('resolve_active_brand_for_session');
  if (resolveError || data !== STARCRAFT_BRAND_ID) {
    throw new Error(
      `[ledger-r2-bench] the session resolves to ${String(data)} (${resolveError?.message ?? 'no error'}), not StarCraft`,
    );
  }
}

type Grade = { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string };

function recordGrade(testInfo: TestInfo, problem: unknown): void {
  const failed =
    problem !== null || (testInfo.status !== 'passed' && testInfo.status !== 'skipped');
  const grade: Grade = {
    step: testInfo.title,
    grade: failed ? 'FAIL' : testInfo.status === 'skipped' ? 'SKIP' : 'PASS',
    ...(failed
      ? {
          detail: (problem instanceof Error ? problem.message : testInfo.error?.message)?.slice(
            0,
            500,
          ),
        }
      : {}),
  };
  appendFileSync(RESULTS_PATH, `${JSON.stringify(grade)}\n`);
}

function printEnvelope(): void {
  const results: Grade[] = existsSync(RESULTS_PATH)
    ? readFileSync(RESULTS_PATH, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Grade)
    : [];
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of results) {
    if (result.grade === 'PASS') counts.pass += 1;
    else if (result.grade === 'SKIP') counts.skip += 1;
    else counts.fail += 1;
  }
  const startedMs = Number(RUN_ID);
  console.log(
    JSON.stringify({
      bench: 'forge:studio:e2e:bench',
      mode: LIVE ? 'live' : 'fixtures',
      startedAt: new Date(Number.isFinite(startedMs) ? startedMs : Date.now()).toISOString(),
      durationMs: Number.isFinite(startedMs) ? Date.now() - startedMs : 0,
      results,
      notes: [
        'FIXTURES: every /api/ai-studio/** call was answered in the browser by fixtures parsed through the real contracts; ledger-r2.forge-studio.bench.spec.ts swapped the jobs for four round-2 cases and answered every render file on renders.invalid with 404. The backend URL is a dead port.',
        'NOT exercised: the Fastify backend — templateSource.versionNumber, per-job test and the failure sentences are the backend agent’s. Real: Chrome, the minted StarCraft session, the server-rendered brand context, and every Render-ledger component.',
      ],
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

async function settle(testInfo: TestInfo, checks: () => void): Promise<void> {
  let problem: unknown = null;
  try {
    if (testInfo.status === 'passed') checks();
  } catch (error) {
    problem = error;
  } finally {
    await Promise.all(opened.splice(0).map((context) => context.close().catch(() => undefined)));
    activeFixtures.length = 0;
    recordGrade(testInfo, problem);
  }
  if (problem) throw problem;
}

// --- the jobs ------------------------------------------------------------------------------

const file = (fileName: string, kind: 'image' | 'video', mimeType: string, url?: string) => ({
  id: fileName.replace(/\W/g, '_'),
  kind,
  fileName,
  mimeType,
  url: url ?? `${FILES_HOST}/${fileName}`,
  width: null,
  height: null,
  assetId: null,
  versionId: null,
});

const fitIn = (comp: typeof SQUARE) => ({
  comp,
  slots: [],
  escalate: false,
  why: 'no image slots',
});

function ledgerJobs(): ApiRenderJob[] {
  const job = (overrides: Record<string, unknown>) =>
    apiRenderJobSchema.parse({
      id: randomUUID(),
      brandId: STARCRAFT_BRAND_ID,
      templateKey: FORGE_FIXTURE.promo.templateKey,
      templateName: FORGE_FIXTURE.promo.title,
      contractHash: 'sc-promo-v1-contract-hash',
      taskUid: `task_${randomUUID().slice(0, 8)}`,
      status: 'finished',
      outputs: [],
      delivery: [],
      error: null,
      createdAt: '2026-09-14T10:00:00.000Z',
      updatedAt: '2026-09-14T10:02:00.000Z',
      finishedAt: '2026-09-14T10:02:00.000Z',
      renderSetId: null,
      renderSetName: FORGE_FIXTURE.set.name,
      ...overrides,
    });
  return [
    job({
      label: LABEL.expired,
      labelPath: [LABEL.expired],
      status: 'failed',
      error: SENTENCE,
      createdAt: '2026-09-14T10:04:00.000Z',
      outputs: [file('Square_1080_exp1ab.png', 'image', 'image/png')],
      fit: fitIn(SQUARE),
    }),
    job({
      label: LABEL.legacy,
      labelPath: [LABEL.legacy],
      status: 'failed',
      error: 'render_error',
      createdAt: '2026-09-14T10:03:00.000Z',
    }),
    job({
      label: LABEL.final,
      labelPath: [LABEL.final],
      test: false,
      // Midday UTC, so the day reads Sep 10 in every timezone the browser runs in.
      createdAt: '2026-09-10T12:00:00.000Z',
      templateSource: {
        assetId: FORGE_FIXTURE.promo.assetId,
        versionId: randomUUID(),
        sha256: SHA,
        versionNumber: 2,
      },
      outputs: [file('Square_1080_fin1ab.png', 'image', 'image/png', PIXEL_PNG)],
      fit: fitIn(SQUARE),
    }),
    job({
      label: LABEL.reel,
      labelPath: [LABEL.reel],
      createdAt: '2026-09-14T10:01:00.000Z',
      // The fleet's order: the MXF first, which no browser plays.
      outputs: [
        file('Story_1080x1920_rl1ab.mxf', 'video', 'application/mxf'),
        file('Story_1080x1920_rl1ab.mov', 'video', 'video/quicktime'),
        file('Story_1080x1920_rl1ab.mp4', 'video', 'video/mp4'),
      ],
      fit: fitIn(STORY),
    }),
  ];
}

// --- page helpers --------------------------------------------------------------------------

async function openLedger(page: Page): Promise<Locator> {
  await page.goto('/forge', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 180_000,
  });
  const tab = page.getByRole('tab', { name: 'Render ledger', exact: true });
  // A click before hydration does nothing; retry until the tab really is selected.
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
  return page.getByRole('tabpanel', { name: 'Render ledger' });
}

/** Images that finished loading with nothing to draw — what a person sees as a broken icon. */
const brokenImages = (scope: Locator) =>
  scope.evaluate((root) =>
    [...root.querySelectorAll('img')]
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.getAttribute('src')),
  );

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page
    .screenshot({ path: resolve(SHOTS_DIR, `ledger-r2-${name}.png`) })
    .catch(() => undefined);
}

// --- the run -------------------------------------------------------------------------------

test.beforeAll(async () => {
  test.setTimeout(120_000);
  session = await mintSessionBundleForEmail(OWNER_EMAIL);
  await pinSessionToStarCraft(session.accessToken);
});

test.afterAll(async () => {
  if (session) {
    const admin = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.auth.admin.signOut(session.accessToken, 'local').catch(() => undefined);
    session = null;
  }
  printEnvelope();
});

test.describe('Render ledger round 2 — fixtures', () => {
  test.skip(LIVE, 'the ledger round-2 bench runs on fixtures only');

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterEach(async ({}, testInfo) => {
    const fixtures = [...activeFixtures];
    await settle(testInfo, () => {
      for (const fixture of fixtures) {
        expect(fixture.violations, 'a body the real contract refuses').toEqual([]);
        expect([...fixture.brandIds], 'every Forge request is scoped to StarCraft').toEqual([
          STARCRAFT_BRAND_ID,
        ]);
      }
    });
  });

  test('L1 · Rev N, Proof/Final, whole failure sentences, every file per format, and no broken image', async ({
    browser,
  }) => {
    if (!session) throw new Error('[ledger-r2-bench] no minted session');
    const context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1280, height: 800 },
    });
    opened.push(context);
    const fixtures = await installForgeFixtures(context);
    activeFixtures.push(fixtures);
    fixtures.state.jobs = ledgerJobs();
    // Every render file's signed link has expired.
    const fileHits: string[] = [];
    await context.route(`${FILES_HOST}/**`, async (route) => {
      fileHits.push(route.request().url());
      await route.fulfill({ status: 404, body: 'Not found' });
    });
    const page = await context.newPage();
    const ledger = await openLedger(page);
    const row = (label: string) =>
      ledger.getByRole('row').filter({ has: page.getByText(label, { exact: true }) });

    // Template version: the source revision and the day, the full digest one hover away.
    await expect(ledger.getByRole('columnheader', { name: 'Template version' })).toBeVisible();
    const rev = row(LABEL.final).getByText('Rev 2 · Sep 10', { exact: true });
    await expect(rev).toBeVisible();
    await expect(rev).toHaveAttribute('title', `Template version ${SHA}`);

    // Proof and Final.
    await expect(row(LABEL.final).getByText('Final', { exact: true })).toBeVisible();
    await expect(row(LABEL.reel).getByText('Proof', { exact: true })).toBeVisible();

    // Every failure, whole: the backend's sentence, and the legacy code in words.
    await expect(row(LABEL.expired).getByText(SENTENCE, { exact: true })).toBeVisible();
    await expect(row(LABEL.legacy).getByText(LEGACY_SENTENCE, { exact: true })).toBeVisible();
    await expect(ledger).not.toContainText('render_error');

    // One comp as three files.
    await expect(row(LABEL.reel)).toContainText('1 MP4 · 1 MOV · 1 MXF');

    // The expired thumbnail was really asked for, and then replaced by the tile.
    await expect
      .poll(() => fileHits.some((url) => url.endsWith('Square_1080_exp1ab.png')))
      .toBe(true);
    await expect(row(LABEL.expired).locator('img')).toHaveCount(0);
    await expect.poll(() => brokenImages(ledger)).toEqual([]);
    // The Final's thumbnail still loads: the fallback is for broken files only.
    await expect(row(LABEL.final).locator('img')).toHaveCount(1);
    await shoot(page, 'ledger');

    // The reel: every file downloadable, and a player that cannot play says so.
    await row(LABEL.reel).getByText(LABEL.reel, { exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: LABEL.reel })).toBeVisible();
    for (const type of ['MP4', 'MOV', 'MXF']) {
      await expect(page.getByRole('link', { name: `Download ${type}` })).toHaveAttribute(
        'href',
        `${FILES_HOST}/Story_1080x1920_rl1ab.${type.toLowerCase()}`,
      );
    }
    await expect(
      page.getByText('This browser can’t play this file. Download it below.'),
    ).toBeVisible();
    await shoot(page, 'reel-detail');

    // The failed job: its whole sentence on the Render check, its expired file as words.
    await page.getByRole('button', { name: /All renders/ }).click();
    await row(LABEL.expired).getByText(LABEL.expired, { exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: LABEL.expired })).toBeVisible();
    const renderCheck = page
      .getByRole('list', { name: 'Checks' })
      .getByRole('listitem')
      .filter({ hasText: 'The render farm builds each format.' });
    await expect(renderCheck.getByText(SENTENCE, { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        'This file can’t be shown — its link may have expired. Refresh to get a new one.',
      ),
    ).toBeVisible();
    await expect.poll(() => brokenImages(ledger)).toEqual([]);
    await shoot(page, 'failed-detail');
  });
});
