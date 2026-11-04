import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type ApiRenderBatchPreflightRequest,
  renderApprovalDestinationListResponseSchema,
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
  type FixtureOverride,
  type ForgeFixtures,
  installForgeFixtures,
  STARCRAFT_BRAND_ID,
} from './support/forge-studio-fixtures';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// forge:studio:e2e:bench — the Render tab's confirmation, in a real Chrome.
//
// Same harness as render-grid.forge-studio.bench.spec.ts: a real minted StarCraft session, the
// server-rendered /forge page and brand context (which is where the person's brand role comes
// from), every /api/ai-studio/** call answered by contract-parsed fixtures, the backend a dead
// port. This file adds one approval room through `context.route`, the brand's usual one.
//
// It proves:
//   CONF1 (1280×800, 1920×1200) — the toolbar Render opens ONE dialog and opening it checks the
//     batch ONCE; the set's (here: the brand's default) room and Proof/Final read back; asking for
//     Final re-checks and reaches the signed batch preflight; Render files creates one batch from
//     that token; no native <select>; the fired row's Status reads Rendering.
//   CONF2 (1440×900) — the three refusals a person may render through (missing fonts, a split
//     headline's line count, an off-palette colour) read "Needs your call" in the grid, never
//     Rejected; in the dialog each is one "Render anyway" tick, and each tick re-sends the batch
//     preflight with exactly its own `accept*` flag until the batch is ready and renders.
//   CONF3 (1440×900) — a blank required field reads "Needs input"; an over-length headline reads
//     as a warning that still renders ("Will render · may shrink or clip", "Ready · fit warning").
//
// It does NOT exercise the Fastify backend (its 403 on a Final for a non-admin), the fleet, Slack
// or Meta — the envelope says so.
//
// Usage:
//   cd Continuum-Frontend && FORGE_STUDIO_E2E_PORT=3413 \
//     FORGE_STUDIO_DIST_DIR=.next/forge-studio-e2e-s3 \
//     bun run forge:studio:e2e:bench -- e2e/confirm-r2.forge-studio.bench.spec.ts

const { publishableKey, serviceRoleKey } = loadProdSupabaseEnv();

const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const OWNER_EMAIL = 'duane@continuumai.agency';
const RUN_ID = process.env.FORGE_STUDIO_RUN_ID ?? String(Date.now());
const SHOTS_DIR = resolve(__dirname, '__screenshots__/forge-studio');
// Verification screenshots the reviewer reads; FORGE_SHOTS_DIR overrides.
const REVIEW_SHOTS_DIR = process.env.FORGE_SHOTS_DIR ?? '/tmp/forge-shots';
// Shared with the other forge-studio specs: one run, one results file, one complete envelope.
const RESULTS_PATH = join(tmpdir(), `forge-studio-bench-${RUN_ID}.jsonl`);

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1920, height: 1200 },
] as const;
const REVIEW_VIEWPORT = { width: 1440, height: 900 } as const;

const ROWS = FORGE_FIXTURE.set.rows;
const ROOM = {
  id: '5e6f7081-92a3-4b45-8c6d-7e8f90123456',
  platform: 'slack' as const,
  role: 'client',
  name: 'forge-render-testing',
  activeApprovers: 1,
  requestedApprovers: 0,
};
/** The order the backend checks them in, which is the order the fixtures refuse them in. */
const OVERRIDES: Array<{ flag: FixtureOverride; label: RegExp }> = [
  { flag: 'acceptMissingFonts', label: /^Render anyway — a typeface isn’t held$/ },
  {
    flag: 'acceptLinkedLineMismatch',
    label: /^Render anyway — a split headline has the wrong number of lines$/,
  },
  {
    flag: 'acceptOffPaletteColor',
    label: /^Render anyway — a colour is outside the brand palette$/,
  },
];

let session: MintedSession | null = null;
const opened: BrowserContext[] = [];
const activeFixtures: ForgeFixtures[] = [];

