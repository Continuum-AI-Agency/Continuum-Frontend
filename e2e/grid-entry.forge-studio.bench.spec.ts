import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

// forge:studio:e2e:bench — entering data in the Render grid, in a real Chrome.
//
// Same harness as forge-studio.bench.spec.ts: a real minted StarCraft session, the server-rendered
// /forge page, every /api/ai-studio/** call answered by contract-parsed fixtures and the backend a
// dead port. The fixture set is "Launch week": roots Root, Launch and Solo, with variations.
//
// At 1440×900 and 1280×800 it proves:
//   E1  right-click on a row offers exactly its ⋯ menu; a header hides a column and brings it back;
//       a field already being typed in keeps the browser's own menu.
//   E3  one value to the selected rows is one step — ⌘Z takes it back, ⇧⌘Z puts it again.
//   E4  Enter moves down a column, Shift+Enter up, and ⌘D fills a cell from the row above.
//   E5  with nothing remembered, at least three variable columns fit beside the pinned ones and the
//       headline field is at least 8rem wide; a divider moved by hand is where it was after a reload.
//   E6  delete asks nothing, says what went on a toast, and the toast's Undo brings the rows back.
//   E7  a row's "Generate with AI ▸ 6 variations" drafts six proposed rows with no dialog and
//       nothing typed, and they arrive marked and excluded from the set until kept.
//   E8  right-clicking a cell varies only that cell's own key; on a picture cell the presets are
//       disabled with their reason and the brief beneath them is not.
//
// It does NOT exercise the Fastify backend or the render fleet — the envelope says so.
//
// Usage:
//   cd Continuum-Frontend && FORGE_STUDIO_E2E_PORT=3152 \
//     FORGE_STUDIO_DIST_DIR=.next/forge-studio-e2e-entry \
//     bun run forge:studio:e2e:bench -- e2e/grid-entry.forge-studio.bench.spec.ts

const { publishableKey, serviceRoleKey } = loadProdSupabaseEnv();

const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const OWNER_EMAIL = 'duane@continuumai.agency';
const RUN_ID = process.env.FORGE_STUDIO_RUN_ID ?? String(Date.now());
const SHOTS_DIR = resolve(__dirname, '__screenshots__/forge-studio');
const RESULTS_PATH = join(tmpdir(), `forge-studio-bench-${RUN_ID}.jsonl`);

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
] as const;

const ROWS = FORGE_FIXTURE.set.rows;
const VARIABLE_COLUMNS = ['headline', 'tagline', 'price', 'accent', 'hero', 'watermark_logo'];

let session: MintedSession | null = null;
const opened: BrowserContext[] = [];
const activeFixtures: ForgeFixtures[] = [];

// --- session and envelope (the pattern of forge-studio.bench.spec.ts) ------------------------

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('[grid-entry-bench] access token has no payload');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    session_id?: string;
  };
  if (!claims.sub || !claims.session_id)
    throw new Error('[grid-entry-bench] access token carries no sub or session_id claim');
  return { sub: claims.sub, session_id: claims.session_id };
}

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
  if (error) throw new Error(`[grid-entry-bench] session brand pin failed: ${error.message}`);
  const { data, error: resolveError } = await member
    .schema('brand_profiles')
    .rpc('resolve_active_brand_for_session');
  if (resolveError || data !== STARCRAFT_BRAND_ID)
    throw new Error(
      `[grid-entry-bench] the session resolves to ${String(data)} (${resolveError?.message ?? 'no error'}), not StarCraft`,
    );
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
        'FIXTURES: every /api/ai-studio/** call was answered in the browser by fixtures parsed through the real contracts; the backend URL is a dead port.',
        'NOT exercised: the Fastify backend and the render fleet. Real: Chrome, the minted StarCraft session, the server-rendered brand context, and every Render-tab component.',
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

