import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type ApiRenderBatchPreflightRequest,
  type ApiRenderTemplateContract,
  apiRenderTemplateContractSchema,
  apiRenderTemplateListResponseSchema,
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
  BINDING_ID,
  FORGE_FIXTURE,
  type ForgeFixtures,
  installForgeFixtures,
  STARCRAFT_BRAND_ID,
} from './support/forge-studio-fixtures';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// forge:studio:e2e:bench — the Render tab's grid and its review tray, in a real Chrome.
//
// Same harness as forge-studio.bench.spec.ts: a real minted StarCraft session, the server-rendered
// /forge page, every /api/ai-studio/** call answered by contract-parsed fixtures and the backend a
// dead port. This file adds two templates through `context.route` on top of those fixtures:
//
//   THREE — the promo template publishing three outputs (16:9, 1:1, 9:16), its saved set's roots
//           rendering all three.
//   ZERO  — a template whose contract publishes `outputs: []` and whose formats live only in
//           `template.ratios` — what StarCraft template 133 really answers.
//
// At 1280×800 and 1920×1200 it proves: a row's hover buttons add a variation and a row below
// without touching the selection; inheritance reads as guide lines and `inherits · N changed`;
// every row shows the ratios it renders; Render totals rows × files; the review tray docks under
// the grid with no dialog and the grid still usable; an edit after review sends the tray back to
// Review and re-checks by itself, with nothing to render until it has; one press of the tray's
// primary button posts exactly one batch; Running lists the fired jobs. A new set's seed row is
// "Base".
//
// It does NOT exercise the Fastify backend, the render fleet, Slack or Meta — the envelope says so.
//
// Usage:
//   cd Continuum-Frontend && FORGE_STUDIO_E2E_PORT=3122 \
//     FORGE_STUDIO_DIST_DIR=.next/forge-studio-e2e-grid \
//     bun run forge:studio:e2e:bench -- e2e/render-grid.forge-studio.bench.spec.ts

const { publishableKey, serviceRoleKey } = loadProdSupabaseEnv();

const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const OWNER_EMAIL = 'duane@continuumai.agency';
const RUN_ID = process.env.FORGE_STUDIO_RUN_ID ?? String(Date.now());
const SHOTS_DIR = resolve(__dirname, '__screenshots__/forge-studio');
// Shared with forge-studio.bench.spec.ts: one run, one results file, one complete envelope.
const RESULTS_PATH = join(tmpdir(), `forge-studio-bench-${RUN_ID}.jsonl`);

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1920, height: 1200 },
] as const;

const ROWS = FORGE_FIXTURE.set.rows;
const PROMO = FORGE_FIXTURE.promo;
const ZERO_TEMPLATE_KEY = 'sc_zero_output';
const THREE_RATIOS = ['16:9', '1:1', '9:16'];

let session: MintedSession | null = null;
const opened: BrowserContext[] = [];
const activeFixtures: ForgeFixtures[] = [];

