import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { forgeRenderSetSchema, updateForgeRenderSetRequestSchema } from '@continuum/contracts';
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

// forge:studio:e2e:bench — the Render tab's sets rail, in a real Chrome.
//
// Same harness as forge-studio.bench.spec.ts: a real minted StarCraft session, the server-rendered
// /forge page, every /api/ai-studio/** call answered by contract-parsed fixtures and the backend a
// dead port. On top of those fixtures this file adds, through the shared fixture state and
// `context.route`:
//
//   TEASER — a second saved set of the promo template, so there is a set to switch to.
//   PUT /renders/sets/:id — the fixtures' handler keeps name and rows only; this one also keeps
//           `description`, parsed through the real update contract, so a reload reads it back.
//
// At 1280×800 and 1920×1200 it proves: the rail lists both sets with their row counts and what
// the template's jobs page says about their renders, and marks the open one; Esc drops a
// description edit with no request; Enter sends exactly one PUT carrying only the description and
// the set's revision, and the description is there after a reload; switching sets with unsaved
// grid edits asks first, and Keep editing keeps them; folding the rail widens the grid; nothing
// scrolls sideways and the rail fits the viewport; the review tray still opens under the grid.
//
// It does NOT exercise the Fastify backend or the `media.render_sets.description` column (the
// migration is not applied yet) — the envelope says so.
//
// Usage:
//   cd Continuum-Frontend && FORGE_STUDIO_E2E_PORT=3142 \
//     FORGE_STUDIO_DIST_DIR=.next/forge-studio-e2e-rail \
//     bun run forge:studio:e2e:bench -- e2e/set-rail.forge-studio.bench.spec.ts

const { publishableKey, serviceRoleKey } = loadProdSupabaseEnv();

const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const OWNER_EMAIL = 'duane@continuumai.agency';
const RUN_ID = process.env.FORGE_STUDIO_RUN_ID ?? String(Date.now());
const SHOTS_DIR = resolve(__dirname, '__screenshots__/forge-studio');
// Shared with the other forge-studio specs: one run, one results file, one complete envelope.
const RESULTS_PATH = join(tmpdir(), `forge-studio-bench-${RUN_ID}.jsonl`);

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1920, height: 1200 },
] as const;

const ROWS = FORGE_FIXTURE.set.rows;
const LAUNCH = FORGE_FIXTURE.set.name;
const TEASER = 'Teaser cut';
const DESCRIPTION = 'Spain first, then Portugal';

let session: MintedSession | null = null;
const opened: BrowserContext[] = [];
const activeFixtures: ForgeFixtures[] = [];