async function openRenderTab(page: Page): Promise<void> {
  await page.goto('/forge', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 180_000,
  });
  const tab = page.getByRole('tab', { name: 'Render', exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
  await expect(gridRow(page, ROWS.root).getByText('Ready', { exact: true })).toBeVisible();
}

async function newPage(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
): Promise<{ page: Page; context: BrowserContext; fixtures: ForgeFixtures }> {
  if (!session) throw new Error('[grid-entry-bench] no minted session');
  const context = await browser.newContext({ storageState: session.state, viewport });
  opened.push(context);
  const fixtures = await installForgeFixtures(context);
  activeFixtures.push(fixtures);
  const page = await context.newPage();
  await openRenderTab(page);
  return { page, context, fixtures };
}

/** A grid row, found by its drag handle — the one control named after the row. */
const gridRow = (page: Page, label: string): Locator =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Drag ${label}`, exact: true }) });

const headlineOf = (page: Page, label: string) =>
  gridRow(page, label).getByRole('textbox', { name: 'Headline', exact: true });

const menuLabels = async (page: Page) =>
  (await page.getByRole('menuitem').allTextContents()).map((text) => text.trim());

const closeMenu = async (page: Page) => {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem')).toHaveCount(0);
};

/** The open submenu panel. Both levels stay in the DOM together, so scope or you read both. */
const submenu = (page: Page): Locator => page.locator('[data-slot$="-sub-content"]');
const submenuLabels = async (page: Page) => {
  // allTextContents() is a snapshot with no auto-wait, so read it only once an item is there.
  await expect(submenu(page).getByRole('menuitem').first()).toBeVisible();
  return (await submenu(page).getByRole('menuitem').allTextContents()).map((text) => text.trim());
};
/** One Escape closes the submenu, the next its parent. */
const closeSubmenu = async (page: Page) => {
  await page.keyboard.press('Escape');
  await expect(submenu(page)).toHaveCount(0);
  await closeMenu(page);
};

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS_DIR, `entry-${name}.png`) }).catch(() => undefined);
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

test.describe('Render grid entry — fixtures', () => {
  test.skip(LIVE, 'the entry bench runs on fixtures only');

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

    test(`E9 · ${size} · Draft with AI opens a compact bubble beside Add`, async ({ browser }) => {
      const { page } = await newPage(browser, viewport);
      const add = page.getByRole('button', { name: 'Add', exact: true });
      await add.click();
      await page.getByRole('menuitem', { name: 'Draft with AI…' }).click();
      const bubble = page.getByRole('dialog', { name: 'Draft rows with AI' });
      await expect(bubble).toBeVisible();
      await expect(bubble).toHaveCSS('opacity', '1');
      await expect(bubble.getByRole('button', { name: 'Add files' })).toBeVisible();
      await expect(bubble.getByLabel('Brief (optional with files)')).toBeVisible();
      await expect(bubble.getByLabel('Rows')).toHaveCount(0);
      const [triggerBox, bubbleBox] = await Promise.all([add.boundingBox(), bubble.boundingBox()]);
      expect(triggerBox && bubbleBox).toBeTruthy();
      expect(bubbleBox!.width).toBeLessThan(450);
      expect(Math.abs(bubbleBox!.x - triggerBox!.x)).toBeLessThan(100);
      await shoot(page, `${size}-draft-bubble`);
    });

    test(`E1 · ${size} · right-click is the ⋯ menu; headers hide and show; a typed-in field keeps its own menu`, async ({
      browser,
    }) => {
      const { page } = await newPage(browser, viewport);
      const solo = gridRow(page, ROWS.solo);

      await solo.getByRole('button', { name: `Row actions for ${ROWS.solo}`, exact: true }).click();
      const dotMenu = await menuLabels(page);
      await closeMenu(page);
      await solo.getByRole('button', { name: `Drag ${ROWS.solo}`, exact: true }).click({
        button: 'right',
      });
      expect(await menuLabels(page)).toEqual(dotMenu);
      expect(dotMenu).toEqual([
        'Rename',
        'Add variation',
        'Add row below',
        'Generate with AI',
        'Copy',
        'Save as inputs',
        'Delete',
      ]);
      await shoot(page, `${size}-row-menu`);
      await closeMenu(page);

      const tagline = page.locator('th[data-column-id="tagline"]');
      await tagline.click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Hide column', exact: true }).click();
      await expect(tagline).toHaveCount(0);
      await page.locator('th[data-column-id="headline"]').click({ button: 'right' });
      await page
        .getByRole('menuitem', { name: 'Show all columns (1 hidden)', exact: true })
        .click();
      await expect(page.locator('th[data-column-id="tagline"]')).toHaveCount(1);

      const field = headlineOf(page, ROWS.solo);
      await field.click();
      await expect(field, 'the field is being typed in before the right-click').toBeFocused();
      await field.click({ button: 'right' });
      await page.waitForTimeout(250);
      await expect(page.getByRole('menuitem')).toHaveCount(0, { timeout: 2000 });
    });

    test(`E7 · ${size} · a row drafts six variations from the menu, with nothing typed`, async ({
      browser,
    }) => {
      const { page, fixtures } = await newPage(browser, viewport);
      const before = await page.getByRole('row').count();

      await gridRow(page, ROWS.solo)
        .getByRole('button', { name: `Row actions for ${ROWS.solo}`, exact: true })
        .click();
      await page.getByRole('menuitem', { name: 'Generate with AI', exact: true }).click();
      expect(
        await submenuLabels(page),
        'the presets and the brief that is still reachable behind them',
      ).toEqual(['3 variations', '6 variations', '12 variations', 'With a brief…']);
      await shoot(page, `${size}-generate-presets`);
      await submenu(page).getByRole('menuitem', { name: '6 variations', exact: true }).click();

      // No dialog stood in the way, and nothing was typed.
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Proposed rows' })).toBeVisible();
      await expect(page.getByRole('row')).toHaveCount(before + 6, { timeout: 10_000 });

      const sent = fixtures.requests.filter(
        (request) => request.path === '/api/ai-studio/renders/suggest-rows',
      );
      expect(sent, 'one request, for the row the cursor was on').toHaveLength(1);
      const body = sent[0]!.body as {
        count: number;
        varyKeys: string[];
        prompt: string;
        forksPerRow: number;
      };
      expect(body.count).toBe(6);
      expect(body.forksPerRow).toBe(0);
      // A real brief went out even though nobody typed one: an empty one leaves the model a bare
      // "BRIEF:" header and the Library search nothing to go on.
      expect(body.prompt.trim().length).toBeGreaterThan(0);
      // The picture slots are never in a no-typing draft.
      expect(body.varyKeys).toEqual(['headline', 'tagline', 'price', 'accent']);

      await shoot(page, `${size}-generate-proposed`);
    });

    test(`E8 · ${size} · a cell varies its own key; a picture cell sends you to the brief`, async ({
      browser,
    }) => {
      const { page, fixtures } = await newPage(browser, viewport);
      const cellIn = (label: string, key: string) =>
        gridRow(page, label).locator(`td[data-column-id="${key}"]`);

      await cellIn(ROWS.solo, 'accent').click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Vary Accent colour', exact: true }).click();
      await submenu(page).getByRole('menuitem', { name: '3 variations', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Proposed rows' })).toBeVisible();
      const accent = fixtures.requests.filter(
        (request) => request.path === '/api/ai-studio/renders/suggest-rows',
      );
      // The cursor is the detection: one key, the one it was on.
      expect((accent[0]!.body as { varyKeys: string[] }).varyKeys).toEqual(['accent']);

      await cellIn(ROWS.solo, 'hero').click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Vary Hero image', exact: true }).click();
      const preset = submenu(page).getByRole('menuitem', { name: '3 variations', exact: true });
      // Disabled with the reason, never hidden — and the brief beneath it is the way through.
      await expect(preset).toHaveAttribute('title', 'Pick pictures with a brief');
      await expect(
        submenu(page).getByRole('menuitem', { name: 'With a brief…', exact: true }),
      ).not.toHaveAttribute('title', 'Pick pictures with a brief');
      await shoot(page, `${size}-picture-needs-brief`);
      await closeSubmenu(page);
      expect(
        fixtures.requests.filter(
          (request) => request.path === '/api/ai-studio/renders/suggest-rows',
        ),
        'the disabled preset sent nothing',
      ).toHaveLength(accent.length);
    });

    test(`E3 · ${size} · one value to the selected rows is one undo step`, async ({ browser }) => {
      const { page } = await newPage(browser, viewport);
      const roots = [ROWS.root, ROWS.launch, ROWS.solo];
      const before = await Promise.all(roots.map((label) => headlineOf(page, label).inputValue()));
      for (const label of roots)
        await gridRow(page, label).getByRole('checkbox', { name: 'Select row' }).click();

      await headlineOf(page, ROWS.root)
        .locator('xpath=ancestor::td[1]')
        .click({ button: 'right', position: { x: 2, y: 2 } });
      await page.getByRole('menuitem', { name: 'Apply to 2 selected rows', exact: true }).click();
      await expect
        .poll(() => Promise.all(roots.map((label) => headlineOf(page, label).inputValue())), {
          message: 'apply gave every selected row the value',
        })
        .toEqual([before[0], before[0], before[0]]);

      await page.locator('body').click({ position: { x: 1, y: 1 } });
      await page.keyboard.press('ControlOrMeta+z');
      await expect
        .poll(() => Promise.all(roots.map((label) => headlineOf(page, label).inputValue())), {
          message: 'undo took the apply back',
        })
        .toEqual(before);
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await expect
        .poll(() => Promise.all(roots.map((label) => headlineOf(page, label).inputValue())), {
          message: 'redo put the apply back',
        })
        .toEqual([before[0], before[0], before[0]]);
    });

    test(`E4 · ${size} · Enter moves down a column; ⌘D fills from the row above`, async ({
      browser,
    }) => {
      const { page } = await newPage(browser, viewport);
      const shown = await page
        .locator('tr[data-row-id] input[aria-label="Row name"]')
        .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
      const [first, second] = shown;
      if (!first || !second) throw new Error('[grid-entry-bench] fewer than two rows on screen');

      await headlineOf(page, first).click();
      await page.keyboard.press('Enter');
      await expect(headlineOf(page, second)).toBeFocused();
      await page.keyboard.press('Shift+Enter');
      await expect(headlineOf(page, first)).toBeFocused();

      await headlineOf(page, first).fill('Fill me down');
      await headlineOf(page, second).click();
      await page.keyboard.press('ControlOrMeta+d');
      await expect(headlineOf(page, second)).toHaveValue('Fill me down');
    });

    test(`E5 · ${size} · three variable columns fit, the headline has room, and a moved divider stays`, async ({
      browser,
    }) => {
      const { page } = await newPage(browser, viewport);
      const measured = await page.evaluate((ids) => {
        const scroller = document
          .querySelector('[data-testid="render-grid"] table')
          ?.closest('.overflow-auto');
        const box = scroller?.getBoundingClientRect();
        const widths = Object.fromEntries(
          [...document.querySelectorAll<HTMLElement>('th[data-column-id]')].map((cell) => [
            cell.dataset.columnId,
            Math.round(cell.getBoundingClientRect().width),
          ]),
        );
        const fitting = box
          ? ids.filter((id) => {
              const cell = document
                .querySelector(`th[data-column-id="${id}"]`)
                ?.getBoundingClientRect();
              return cell && cell.left >= box.left - 1 && cell.right <= box.right + 1;
            }).length
          : -1;
        return { fitting, scroller: Math.round(box?.width ?? 0), widths };
      }, VARIABLE_COLUMNS);
      expect(
        measured.fitting,
        `variable columns fully on screen beside the pinned ones: ${JSON.stringify(measured)}`,
      ).toBeGreaterThanOrEqual(3);
      const room = await headlineOf(page, ROWS.root).evaluate((input) => {
        const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
        // The field as drawn, border included, to the pixel.
        return Math.round(input.getBoundingClientRect().width) / rem;
      });
      expect(room, 'headline field width in rem').toBeGreaterThanOrEqual(7.95);
      await shoot(page, `${size}-fit`);

      const divider = page.locator('[data-testid="render-grid"] + [role="separator"]');
      const handle = await divider.boundingBox();
      if (!handle)
        throw new Error('[grid-entry-bench] the grid | preview divider is not on screen');
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2 + 80, handle.y + handle.height / 2, {
        steps: 8,
      });
      await page.mouse.up();
      const widthBefore = (await page.getByTestId('render-grid').boundingBox())?.width ?? 0;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openRenderTab(page);
      const widthAfter = (await page.getByTestId('render-grid').boundingBox())?.width ?? 0;
      expect(Math.abs(widthAfter - widthBefore), 'grid width after a reload').toBeLessThanOrEqual(
        2,
      );
    });

    test(`E6 · ${size} · delete asks nothing; the toast’s Undo brings the rows back`, async ({
      browser,
    }) => {
      const { page } = await newPage(browser, viewport);
      await gridRow(page, ROWS.launch)
        .getByRole('button', { name: `Row actions for ${ROWS.launch}`, exact: true })
        .click();
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click({ timeout: 10_000 });
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect(gridRow(page, ROWS.launch)).toHaveCount(0);
      await expect(gridRow(page, ROWS.launchGrandFork)).toHaveCount(0);
      await expect(page.getByText('Deleted 1 row, 2 variations included')).toBeVisible();
      await page.getByRole('button', { name: 'Undo', exact: true }).click({ timeout: 10_000 });
      await expect(gridRow(page, ROWS.launch)).toHaveCount(1);
      await expect(gridRow(page, ROWS.launchGrandFork)).toHaveCount(1);
    });
  }
});