// --- session and envelope (the pattern of forge-studio.bench.spec.ts) ------------------------

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('[render-grid-bench] access token has no payload');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    session_id?: string;
  };
  if (!claims.sub || !claims.session_id) {
    throw new Error('[render-grid-bench] access token carries no sub or session_id claim');
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
  if (error) throw new Error(`[render-grid-bench] session brand pin failed: ${error.message}`);
  const { data, error: resolveError } = await member
    .schema('brand_profiles')
    .rpc('resolve_active_brand_for_session');
  if (resolveError || data !== STARCRAFT_BRAND_ID) {
    throw new Error(
      `[render-grid-bench] the session resolves to ${String(data)} (${resolveError?.message ?? 'no error'}), not StarCraft`,
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
        'FIXTURES: every /api/ai-studio/** call was answered in the browser by fixtures parsed through the real contracts, plus a three-output and a zero-output template added by render-grid.forge-studio.bench.spec.ts; the backend URL is a dead port.',
        'NOT exercised: the Fastify backend, the render fleet, Slack and Meta. Real: Chrome, the minted StarCraft session, the server-rendered brand context, and every Render-tab component.',
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

// --- the added templates -------------------------------------------------------------------

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

const summary = (key: string, displayName: string, ratios: string[]) =>
  apiRenderTemplateSummarySchema.parse({
    key,
    name: key,
    bindingId: BINDING_ID,
    environment: 'Continuum_app',
    contractVersion: '1',
    // The fixtures' preflight answers for the promo hash; a different key still renders.
    contractHash: 'sc-promo-v1-contract-hash',
    contractSource: 'template_forge',
    outputKinds: ['image'],
    variableCount: variables.length,
    previewUrl: null,
    updatedAt: '2026-09-14T09:00:00.000Z',
    ratios,
    displayName,
  });

const THREE_CONTRACT: ApiRenderTemplateContract = apiRenderTemplateContractSchema.parse({
  template: summary(PROMO.templateKey, PROMO.title, THREE_RATIOS),
  variables,
  outputs: [
    { id: 'wide', label: 'Wide', ratio: '16:9' },
    { id: 'square', label: 'Square', ratio: '1:1' },
    { id: 'story', label: 'Story', ratio: '9:16' },
  ],
});

const ZERO_CONTRACT: ApiRenderTemplateContract = apiRenderTemplateContractSchema.parse({
  template: summary(ZERO_TEMPLATE_KEY, 'StarCraft 133', THREE_RATIOS),
  variables,
  outputs: [],
});

/** Answers one GET the way the fixtures do: cross-origin, JSON, CORS headers on. */
async function answer(context: BrowserContext, path: string, body: unknown) {
  await context.route(
    (url) => url.pathname === path,
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
      if (route.request().method() !== 'GET') {
        await route.fallback();
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
  template: 'three' | 'zero',
): Promise<{ page: Page; fixtures: ForgeFixtures }> {
  if (!session) throw new Error('[render-grid-bench] no minted session');
  const context = await browser.newContext({ storageState: session.state, viewport });
  opened.push(context);
  const fixtures = await installForgeFixtures(context);
  activeFixtures.push(fixtures);
  // Registered after the fixtures, so these answer first.
  if (template === 'three') {
    fixtures.state.sets = fixtures.state.sets.map((set) => ({
      ...set,
      rows: set.rows.map((row) =>
        row.parentId === null ? { ...row, outputIds: ['wide', 'square', 'story'] } : row,
      ),
    }));
    await answer(
      context,
      `/api/ai-studio/renders/templates/${PROMO.templateKey}/contract`,
      THREE_CONTRACT,
    );
  } else {
    await answer(
      context,
      '/api/ai-studio/renders/templates',
      apiRenderTemplateListResponseSchema.parse({
        items: [ZERO_CONTRACT.template],
        nextCursor: null,
      }),
    );
    await answer(
      context,
      `/api/ai-studio/renders/templates/${ZERO_TEMPLATE_KEY}/contract`,
      ZERO_CONTRACT,
    );
  }
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

// --- page helpers --------------------------------------------------------------------------

/** A grid row, found by its drag handle — the one control named after the row. */
const gridRow = (page: Page, label: string): Locator =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Drag ${label}`, exact: true }) });

const ratiosIn = (row: Locator) =>
  row
    .locator('[data-formats] [data-ratio]')
    .evaluateAll((chips) => chips.map((chip) => (chip as HTMLElement).dataset.ratio));

const formatsState = (row: Locator) =>
  row.locator('[data-formats]').first().getAttribute('data-formats');

const selectedCount = (page: Page) =>
  page.getByRole('region', { name: 'Selected rows' }).locator('span').first();

/** Hover the row so its quick adds show, then press one. */
async function quickAdd(page: Page, label: string, action: 'Add variation' | 'Row below') {
  const row = gridRow(page, label);
  await row.getByRole('textbox', { name: 'Row name', exact: true }).scrollIntoViewIfNeeded();
  await row.hover();
  await row.getByRole('button', { name: action, exact: true }).click();
}

const guides = (row: Locator) => row.locator('[data-guide]').count();

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS_DIR, `grid-${name}.png`) }).catch(() => undefined);
}

const currentStep = (tray: Locator) =>
  tray.getByRole('list', { name: 'Pre-flight steps' }).locator('li[aria-current="step"]');

/** The tray's one way forward: the last button in its footer, named for the step it takes. */
const primary = (tray: Locator) => tray.locator('footer').getByRole('button').last();

async function pressPrimary(tray: Locator, name: string) {
  await expect(primary(tray)).toHaveText(name);
  await expect(primary(tray)).toBeEnabled();
  await primary(tray).click();
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

test.describe('Render grid — fixtures', () => {
  test.skip(LIVE, 'the grid bench runs on fixtures only');

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

    test(`GRID1 · ${size} · quick adds keep the selection; formats, totals, and the docked tray to one batch`, async ({
      browser,
    }) => {
      const { page, fixtures } = await openRenderTab(browser, viewport, 'three');
      const root = gridRow(page, ROWS.root);
      await expect(root.getByText('Ready', { exact: true })).toBeVisible();

      // Every row names the ratios it renders; forks show their parent's, muted.
      for (const label of Object.values(ROWS)) {
        const row = gridRow(page, label);
        await expect.poll(() => ratiosIn(row)).toEqual(THREE_RATIOS);
        expect(await formatsState(row)).toBe(label.includes('·') ? 'inherited' : 'own');
      }
      expect(await guides(gridRow(page, ROWS.launchGrandFork))).toBe(2);
      await expect(gridRow(page, ROWS.rootFork).getByText('inherits · 1 changed')).toBeVisible();

      // The quick adds wait for the pointer.
      const solo = gridRow(page, ROWS.solo);
      await expect(solo.getByRole('button', { name: 'Add variation', exact: true })).toBeHidden();
      await solo.hover();
      await expect(solo.getByRole('button', { name: 'Add variation', exact: true })).toBeVisible();

      await root.getByRole('checkbox', { name: 'Select row' }).click();
      await expect(selectedCount(page)).toHaveText('1 selected');

      // Add variation: a child that inherits everything, named next, selection untouched.
      await quickAdd(page, ROWS.root, 'Add variation');
      const variation = gridRow(page, 'Root · C');
      await expect(variation.getByText('inherits · 0 changed')).toBeVisible();
      await expect(variation.getByRole('textbox', { name: 'Row name', exact: true })).toBeFocused();
      expect(await guides(variation)).toBe(1);
      await expect(selectedCount(page)).toHaveText('1 selected');
      await expect(root.getByRole('checkbox', { name: 'Select row' })).toBeChecked();
      await expect(variation.getByRole('checkbox', { name: 'Select row' })).not.toBeChecked();

      // Row below the variation: a sibling at the same depth, inheriting too.
      await quickAdd(page, 'Root · C', 'Row below');
      const sibling = gridRow(page, 'Root · D');
      await expect(sibling.getByText('inherits · 0 changed')).toBeVisible();
      expect(await guides(sibling)).toBe(1);
      // Row below a root: a new root.
      await quickAdd(page, ROWS.solo, 'Row below');
      await expect(gridRow(page, 'Render 9')).toBeVisible();
      expect(await guides(gridRow(page, 'Render 9'))).toBe(0);
      await expect(selectedCount(page)).toHaveText('1 selected');
      await shoot(page, `${size}-quick-adds`);

      // Narrow the variation to 1:1; its sibling keeps inheriting all three.
      await variation.getByRole('button', { name: /^Formats / }).click();
      await page.getByRole('menuitemcheckbox', { name: /Wide/ }).click();
      await page.getByRole('menuitemcheckbox', { name: /Story/ }).click();
      await page.keyboard.press('Escape');
      await expect.poll(() => ratiosIn(variation)).toEqual(['1:1']);
      expect(await formatsState(variation)).toBe('own');
      await expect(variation.getByText('inherits · 1 changed')).toBeVisible();
      await expect.poll(() => ratiosIn(sibling)).toEqual(THREE_RATIOS);
      expect(await formatsState(sibling)).toBe('inherited');

      // Render totals the selection: Root 3 files + the variation 1.
      await expect(variation.getByText('Ready', { exact: true })).toBeVisible();
      await variation.getByRole('checkbox', { name: 'Select row' }).click();
      const render = page.getByRole('button', { name: 'Render 2 rows · 4 files', exact: true });
      await expect(render).toBeEnabled();
      await render.hover();
      await expect(page.getByText('16:9 ×1')).toBeVisible();
      await expect(page.getByText('1:1 ×2')).toBeVisible();
      await shoot(page, `${size}-render-total`);
      await render.click();

      // The tray docks under the grid: no dialog, and the grid is still there to use.
      const tray = page.getByRole('region', { name: 'Review and render' });
      await expect(tray).toBeVisible();
      await expect(page.locator('[role="dialog"], [role="alertdialog"]')).toHaveCount(0);
      await expect(tray.getByText('Ready · 2 of 2 rows checked')).toBeVisible();
      await expect(tray.getByText(`${PROMO.title} · 4 files`)).toBeVisible();
      const gridBox = await page.getByRole('table').boundingBox();
      const trayBox = await tray.boundingBox();
      expect(gridBox && trayBox && gridBox.y + 40 < trayBox.y, 'the grid sits above the tray').toBe(
        true,
      );
      await expect(root).toBeVisible();
      await root.getByRole('cell').last().click();
      await shoot(page, `${size}-tray-review`);

      // Walk to the last step (no Meta target, so Deliver), then change a row: back to Review,
      // and nothing renders until the tray has re-checked by itself.
      await pressPrimary(tray, 'Next: delivery');
      await expect(primary(tray)).toHaveText('Render 4 files');
      await expect(primary(tray)).toBeEnabled();
      const puts = fixtures.calls('PUT', /\/renders\/sets\//).length;
      const reviews = fixtures.calls('POST', /\/renders\/batch-preflight$/).length;
      const name = variation.getByRole('textbox', { name: 'Row name', exact: true });
      await name.click();
      // Not press('End'): on macOS Chromium it scrolls instead of moving the caret.
      await name.evaluate((input: HTMLInputElement) =>
        input.setSelectionRange(input.value.length, input.value.length),
      );
      await name.pressSequentially(' EU');
      await expect(tray.getByText('Rows changed since review')).toBeVisible();
      await expect(currentStep(tray)).toHaveText('Review');
      await expect(primary(tray)).toHaveText('Next: delivery');
      await expect(primary(tray)).toBeDisabled();
      // A re-check that can run needs no button: it only shows, disabled, when one is blocked.
      await expect(tray.getByRole('button', { name: 'Re-check', exact: true })).toHaveCount(0);
      await shoot(page, `${size}-tray-stale`);
      await expect(tray.getByText('Rows changed since review')).toBeHidden();
      // The re-check saved the renamed row, then reviewed the new revision.
      await expect.poll(() => fixtures.calls('PUT', /\/renders\/sets\//).length).toBe(puts + 1);
      await expect
        .poll(() => fixtures.calls('POST', /\/renders\/batch-preflight$/).length)
        .toBe(reviews + 1);

      await pressPrimary(tray, 'Next: delivery');
      await pressPrimary(tray, 'Render 4 files');
      await expect.poll(() => fixtures.calls('POST', /\/renders\/batches$/).length).toBe(1);
      const confirmed = fixtures.calls('POST', /\/renders\/batch-preflight$/).at(-1)
        ?.body as ApiRenderBatchPreflightRequest;
      expect(confirmed.records.map((record) => record.label)).toEqual(['Root', 'Root · C EU']);
      expect(confirmed.records.map((record) => record.outputIds)).toEqual([
        ['wide', 'square', 'story'],
        ['square'],
      ]);

      // Running follows exactly the fired jobs, still on the Render tab.
      const fired = tray.getByRole('list', { name: 'Fired renders' });
      await expect(fired.getByRole('listitem')).toHaveCount(2);
      await expect(fired.getByRole('button', { name: 'Root · C EU', exact: true })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Render', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await shoot(page, `${size}-tray-running`);
      expect(fixtures.calls('POST', /\/renders\/batches$/)).toHaveLength(1);
    });

    test(`GRID2 · ${size} · a zero-output template shows its ratios, counts them, and renders them together`, async ({
      browser,
    }) => {
      const { page, fixtures } = await openRenderTab(browser, viewport, 'zero');
      // A set seeded from the template starts from one row named "Base".
      const root = gridRow(page, 'Base');
      await expect(root.getByText('Ready', { exact: true })).toBeVisible();
      const together = root.getByRole('group', {
        name: 'Formats 16:9, 1:1, 9:16. This template renders every format together',
      });
      await expect(together).toBeVisible();
      await expect.poll(() => ratiosIn(root)).toEqual(THREE_RATIOS);
      await together.hover();
      await expect(page.getByText('This template renders every format together')).toBeVisible();

      await root.getByRole('checkbox', { name: 'Select row' }).click();
      await quickAdd(page, 'Base', 'Add variation');
      const variation = gridRow(page, 'Base · B');
      await expect(variation.getByText('inherits · 0 changed')).toBeVisible();
      await expect.poll(() => ratiosIn(variation)).toEqual(THREE_RATIOS);
      await expect(selectedCount(page)).toHaveText('1 selected');

      const render = page.getByRole('button', { name: 'Render 1 row · 3 files', exact: true });
      await expect(render).toBeEnabled();
      await shoot(page, `${size}-zero-output`);
      await render.click();
      // A seeded set was never saved: it becomes "Untitled set" with no question, then is reviewed.
      await expect.poll(() => fixtures.calls('POST', /\/renders\/sets$/).length).toBe(1);
      expect(
        (fixtures.calls('POST', /\/renders\/sets$/)[0]?.body as { name?: string } | undefined)
          ?.name,
      ).toBe('Untitled set');
      const tray = page.getByRole('region', { name: 'Review and render' });
      await expect(tray.getByText('StarCraft 133 · 3 files')).toBeVisible();
      await expect(page.locator('[role="dialog"], [role="alertdialog"]')).toHaveCount(0);
      await expect
        .poll(() =>
          tray
            .getByRole('list', { name: 'Rows to render' })
            .locator('[data-ratio]')
            .evaluateAll((chips) => chips.map((chip) => (chip as HTMLElement).dataset.ratio)),
        )
        .toEqual(THREE_RATIOS);
      await expect(tray.getByText('3 files', { exact: true })).toBeVisible();
      await pressPrimary(tray, 'Next: delivery');
      await pressPrimary(tray, 'Render 3 files');
      await expect.poll(() => fixtures.calls('POST', /\/renders\/batches$/).length).toBe(1);
      const confirmed = fixtures.calls('POST', /\/renders\/batch-preflight$/).at(-1)
        ?.body as ApiRenderBatchPreflightRequest;
      // No outputs to name: the record asks for none, and the server renders every ratio.
      expect(confirmed.records).toHaveLength(1);
      expect(confirmed.records[0]?.outputIds).toBeUndefined();
      await expect(
        tray.getByRole('list', { name: 'Fired renders' }).getByRole('listitem'),
      ).toHaveCount(1);
      await shoot(page, `${size}-zero-running`);
    });
  }
});