// --- session and envelope (the pattern of forge-studio.bench.spec.ts) ------------------------

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('[set-rail-bench] access token has no payload');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    session_id?: string;
  };
  if (!claims.sub || !claims.session_id) {
    throw new Error('[set-rail-bench] access token carries no sub or session_id claim');
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
  if (error) throw new Error(`[set-rail-bench] session brand pin failed: ${error.message}`);
  const { data, error: resolveError } = await member
    .schema('brand_profiles')
    .rpc('resolve_active_brand_for_session');
  if (resolveError || data !== STARCRAFT_BRAND_ID) {
    throw new Error(
      `[set-rail-bench] the session resolves to ${String(data)} (${resolveError?.message ?? 'no error'}), not StarCraft`,
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
        'FIXTURES: every /api/ai-studio/** call was answered in the browser by fixtures parsed through the real contracts, plus a second saved set and a description-keeping set PUT added by set-rail.forge-studio.bench.spec.ts; the backend URL is a dead port.',
        'NOT exercised: the Fastify backend and the media.render_sets.description column (migration not applied). Real: Chrome, the minted StarCraft session, the server-rendered brand context, and every Render-tab component.',
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

type SetPut = { setId: string; body: unknown };

/**
 * The second set, and a set PUT that keeps `description`. Registered after the fixtures, so it
 * answers first; every other method on the path falls through to them (OPTIONS included).
 */
async function addRailFixtures(
  context: BrowserContext,
  fixtures: ForgeFixtures,
): Promise<SetPut[]> {
  const [launch] = fixtures.state.sets;
  if (!launch) throw new Error('[set-rail-bench] the fixtures carry no saved set');
  fixtures.state.sets.push(
    forgeRenderSetSchema.parse({
      ...launch,
      id: randomUUID(),
      name: TEASER,
      revision: 1,
      rows: [
        {
          id: randomUUID(),
          parentId: null,
          label: 'Teaser',
          overrides: { headline: 'Coming soon' },
          clearedKeys: [],
          outputIds: [],
        },
      ],
      createdAt: '2026-09-11T09:00:00.000Z',
      updatedAt: '2026-09-11T09:00:00.000Z',
    }),
  );

  const puts: SetPut[] = [];
  await context.route(
    (url) => /^\/api\/ai-studio\/renders\/sets\/[0-9a-f-]{36}$/.test(url.pathname),
    async (route) => {
      const request = route.request();
      if (request.method() !== 'PUT') {
        await route.fallback();
        return;
      }
      const origin = (await request.headerValue('origin')) ?? '*';
      const reply = (status: number, body: unknown) =>
        route.fulfill({
          status,
          headers: {
            'access-control-allow-origin': origin,
            'access-control-allow-credentials': 'true',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      const setId = new URL(request.url()).pathname.split('/').at(-1) ?? '';
      const body = request.postDataJSON() as unknown;
      puts.push({ setId, body });
      const parsed = updateForgeRenderSetRequestSchema.safeParse(body);
      if (!parsed.success) {
        fixtures.violations.push(`update render set: ${parsed.error.message}`);
        await reply(400, { error: 'render_set_refused' });
        return;
      }
      fixtures.brandIds.add(parsed.data.brandId);
      const index = fixtures.state.sets.findIndex((set) => set.id === setId);
      const current = fixtures.state.sets[index];
      if (!current) {
        await reply(404, { error: 'render_set_not_found' });
        return;
      }
      if (current.revision !== parsed.data.expectedRevision) {
        await reply(409, { error: 'render_set_revision_conflict' });
        return;
      }
      const { name, rows, description } = parsed.data;
      const updated = forgeRenderSetSchema.parse({
        ...current,
        ...(name ? { name } : {}),
        ...(rows ? { rows } : {}),
        ...(description !== undefined ? { description } : {}),
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      });
      fixtures.state.sets[index] = updated;
      await reply(200, updated);
    },
  );
  return puts;
}

// --- page helpers --------------------------------------------------------------------------

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

const setItem = (page: Page, name: string): Locator =>
  page
    .getByRole('list', { name: 'Render sets' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) });

const openButton = (page: Page, name: string) =>
  page.getByRole('button', { name: `Open ${name}`, exact: true });

/**
 * Opens a set the way a person does: a click on its name. The row's own Open button is the
 * keyboard path; the unit test covers it.
 */
const openByName = (page: Page, name: string) =>
  setItem(page, name).getByText(name, { exact: true }).click();

const widthOf = async (locator: Locator) => (await locator.boundingBox())?.width ?? 0;

/** Sideways overflow of the page, the app's scroll authority, and the rail itself, in px. */
const overflow = (page: Page) =>
  page.evaluate(() => {
    const excess = (element: Element | null) =>
      element ? element.scrollWidth - element.clientWidth : 0;
    return {
      page: excess(document.documentElement),
      main: excess(document.querySelector('main')),
      rail: excess(document.querySelector('[data-testid="render-sets"] aside')),
    };
  });

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS_DIR, `rail-${name}.png`) }).catch(() => undefined);
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

test.describe('Sets rail — fixtures', () => {
  test.skip(LIVE, 'the sets rail bench runs on fixtures only');

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

    test(`RAIL1 · ${size} · sets stay visible, describable, guarded, foldable, and the tray still opens`, async ({
      browser,
    }) => {
      if (!session) throw new Error('[set-rail-bench] no minted session');
      const context = await browser.newContext({ storageState: session.state, viewport });
      opened.push(context);
      const fixtures = await installForgeFixtures(context);
      activeFixtures.push(fixtures);
      const puts = await addRailFixtures(context, fixtures);
      const page = await context.newPage();
      await openRenderTab(page);

      // Every set at once: its rows, what the jobs page says about its renders, the open one marked.
      const launch = setItem(page, LAUNCH);
      const teaser = setItem(page, TEASER);
      await expect(gridRow(page, ROWS.root).getByText('Ready', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('list', { name: 'Render sets' }).getByRole('listitem'),
      ).toHaveCount(2);
      await expect(launch.getByText('6 rows', { exact: true })).toBeVisible();
      await expect(teaser.getByText('1 row', { exact: true })).toBeVisible();
      // The fixtures hold three promo jobs, all from Launch week, and no page behind them.
      await expect(launch.getByText(/^3 renders · /)).toBeVisible();
      await expect(teaser.getByText('No renders yet', { exact: true })).toBeVisible();
      await expect(openButton(page, LAUNCH)).toHaveAttribute('aria-current', 'true');
      await expect(openButton(page, TEASER)).not.toHaveAttribute('aria-current', 'true');
      // The set picker left the toolbar; the rail is the only place sets live.
      await expect(page.getByRole('button', { name: 'Render set', exact: true })).toHaveCount(0);
      expect(await overflow(page)).toEqual({ page: 0, main: 0, rail: 0 });
      const railBox = await page.getByTestId('render-sets').boundingBox();
      expect(railBox, 'the rail is on screen').not.toBeNull();
      expect(railBox!.y + railBox!.height, 'the rail ends inside the viewport').toBeLessThanOrEqual(
        viewport.height,
      );
      await shoot(page, `${size}-open`);

      // Esc drops an edit and asks the server nothing.
      await launch.getByRole('button', { name: 'Add a description', exact: true }).click();
      const field = launch.getByRole('textbox', { name: `Description of ${LAUNCH}`, exact: true });
      await field.fill('Not this one');
      await expect(launch.getByText('12/500', { exact: true })).toBeVisible();
      await field.press('Escape');
      await expect(field).toBeHidden();
      await expect(
        launch.getByRole('button', { name: 'Add a description', exact: true }),
      ).toBeVisible();
      // A negative: give a stray request the time it would take to leave.
      await page.waitForTimeout(750);
      expect(puts, 'Esc sends no request').toHaveLength(0);

      // Enter sends one PUT carrying only the description and the revision the set was read at.
      await launch.getByRole('button', { name: 'Add a description', exact: true }).click();
      await field.fill(DESCRIPTION);
      await shoot(page, `${size}-describe`);
      await field.press('Enter');
      await expect(launch.getByRole('button', { name: DESCRIPTION, exact: true })).toBeVisible();
      await expect.poll(() => puts.length).toBe(1);
      expect(puts[0]?.setId).toBe(fixtures.state.sets[0]?.id);
      expect(puts[0]?.body).toEqual({
        brandId: STARCRAFT_BRAND_ID,
        expectedRevision: 3,
        description: DESCRIPTION,
      });

      // A reload reads the set list again, and the description is on it.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openRenderTab(page);
      await expect(
        setItem(page, LAUNCH).getByRole('button', { name: DESCRIPTION, exact: true }),
      ).toBeVisible();
      await expect(gridRow(page, ROWS.root).getByText('Ready', { exact: true })).toBeVisible();
      expect(puts).toHaveLength(1);

      // Switching with unsaved grid edits saves them into the open set first, then switches —
      // nothing is asked, and nothing is lost: the edit is there on the way back.
      const rootName = gridRow(page, ROWS.root).getByRole('textbox', {
        name: 'Row name',
        exact: true,
      });
      await rootName.fill('Root EU');
      await openByName(page, TEASER);
      await expect(gridRow(page, 'Teaser')).toBeVisible();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect(openButton(page, TEASER)).toHaveAttribute('aria-current', 'true');
      const rowSave = puts.at(-1)?.body as {
        expectedRevision: number;
        rows?: Array<{ label: string }>;
      };
      expect(puts).toHaveLength(2);
      expect(rowSave.expectedRevision).toBe(4);
      expect(rowSave.rows?.map((row) => row.label)).toContain('Root EU');
      await shoot(page, `${size}-switch-saves-first`);
      await openByName(page, LAUNCH);
      const renamed = gridRow(page, 'Root EU');
      await expect(renamed).toBeVisible();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      // Back to the name the rest of this run looks for.
      await renamed.getByRole('textbox', { name: 'Row name', exact: true }).fill(ROWS.root);
      await expect(gridRow(page, ROWS.root)).toBeVisible();

      // Folding the rail gives its width to the grid, and still names the open set.
      const grid = page.getByTestId('render-grid');
      const gridWidth = await widthOf(grid);
      await page.getByRole('button', { name: 'Hide render sets', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Show render sets', exact: true }),
      ).toBeVisible();
      await expect.poll(() => widthOf(grid)).toBeGreaterThan(gridWidth + 100);
      expect(await widthOf(page.getByTestId('render-sets'))).toBeLessThan(48);
      await expect(
        page.getByTestId('render-sets').getByText(LAUNCH, { exact: true }),
      ).toBeVisible();
      expect(await overflow(page)).toEqual({ page: 0, main: 0, rail: 0 });
      await shoot(page, `${size}-collapsed`);
      await page.getByRole('button', { name: 'Show render sets', exact: true }).click();
      await expect(page.getByRole('list', { name: 'Render sets' })).toBeVisible();
      await expect.poll(() => widthOf(grid)).toBeLessThan(gridWidth + 20);

      // The review tray still docks under the grid.
      const root = gridRow(page, ROWS.root);
      await expect(root.getByText('Ready', { exact: true })).toBeVisible();
      await root.getByRole('checkbox', { name: 'Select row' }).click();
      const render = page.getByRole('button', { name: /^Render 1 row · \d+ files?$/ });
      await expect(render).toBeEnabled();
      await render.click();
      const tray = page.getByRole('region', { name: 'Review and render' });
      await expect(tray).toBeVisible();
      await expect(page.locator('[role="dialog"], [role="alertdialog"]')).toHaveCount(0);
      const trayBox = await tray.boundingBox();
      expect(trayBox!.y + trayBox!.height, 'the tray ends inside the viewport').toBeLessThanOrEqual(
        viewport.height,
      );
      expect(await overflow(page)).toEqual({ page: 0, main: 0, rail: 0 });
      await shoot(page, `${size}-tray`);
      // Every PUT is one the person caused: the description, the edit saved before the switch, and
      // the name put back — each at the revision the one before it left, never a conflict.
      expect(
        puts.map(({ body }) => (body as { expectedRevision: number }).expectedRevision),
      ).toEqual([3, 4, 5]);
    });
  }
});
