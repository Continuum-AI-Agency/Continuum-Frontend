import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type ApiRenderBatchPreflightRequest,
  forgeRenderSetSchema,
  renderApprovalDestinationListResponseSchema,
  type UpdateForgeRenderSetRequest,
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
  type FixtureMeta,
  type ForgeFixtures,
  installForgeFixtures,
  STARCRAFT_BRAND_ID,
} from './support/forge-studio-fixtures';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// forge:studio:e2e:bench — the Render tab's set tabs and set delivery, in a real Chrome.
//
// Same harness as forge-studio.bench.spec.ts: a real minted StarCraft session, the server-rendered
// /forge page, every /api/ai-studio/** call answered by contract-parsed fixtures and the backend a
// dead port. The fixtures' set PUT keeps `description` and `settings` the way the backend does. On
// top of them this file adds a second saved set (TEASER), more sets for the overflow case, and the
// brand's approval room through `context.route`.
//
// It proves:
//   TABS1 (1280×800, 1920×1200) — sets are tabs over a full-width grid: both listed with row counts,
//     the open one selected; no rail and no Save button; Esc drops a description edit with no
//     request; Enter sends exactly one PUT carrying the description and the revision; switching
//     with unsaved grid edits saves them first; the toolbar Render opens one confirmation dialog.
//   TABS2 (1440×900) — with 14 sets the strip scrolls sideways (the page never does), "All sets"
//     jumps to a set by filter, and the opened tab is scrolled into view.
//   TABS3 (1440×900) — set delivery: a default ad set chosen in Set settings is saved with the
//     set (one PUT: settings + revision); rows read "Set default"; one row is pointed at an ad to
//     replace from its Destination cell; Render's confirmation lists one new ad per default row and
//     the one replace, and the ONE batch preflight carries the default as the batch-level
//     `delivery` and the replace on its own record; Render fires and the Status column follows.
//
// It does NOT exercise the Fastify backend or Meta — the envelope says so.
//
// Usage:
//   cd Continuum-Frontend && FORGE_STUDIO_E2E_PORT=3142 \
//     FORGE_STUDIO_DIST_DIR=.next/forge-studio-e2e-tabs \
//     bun run forge:studio:e2e:bench -- e2e/set-tabs.forge-studio.bench.spec.ts

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
const LAUNCH = FORGE_FIXTURE.set.name;
const TEASER = 'Teaser cut';
const DESCRIPTION = 'Spain first, then Portugal';
const { campaign, adset, ad } = FORGE_FIXTURE.meta;
const AD_SET = `${campaign.name} › ${adset.name}`;
const ROOM = {
  id: '5e6f7081-92a3-4b45-8c6d-7e8f90123456',
  platform: 'slack' as const,
  role: 'client',
  name: 'forge-render-testing',
  activeApprovers: 1,
  requestedApprovers: 0,
};

let session: MintedSession | null = null;
const opened: BrowserContext[] = [];
const activeFixtures: ForgeFixtures[] = [];

