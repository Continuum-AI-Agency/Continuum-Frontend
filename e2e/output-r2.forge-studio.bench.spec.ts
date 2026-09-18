import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type ApiRenderBatchPreflightRequest,
  type ApiRenderTemplateContract,
  apiRenderTemplateContractSchema,
  apiRenderTemplateSummarySchema,
} from '@continuum/contracts';
import {
  type Browser,
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

// forge:studio:e2e:bench — output settings (frame rate, files) in a real Chrome.
//
// Same harness as the other forge-studio specs: a real minted StarCraft session, the server-rendered
// /forge page, every /api/ai-studio/** call answered by contract-parsed fixtures, the backend a dead
// port. On top of those fixtures this file answers the promo template's contract twice over:
//
//   VIDEO  — two MP4 outputs at 30 fps, with output settings published. A row asks for 25 fps and
//            an extra MXF file in its Output cell; the batch preflight must carry both.
//   STILLS — the same outputs as JPG comps (what StarCraft template 133 is). The template sheet's
//            Output tab must say settings apply to animated formats, and offer nothing else.
//
// Both prove the page has no native <select> left. NOT exercised: the Fastify backend, the forge
// validator and the render fleet that turn `files.mxf` into a real .mxf — the envelope says so.
//
// Usage:
//   cd Continuum-Frontend && FORGE_STUDIO_E2E_PORT=3417 \
//     FORGE_STUDIO_DIST_DIR=.next/forge-studio-e2e-s7 \
//     bun run forge:studio:e2e:bench -- e2e/output-r2.forge-studio.bench.spec.ts

const { publishableKey, serviceRoleKey } = loadProdSupabaseEnv();

const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const OWNER_EMAIL = 'duane@continuumai.agency';
const RUN_ID = process.env.FORGE_STUDIO_RUN_ID ?? String(Date.now());
const SHOTS_DIR = resolve(__dirname, '__screenshots__/forge-studio');
// Shared with the other forge-studio specs: one run, one results file, one complete envelope.
const RESULTS_PATH = join(tmpdir(), `forge-studio-bench-${RUN_ID}.jsonl`);
const VIEWPORT = { width: 1280, height: 800 };
const PROMO = FORGE_FIXTURE.promo;
const STILLS_NOTE =
  'Stills take no output settings. Frame rate and files apply to animated formats.';

let session: MintedSession | null = null;
const opened: BrowserContext[] = [];
const activeFixtures: ForgeFixtures[] = [];

// --- session and envelope (the pattern of render-grid.forge-studio.bench.spec.ts) --------------

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('[output-bench] access token has no payload');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    session_id?: string;
  };
  if (!claims.sub || !claims.session_id) {
    throw new Error('[output-bench] access token carries no sub or session_id claim');
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
  if (error) throw new Error(`[output-bench] session brand pin failed: ${error.message}`);
  const { data, error: resolveError } = await member
    .schema('brand_profiles')
    .rpc('resolve_active_brand_for_session');
  if (resolveError || data !== STARCRAFT_BRAND_ID) {
    throw new Error(
      `[output-bench] the session resolves to ${String(data)} (${resolveError?.message ?? 'no error'}), not StarCraft`,
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
        'FIXTURES: every /api/ai-studio/** call was answered in the browser by fixtures parsed through the real contracts, plus a video and a stills contract for the promo template added by output-r2.forge-studio.bench.spec.ts; the backend URL is a dead port.',
        'NOT exercised: the Fastify backend, the forge validator and the render fleet that encode the requested MP4/MOV/MXF files. Real: Chrome, the minted StarCraft session, the server-rendered brand context, the Output cell, the template sheet Output tab and the batch preflight body.',
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

// --- the two contracts -------------------------------------------------------------------------

const variables = [
  {
    key: 'headline',
    label: 'Headline',
    kind: 'text',
    required: true,
    charBudget: 28,
    sample: 'Build your army',
  },
  {
    key: 'tagline',
    label: 'Tagline',
    kind: 'text',
    required: false,
    sample: 'In the Koprulu sector',
  },
  { key: 'price', label: 'Price', kind: 'number', required: false, sample: '19.99' },
  { key: 'hero', label: 'Hero image', kind: 'image', required: false },
];

function promoContract(mediaType: string, motion: { durationSec: number; frameRate: number }) {
  return apiRenderTemplateContractSchema.parse({
    template: apiRenderTemplateSummarySchema.parse({
      key: PROMO.templateKey,
      name: PROMO.templateKey,
      environment: 'Continuum_app',
      contractVersion: '1',
      // The fixtures' preflight answers for the promo hash.
      contractHash: 'sc-promo-v1-contract-hash',
      contractSource: 'template_forge',
      outputKinds: ['image'],
      variableCount: variables.length,
      previewUrl: null,
      updatedAt: '2026-09-14T09:00:00.000Z',
      ratios: ['1:1', '9:16'],
      displayName: PROMO.title,
      motion,
    }),
    variables,
    // `encode` per output is what the Output cell shows as inherited: the fleet default here.
    outputs: [
      { id: 'square', label: 'Square', ratio: '1:1', mediaType, frameRate: motion.frameRate },
      { id: 'story', label: 'Story', ratio: '9:16', mediaType, frameRate: motion.frameRate },
    ].map((output) => ({ ...output, encode: { fps: 'comp' } })),
    // Published even for the stills: the explanation must win over knobs that would do nothing.
    encode: {
      stored: null,
      defaults: {
        mp4: { fps: 'comp', audio: { codec: 'aac', sampleRate: 48000 } },
        mov: { fps: 'comp', video: { proresProfile: '4444' } },
      },
    },
  });
}

const VIDEO_CONTRACT: ApiRenderTemplateContract = promoContract('MP4 Video (RGB)', {
  durationSec: 6,
  frameRate: 30,
});
const STILLS_CONTRACT: ApiRenderTemplateContract = promoContract('JPG image (RGB)', {
  durationSec: 1 / 30,
  frameRate: 30,
});

/** Answers the promo contract GET the way the fixtures do: cross-origin, JSON, CORS headers on. */
async function answerContract(context: BrowserContext, body: ApiRenderTemplateContract) {
  await context.route(
    (url) => url.pathname === `/api/ai-studio/renders/templates/${PROMO.templateKey}/contract`,
    async (route) => {
      const origin = (await route.request().headerValue('origin')) ?? '*';
      const cors = {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'Content-Type, Authorization, Accept',
        'access-control-allow-methods': 'GET, OPTIONS',
      };
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
  );
}

async function openForge(
  browser: Browser,
  contract: ApiRenderTemplateContract,
): Promise<{ page: Page; fixtures: ForgeFixtures }> {
  if (!session) throw new Error('[output-bench] no minted session');
  const context = await browser.newContext({ storageState: session.state, viewport: VIEWPORT });
  opened.push(context);
  const fixtures = await installForgeFixtures(context);
  activeFixtures.push(fixtures);
  // Registered after the fixtures, so it answers first.
  await answerContract(context, contract);
  const page = await context.newPage();
  await page.goto('/forge', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 180_000,
  });
  return { page, fixtures };
}

/** A click before hydration does nothing; retry until the control really took. */
async function untilItTakes(act: () => Promise<void>, took: () => Promise<void>) {
  await expect(async () => {
    await act();
    await took();
  }).toPass({ timeout: 60_000 });
}

/** A grid row, found by its drag handle — the one control named after the row. */
const gridRow = (page: Page, label: string): Locator =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Drag ${label}`, exact: true }) });

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS_DIR, `output-${name}.png`) }).catch(() => undefined);
}

// --- the run -------------------------------------------------------------------------------------

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

test.describe('Output settings — fixtures', () => {
  test.skip(LIVE, 'the output settings bench runs on fixtures only');

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

  test('OUT1 · a row set to 25 fps + MXF sends both in the batch preflight', async ({
    browser,
  }) => {
    const { page, fixtures } = await openForge(browser, VIDEO_CONTRACT);
    const tab = page.getByRole('tab', { name: 'Render', exact: true });
    await untilItTakes(
      () => tab.click(),
      () => expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 }),
    );
    const root = gridRow(page, FORGE_FIXTURE.set.rows.root);
    await expect(root.getByText('Ready', { exact: true })).toBeVisible();

    const cell = root.getByRole('button', { name: /^Output settings: / });
    await expect(cell).toHaveText('Template default');
    await cell.click();
    const settings = page.getByRole('dialog');
    await expect(settings.getByRole('checkbox', { name: 'MP4' })).toBeChecked();
    await expect(settings.getByRole('checkbox', { name: 'MP4' })).toBeDisabled();
    await expect(
      settings.getByText('MP4 stays on: every render delivers at least one file.'),
    ).toBeVisible();

    await settings.getByRole('combobox', { name: 'Frame rate' }).click();
    const rates = page.getByRole('listbox');
    await expect(rates.getByRole('option')).toHaveText([
      'Inherited: Match the comp',
      'Match the comp',
      '23.976 fps',
      '24 fps',
      '25 fps',
      '29.97 fps',
      '30 fps',
      '50 fps',
      '59.94 fps',
      '60 fps',
    ]);
    await rates.getByRole('option', { name: '25 fps', exact: true }).click();
    await expect(settings.getByRole('combobox', { name: 'Frame rate' })).toHaveText(/^25 fps/);

    // MXF on: the popover stays open, MP4 may now go, and the cell reads the summary.
    await settings.getByText('MXF (DNxHR)', { exact: true }).click();
    await expect(settings.getByRole('checkbox', { name: 'MXF (DNxHR)' })).toBeChecked();
    await expect(settings.getByRole('checkbox', { name: 'MP4' })).toBeEnabled();
    await expect(settings.getByRole('combobox', { name: 'ProRes profile' })).toHaveCount(0);
    await expect(settings.getByRole('combobox', { name: 'Audio codec' })).toBeVisible();
    await expect(page.locator('select'), 'no native select is left').toHaveCount(0);
    await shoot(page, 'cell-25fps-mxf');
    await page.keyboard.press('Escape');
    await expect(cell).toHaveText('25 fps · MP4 + MXF');

    await expect(root.getByText('Ready', { exact: true })).toBeVisible();
    await root.getByRole('checkbox', { name: 'Select row' }).click();
    await page.getByRole('button', { name: /^Render 1 row · / }).click();
    await expect
      .poll(() => fixtures.calls('POST', /\/renders\/batch-preflight$/).length)
      .toBeGreaterThan(0);
    const reviewed = fixtures.calls('POST', /\/renders\/batch-preflight$/).at(-1)
      ?.body as ApiRenderBatchPreflightRequest;
    expect(reviewed.records).toHaveLength(1);
    expect(reviewed.records[0]?.encode?.default?.fps).toBe(25);
    expect(reviewed.records[0]?.encode?.default?.files?.mxf).toBe(true);
    await shoot(page, 'tray-review');
  });

  test('OUT2 · a stills-only template says settings apply to animated formats', async ({
    browser,
  }) => {
    const { page } = await openForge(browser, STILLS_CONTRACT);
    const card = page.getByRole('button', { name: `Open ${PROMO.title}`, exact: true });
    const title = page.getByRole('heading', { level: 2 }).filter({ hasText: PROMO.title });
    await untilItTakes(
      () => card.click(),
      () => expect(title).toBeVisible({ timeout: 2_000 }),
    );
    const output = page.getByRole('tab', { name: 'Output', exact: true });
    await output.click();
    await expect(output).toHaveAttribute('aria-selected', 'true');
    const panel = page.getByRole('tabpanel', { name: 'Output' });
    await expect(panel.getByText(STILLS_NOTE, { exact: true })).toBeVisible();
    await expect(panel).toHaveText(STILLS_NOTE);
    await expect(page.locator('select'), 'no native select is left').toHaveCount(0);
    await shoot(page, 'sheet-stills');
  });
});