// --- session and envelope (the pattern of render-grid.forge-studio.bench.spec.ts) --------------

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('[confirm-r2-bench] access token has no payload');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    session_id?: string;
  };
  if (!claims.sub || !claims.session_id) {
    throw new Error('[confirm-r2-bench] access token carries no sub or session_id claim');
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
  if (error) throw new Error(`[confirm-r2-bench] session brand pin failed: ${error.message}`);
  const { data, error: resolveError } = await member
    .schema('brand_profiles')
    .rpc('resolve_active_brand_for_session');
  if (resolveError || data !== STARCRAFT_BRAND_ID) {
    throw new Error(
      `[confirm-r2-bench] the session resolves to ${String(data)} (${resolveError?.message ?? 'no error'}), not StarCraft`,
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
        'FIXTURES: every /api/ai-studio/** call was answered in the browser by fixtures parsed through the real contracts, plus one approval room added by confirm-r2.forge-studio.bench.spec.ts; the backend URL is a dead port.',
        'NOT exercised: the Fastify backend (including its owner/admin refusal of a Final), the render fleet, Slack and Meta. Real: Chrome, the minted StarCraft session, the server-rendered brand context and role, and every Render-tab component.',
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

// --- page helpers --------------------------------------------------------------------------

/** The brand's approval room, pre-selected the way the backend's `defaultDestinationIds` does. */
async function answerApprovalRooms(context: BrowserContext) {
  const body = renderApprovalDestinationListResponseSchema.parse({
    destinations: [ROOM],
    defaultDestinationIds: [ROOM.id],
  });
  await context.route(
    (url) => url.pathname === '/api/ai-studio/renders/approval-destinations',
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

async function openRenderTab(
  browser: Browser,
  viewport: { width: number; height: number },
  refuse: FixtureOverride[] = [],
): Promise<{ page: Page; fixtures: ForgeFixtures }> {
  if (!session) throw new Error('[confirm-r2-bench] no minted session');
  const context = await browser.newContext({ storageState: session.state, viewport });
  opened.push(context);
  const fixtures = await installForgeFixtures(context, { refuse });
  activeFixtures.push(fixtures);
  // Registered after the fixtures, so it answers first.
  await answerApprovalRooms(context);
  const page = await context.newPage();
  await page.goto('/forge', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 180_000,
  });
  const tab = page.getByRole('tab', { name: 'Render', exact: true });
  // A click before hydration does nothing; retry until the tab really is selected.
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
  return { page, fixtures };
}

/** A grid row, found by its drag handle — the one control named after the row. */
const gridRow = (page: Page, label: string): Locator =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Drag ${label}`, exact: true }) });

const batchPreflights = (fixtures: ForgeFixtures) =>
  fixtures
    .calls('POST', /\/renders\/batch-preflight$/)
    .map((call) => call.body as ApiRenderBatchPreflightRequest);

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page
    .screenshot({ path: resolve(SHOTS_DIR, `confirm-r2-${name}.png`) })
    .catch(() => undefined);
}

/** Scrolls the grid's own sideways scroller to one end, so a shot shows those columns. */
const scrollGrid = (page: Page, to: 'start' | 'end') =>
  page.getByTestId('render-grid').evaluate((grid, end) => {
    const scroller = grid.querySelector('table')?.closest('.overflow-auto');
    scroller?.scrollTo({ left: end ? scroller.scrollWidth : 0 });
  }, to === 'end');

async function review(page: Page, name: string): Promise<void> {
  mkdirSync(REVIEW_SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(REVIEW_SHOTS_DIR, `${name}.png`) });
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

test.describe('Render confirmation, round 2 — fixtures', () => {
  test.skip(LIVE, 'the confirmation bench runs on fixtures only');

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

  for (const viewport of VIEWPORTS) {
    const size = `${viewport.width}x${viewport.height}`;

    test(`CONF1 · ${size} · one dialog, one check on open, a Final that reaches the signed preflight`, async ({
      browser,
    }) => {
      const { page, fixtures } = await openRenderTab(browser, viewport);
      const root = gridRow(page, ROWS.root);
      await expect(root.getByText('Ready', { exact: true })).toBeVisible();
      await root.getByRole('checkbox', { name: 'Select row' }).click();

      await page
        .getByRole('toolbar', { name: 'Render' })
        .getByRole('button', { name: 'Render 1 row · 2 files', exact: true })
        .click();
      const confirm = page.getByRole('dialog', { name: 'Render 1 row · 2 files' });
      await expect(confirm).toBeVisible();
      // Where it goes reads back as one line: the Library and the brand's room.
      await expect(confirm.getByText(`· #${ROOM.name} approval`)).toBeVisible();
      await expect(confirm.getByRole('list', { name: 'Meta ads' })).toHaveCount(0);
      const fire = confirm.getByRole('button', { name: 'Render 2 files', exact: true });
      await expect(fire).toBeEnabled();
      // Opening checked the batch once — no separate review pass first.
      expect(batchPreflights(fixtures)).toHaveLength(1);
      expect(batchPreflights(fixtures)[0]?.final).toBeUndefined();
      expect(batchPreflights(fixtures)[0]?.approvalDestinationIds).toEqual([ROOM.id]);
      await expect(confirm.locator('select')).toHaveCount(0);
      const outputs = confirm.getByRole('list', { name: 'Output per row' });
      await expect(outputs.getByRole('listitem')).toHaveCount(1);
      await expect(outputs).toContainText('Still image');
      const final = confirm.getByRole('radio', { name: 'Final', exact: true });
      await expect(final, 'the StarCraft owner may render a Final').toBeEnabled();
      await expect(confirm.getByRole('radio', { name: 'Proof', exact: true })).toBeChecked();
      await shoot(page, `${size}-open`);

      // Final changes what would be signed, so it is checked again — once.
      await final.click();
      await expect(final).toBeChecked();
      await expect.poll(() => batchPreflights(fixtures).length).toBe(2);
      await expect(fire).toBeEnabled();
      await fire.click();
      await expect.poll(() => fixtures.calls('POST', /\/renders\/batches$/).length).toBe(1);
      const signed = batchPreflights(fixtures).at(-1);
      expect(signed?.final, 'Final is in the preflight the token is signed from').toBe(true);
      expect(signed?.approvalDestinationIds).toEqual([ROOM.id]);
      expect(signed?.records.map((record) => record.label)).toEqual([ROWS.root]);
      expect(batchPreflights(fixtures)).toHaveLength(2);

      // The dialog closes; the fired row's Status follows it, still on the Render tab.
      await expect(confirm).toBeHidden();
      await expect(root.getByText('Rendering', { exact: true })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Render', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await shoot(page, `${size}-running`);
    });
  }

  test('CONF2 · 1440x900 · refusals a person may render through are calls, one tick each', async ({
    browser,
  }) => {
    const { page, fixtures } = await openRenderTab(
      browser,
      REVIEW_VIEWPORT,
      OVERRIDES.map(({ flag }) => flag),
    );
    const root = gridRow(page, ROWS.root);
    // The grid's own check is refused for a font: a question for Render, not a rejected row.
    await expect(root.getByText('Needs your call', { exact: true })).toBeVisible();
    await expect(root.getByText('Rejected', { exact: true })).toHaveCount(0);
    await scrollGrid(page, 'end');
    await review(page, 'needs-your-call');

    await root.getByRole('checkbox', { name: 'Select row' }).click();
    const render = page
      .getByRole('toolbar', { name: 'Render' })
      .getByRole('button', { name: 'Render 1 row · 2 files', exact: true });
    await expect(render, 'a row that needs a call still goes to the confirmation').toBeEnabled();
    await render.click();
    const confirm = page.getByRole('dialog', { name: 'Render 1 row · 2 files' });
    await expect(confirm).toBeVisible();
    const fire = confirm.getByRole('button', { name: 'Render 2 files', exact: true });

    // Each refusal is one tick; each tick re-checks with exactly its flag added.
    for (const [index, { flag, label }] of OVERRIDES.entries()) {
      const tick = confirm.getByRole('checkbox', { name: label });
      await expect(tick).toBeVisible();
      await expect(tick).not.toBeChecked();
      await expect(fire).toBeDisabled();
      if (index === OVERRIDES.length - 1) await review(page, 'confirm-overrides');
      const sent = batchPreflights(fixtures).length;
      await tick.click();
      await expect(tick).toBeChecked();
      await expect.poll(() => batchPreflights(fixtures).length).toBe(sent + 1);
      const body = batchPreflights(fixtures).at(-1);
      for (const [other, { flag: otherFlag }] of OVERRIDES.entries()) {
        expect(body?.[otherFlag], `${otherFlag} after ticking ${flag}`).toBe(
          other <= index ? true : undefined,
        );
      }
    }

    // Every call made: the batch is ready, and renders.
    await expect(fire).toBeEnabled();
    await fire.click();
    await expect.poll(() => fixtures.calls('POST', /\/renders\/batches$/).length).toBe(1);
    await expect(confirm).toBeHidden();
  });

  test('CONF3 · 1440x900 · blank required reads Needs input; an over-length headline still renders', async ({
    browser,
  }) => {
    const { page } = await openRenderTab(browser, REVIEW_VIEWPORT);
    const root = gridRow(page, ROWS.root);
    await expect(root.getByText('Ready', { exact: true })).toBeVisible();

    const fills = root.getByRole('button', { name: 'Continuum fills this' });
    await fills.hover();
    await expect(
      page.getByText('The brand’s logo, filled in automatically at render time.'),
    ).toBeVisible();

    const headline = root.getByRole('textbox', {
      name: FORGE_FIXTURE.variables.headline,
      exact: true,
    });
    await headline.fill('');
    const status = root.getByText('Needs input', { exact: true });
    await expect(status).toBeVisible();
    await expect(status).toHaveAttribute('title', 'Fill in Headline');
    await expect(root.getByText('Invalid', { exact: true })).toHaveCount(0);
    await shoot(page, 'needs-input');

    // 40 characters into a 28-character headline: a warning that still renders, never a block.
    await headline.fill('Build your army across the Koprulu now!!');
    await expect(root.getByLabel('Will render · may shrink or clip')).toBeVisible();
    await expect(root.getByText('Ready · fit warning', { exact: true })).toBeVisible();
    await expect(root.getByText('40/28', { exact: true })).toBeVisible();
    await root.getByRole('checkbox', { name: 'Select row' }).click();
    await expect(
      page
        .getByRole('toolbar', { name: 'Render' })
        .getByRole('button', { name: 'Render 1 row · 2 files', exact: true }),
    ).toBeEnabled();
    await scrollGrid(page, 'start');
    await review(page, 'fit-warning');
    await scrollGrid(page, 'end');
    await review(page, 'fit-warning-status');
  });
});