// --- session and envelope (the pattern of forge-studio.bench.spec.ts) ------------------------

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('[set-tabs-bench] access token has no payload');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    session_id?: string;
  };
  if (!claims.sub || !claims.session_id) {
    throw new Error('[set-tabs-bench] access token carries no sub or session_id claim');
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
  if (error) throw new Error(`[set-tabs-bench] session brand pin failed: ${error.message}`);
  const { data, error: resolveError } = await member
    .schema('brand_profiles')
    .rpc('resolve_active_brand_for_session');
  if (resolveError || data !== STARCRAFT_BRAND_ID) {
    throw new Error(
      `[set-tabs-bench] the session resolves to ${String(data)} (${resolveError?.message ?? 'no error'}), not StarCraft`,
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
        'FIXTURES: every /api/ai-studio/** call was answered in the browser by fixtures parsed through the real contracts, plus more saved sets and the brand approval room added by set-tabs.forge-studio.bench.spec.ts; the backend URL is a dead port.',
        'NOT exercised: the Fastify backend, the render fleet and Meta. Real: Chrome, the minted StarCraft session, the server-rendered brand context, and every Render-tab component.',
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

// --- the added fixtures --------------------------------------------------------------------

/** A saved set of the promo template with one row, read the way the list endpoint returns it. */
function extraSet(fixtures: ForgeFixtures, name: string, label: string) {
  const [launch] = fixtures.state.sets;
  if (!launch) throw new Error('[set-tabs-bench] the fixtures carry no saved set');
  return forgeRenderSetSchema.parse({
    ...launch,
    id: randomUUID(),
    name,
    description: null,
    revision: 1,
    rows: [
      {
        id: randomUUID(),
        parentId: null,
        label,
        overrides: { headline: 'Coming soon' },
        clearedKeys: [],
        outputIds: [],
      },
    ],
    createdAt: '2026-09-11T09:00:00.000Z',
    updatedAt: '2026-09-11T09:00:00.000Z',
  });
}

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

// --- page helpers --------------------------------------------------------------------------

async function openPage(
  browser: Browser,
  viewport: { width: number; height: number },
  options: { meta?: FixtureMeta; extraSets?: number } = {},
): Promise<{ page: Page; fixtures: ForgeFixtures }> {
  if (!session) throw new Error('[set-tabs-bench] no minted session');
  const context = await browser.newContext({ storageState: session.state, viewport });
  opened.push(context);
  const fixtures = await installForgeFixtures(context, { meta: options.meta });
  activeFixtures.push(fixtures);
  fixtures.state.sets.push(extraSet(fixtures, TEASER, 'Teaser'));
  for (let index = 1; index <= (options.extraSets ?? 0); index += 1) {
    fixtures.state.sets.push(extraSet(fixtures, `Market ${index} — weekend push`, `M${index}`));
  }
  // Registered after the fixtures, so it answers first.
  await answerApprovalRooms(context);
  const page = await context.newPage();
  await openRenderTab(page);
  return { page, fixtures };
}

async function openRenderTab(page: Page): Promise<void> {
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
}

/** A grid row, found by its drag handle — the one control named after the row. */
const gridRow = (page: Page, label: string): Locator =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Drag ${label}`, exact: true }) });

const strip = (page: Page) => page.getByRole('tablist', { name: 'Render sets' });
/** A set's tab: its name, then its row count. */
const setTab = (page: Page, name: string) =>
  strip(page)
    .getByRole('tab')
    .filter({ has: page.getByText(name, { exact: true }) });

const puts = (fixtures: ForgeFixtures) =>
  fixtures
    .calls('PUT', /^\/api\/ai-studio\/renders\/sets\/[0-9a-f-]{36}$/)
    .map((call) => ({ setId: call.path.split('/').at(-1), body: call.body }));

/** Sideways overflow of the page and the app's scroll authority, in px. */
const overflow = (page: Page) =>
  page.evaluate(() => {
    const excess = (element: Element | null) =>
      element ? element.scrollWidth - element.clientWidth : 0;
    return { page: excess(document.documentElement), main: excess(document.querySelector('main')) };
  });

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS_DIR, `tabs-${name}.png`) }).catch(() => undefined);
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

test.describe('Set tabs — fixtures', () => {
  test.skip(LIVE, 'the set tabs bench runs on fixtures only');

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

    test(`TABS1 · ${size} · sets are tabs over the grid: describable, guarded, and Render confirms once`, async ({
      browser,
    }) => {
      const { page, fixtures } = await openPage(browser, viewport);

      // Every set at once, as tabs: its name and rows, the open one selected.
      await expect(gridRow(page, ROWS.root).getByText('Ready', { exact: true })).toBeVisible();
      await expect(strip(page).getByRole('tab')).toHaveCount(2);
      await expect(setTab(page, LAUNCH)).toContainText('6');
      await expect(setTab(page, TEASER)).toContainText('1');
      await expect(setTab(page, LAUNCH)).toHaveAttribute('aria-selected', 'true');
      await expect(setTab(page, TEASER)).toHaveAttribute('aria-selected', 'false');
      // The fixtures hold three promo jobs, all from Launch week, and no page behind them.
      await expect(page.getByText(/^3 renders · /)).toBeVisible();
      // No rail, no set picker in the toolbar, no Save button: autosave and its status remain.
      await expect(page.getByRole('list', { name: 'Render sets' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Hide render sets' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Render set', exact: true })).toHaveCount(0);
      const toolbar = page.getByRole('toolbar', { name: 'Render' });
      await expect(toolbar.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
      await expect(page.getByRole('status', { name: 'Save status' })).toBeVisible();
      expect(await overflow(page)).toEqual({ page: 0, main: 0 });
      await shoot(page, `${size}-open`);

      // Esc drops an edit and asks the server nothing.
      await page.getByRole('button', { name: 'Add a description', exact: true }).click();
      const field = page.getByRole('textbox', { name: `Description of ${LAUNCH}`, exact: true });
      await field.fill('Not this one');
      await expect(page.getByText('12/500', { exact: true })).toBeVisible();
      await field.press('Escape');
      await expect(field).toBeHidden();
      await expect(
        page.getByRole('button', { name: 'Add a description', exact: true }),
      ).toBeVisible();
      // A negative: give a stray request the time it would take to leave.
      await page.waitForTimeout(750);
      expect(puts(fixtures), 'Esc sends no request').toHaveLength(0);

      // Enter sends one PUT carrying only the description and the revision the set was read at.
      await page.getByRole('button', { name: 'Add a description', exact: true }).click();
      await field.fill(DESCRIPTION);
      await field.press('Enter');
      await expect(page.getByRole('button', { name: DESCRIPTION, exact: true })).toBeVisible();
      await expect.poll(() => puts(fixtures).length).toBe(1);
      expect(puts(fixtures)[0]?.setId).toBe(FORGE_FIXTURE.set.id);
      expect(puts(fixtures)[0]?.body).toEqual({
        brandId: STARCRAFT_BRAND_ID,
        expectedRevision: 3,
        description: DESCRIPTION,
      });

      // A reload reads the set list again, and the description is on it.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openRenderTab(page);
      await expect(page.getByRole('button', { name: DESCRIPTION, exact: true })).toBeVisible();
      await expect(gridRow(page, ROWS.root).getByText('Ready', { exact: true })).toBeVisible();
      expect(puts(fixtures)).toHaveLength(1);

      // Switching with unsaved grid edits saves them into the open set first, then switches —
      // nothing is asked, and nothing is lost: the edit is there on the way back.
      await gridRow(page, ROWS.root)
        .getByRole('textbox', { name: 'Row name', exact: true })
        .fill('Root EU');
      await setTab(page, TEASER).click();
      await expect(gridRow(page, 'Teaser')).toBeVisible();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect(setTab(page, TEASER)).toHaveAttribute('aria-selected', 'true');
      const rowSave = puts(fixtures).at(-1)?.body as UpdateForgeRenderSetRequest;
      expect(puts(fixtures)).toHaveLength(2);
      expect(rowSave.expectedRevision).toBe(4);
      expect(rowSave.rows?.map((row) => row.label)).toContain('Root EU');
      await setTab(page, LAUNCH).click();
      const renamed = gridRow(page, 'Root EU');
      await expect(renamed).toBeVisible();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      // Back to the name the rest of this run looks for.
      await renamed.getByRole('textbox', { name: 'Row name', exact: true }).fill(ROWS.root);
      await expect(gridRow(page, ROWS.root)).toBeVisible();

      // The toolbar Render opens ONE confirmation, and opening it checks the batch once.
      const root = gridRow(page, ROWS.root);
      await expect(root.getByText('Ready', { exact: true })).toBeVisible();
      await root.getByRole('checkbox', { name: 'Select row' }).click();
      const render = toolbar.getByRole('button', { name: /^Render 1 row · \d+ files?$/ });
      await expect(render).toBeEnabled();
      await render.click();
      const confirm = page.getByRole('dialog', { name: /^Render 1 row · \d+ files?$/ });
      await expect(confirm).toBeVisible();
      await expect(confirm.getByRole('button', { name: /^Render \d+ files?$/ })).toBeEnabled();
      expect(fixtures.calls('POST', /\/renders\/batch-preflight$/)).toHaveLength(1);
      expect(await overflow(page)).toEqual({ page: 0, main: 0 });
      await shoot(page, `${size}-confirm`);
      await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(confirm).toBeHidden();
      // Every PUT is one the person caused: the description, the edit saved before the switch, and
      // the name put back — each at the revision the one before it left, never a conflict.
      await expect
        .poll(() =>
          puts(fixtures).map(({ body }) => (body as { expectedRevision: number }).expectedRevision),
        )
        .toEqual([3, 4, 5]);
    });
  }

  test('TABS2 · 1440x900 · 14 sets scroll sideways in the strip, never the page; All sets jumps to one', async ({
    browser,
  }) => {
    const { page } = await openPage(browser, REVIEW_VIEWPORT, { extraSets: 12 });
    await expect(gridRow(page, ROWS.root).getByText('Ready', { exact: true })).toBeVisible();
    await expect(strip(page).getByRole('tab')).toHaveCount(14);

    // The strip is wider than its pane and scrolls; the page and the app's scroller do not.
    const sideways = await strip(page).evaluate((list) => list.scrollWidth - list.clientWidth);
    expect(sideways, 'the strip overflows and scrolls sideways').toBeGreaterThan(0);
    expect(await overflow(page)).toEqual({ page: 0, main: 0 });

    // "All sets" finds the last set by filter and opens it; its tab is scrolled into view.
    const last = 'Market 12 — weekend push';
    await page.getByRole('button', { name: 'All sets', exact: true }).click();
    await page.getByRole('combobox', { name: 'Filter render sets' }).fill('Market 12');
    await page.getByRole('option', { name: new RegExp(`^${last}`) }).click();
    await expect(gridRow(page, 'M12')).toBeVisible();
    const tab = setTab(page, last);
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(async () => {
        const [box, pane] = await Promise.all([tab.boundingBox(), strip(page).boundingBox()]);
        return Boolean(
          box && pane && box.x >= pane.x - 1 && box.x + box.width <= pane.x + pane.width + 1,
        );
      }, 'the opened tab is scrolled into the strip')
      .toBe(true);
    expect(
      await strip(page).evaluate((list) => list.scrollLeft),
      'the strip scrolled to reach it',
    ).toBeGreaterThan(0);
    expect(await overflow(page)).toEqual({ page: 0, main: 0 });
    await review(page, 'tabs-scrolled');
  });

  test('TABS3 · 1440x900 · a default ad set is saved with the set, rows follow it, one row replaces an ad', async ({
    browser,
  }) => {
    const { page, fixtures } = await openPage(browser, REVIEW_VIEWPORT, { meta: 'connected' });
    const root = gridRow(page, ROWS.root);
    await expect(root.getByText('Ready', { exact: true })).toBeVisible();
    await expect(
      root.getByRole('button', { name: `Destination for ${ROWS.root}: Library only` }),
    ).toBeVisible();

    // Set settings, from the open set's menu: a default ad set, chosen campaign → ad set.
    await page.getByRole('button', { name: `Actions for ${LAUNCH}`, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Settings…', exact: true }).click();
    const settings = page.getByRole('dialog', { name: `Delivery for “${LAUNCH}”` });
    await expect(settings).toBeVisible();
    await settings.getByRole('button', { name: 'Choose ad set', exact: true }).click();
    await settings.getByRole('button', { name: new RegExp(`^${campaign.name}`) }).click();
    await settings.getByRole('button', { name: new RegExp(`^${adset.name}`) }).click();
    await expect(settings.getByText(AD_SET, { exact: true })).toBeVisible();
    // The brand's approval room is seeded the way it always was.
    await expect(settings.getByRole('checkbox', { name: new RegExp(ROOM.name) })).toBeChecked();
    await settings.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(settings).toBeHidden();

    // One PUT: the settings, at the revision the set was read at — nothing written into rows.
    await expect.poll(() => puts(fixtures).length).toBe(1);
    const saved = puts(fixtures)[0]?.body as UpdateForgeRenderSetRequest;
    expect(saved.expectedRevision).toBe(3);
    expect(saved.rows).toBeUndefined();
    expect(saved.settings?.metaTarget).toEqual({
      action: 'create',
      adAccountId: FORGE_FIXTURE.meta.adAccountId,
      campaignId: campaign.id,
      campaignName: campaign.name,
      adsetId: adset.id,
      adsetName: adset.name,
      adStatus: 'PAUSED',
    });
    expect(saved.settings?.approvalDestinationIds).toEqual([ROOM.id]);

    // Every row without a target of its own now reads the set's default.
    const launch = gridRow(page, ROWS.launch);
    await expect(
      root.getByRole('button', { name: `Destination for ${ROWS.root}: Set default · ${AD_SET}` }),
    ).toBeVisible();
    await expect(
      launch.getByRole('button', {
        name: `Destination for ${ROWS.launch}: Set default · ${AD_SET}`,
      }),
    ).toBeVisible();
    await expect(page.getByText(`new paused ads in ${AD_SET}`)).toBeVisible();
    await scrollGrid(page, 'end');
    await review(page, 'destination-set-default');

    // One row replaces a specific ad instead, from its Destination cell.
    await launch
      .getByRole('button', { name: new RegExp(`^Destination for ${ROWS.launch}:`) })
      .click();
    // The popover holds the row's picker; its button reads "Change the ad" once an ad is picked.
    const popover = page.getByRole('dialog').filter({
      has: page.getByRole('button', {
        name: new RegExp(`^(Replace an ad|Change the ad) for ${ROWS.launch}$`),
      }),
    });
    await popover.getByRole('button', { name: `Replace an ad for ${ROWS.launch}` }).click();
    await popover.getByRole('button', { name: new RegExp(`^${campaign.name}`) }).click();
    await popover.getByRole('button', { name: new RegExp(`^${adset.name}`) }).click();
    await popover.getByRole('button', { name: new RegExp(`^${ad.name}`) }).click();
    // A replace swaps exactly one file: pick the format.
    const format = popover.getByRole('combobox', { name: `Format for ${ROWS.launch}` });
    await format.click();
    // The open listbox's option: the toolbar's Artboard picker names a "Square" too.
    await page
      .getByRole('listbox')
      .getByRole('option', { name: FORGE_FIXTURE.outputs.square, exact: true })
      .click();
    await expect(popover.getByText(ad.name, { exact: true })).toBeVisible();
    await review(page, 'destination-popover');
    await page.keyboard.press('Escape');
    await expect(
      launch.getByRole('button', { name: `Destination for ${ROWS.launch}: Replace · ${ad.name}` }),
    ).toBeVisible();
    await expect(launch.getByText('Ready', { exact: true })).toBeVisible();

    // Render both: one confirmation, one new ad per default row and the one replace.
    await root.getByRole('checkbox', { name: 'Select row' }).click();
    await launch.getByRole('checkbox', { name: 'Select row' }).click();
    const before = fixtures.calls('POST', /\/renders\/batch-preflight$/).length;
    await page
      .getByRole('toolbar', { name: 'Render' })
      .getByRole('button', { name: /^Render 2 rows · \d+ files$/ })
      .click();
    const confirm = page.getByRole('dialog', { name: /^Render 2 rows · \d+ files$/ });
    await expect(confirm).toBeVisible();
    const ads = confirm.getByRole('list', { name: 'Meta ads' }).getByRole('listitem');
    await expect(ads).toHaveCount(2);
    // By the row's own label: the campaign is called "Koprulu Launch".
    const adFor = (label: string) => ads.filter({ has: page.getByText(label, { exact: true }) });
    await expect(adFor(ROWS.root)).toContainText(`new paused ads in ${AD_SET} (set default)`);
    await expect(adFor(ROWS.launch)).toContainText(`replaces ${ad.name}`);
    await expect(confirm.getByText(`· #${ROOM.name} approval`)).toBeVisible();
    const fire = confirm.getByRole('button', { name: /^Render \d+ files$/ });
    await expect(fire).toBeEnabled();
    await review(page, 'confirm-meta');

    // ONE batch preflight: the default as the batch `delivery`, the replace on its own record.
    const preflights = fixtures.calls('POST', /\/renders\/batch-preflight$/).slice(before);
    expect(preflights).toHaveLength(1);
    const signed = preflights[0]?.body as ApiRenderBatchPreflightRequest;
    expect(signed.delivery).toEqual(saved.settings?.metaTarget);
    expect(signed.approvalDestinationIds).toEqual([ROOM.id]);
    const rootRecord = signed.records.find((record) => record.label === ROWS.root);
    const launchRecord = signed.records.find((record) => record.label === ROWS.launch);
    expect(rootRecord?.delivery, 'a default row carries no target of its own').toBeUndefined();
    expect(launchRecord?.delivery).toMatchObject({ action: 'replace', adId: ad.id });
    expect(launchRecord?.outputIds).toHaveLength(1);

    // Render: one batch, and the Status column follows the fired rows.
    await fire.click();
    await expect.poll(() => fixtures.calls('POST', /\/renders\/batches$/).length).toBe(1);
    await expect(confirm).toBeHidden();
    await expect(root.getByText('Rendering', { exact: true })).toBeVisible();
    await expect(launch.getByText('Rendering', { exact: true })).toBeVisible();
    // The shot waits out the dialog's fade and shows the Destination and Status columns whole.
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await scrollGrid(page, 'end');
    await review(page, 'status-running');
  });
});
