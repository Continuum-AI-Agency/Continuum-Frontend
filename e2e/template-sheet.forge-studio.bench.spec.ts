import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type TemplateSource,
  type TemplateSourceSummary,
  templateSourceSchema,
  templateSourceSummarySchema,
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

// ---------------------------------------------------------------------------
// forge:studio:e2e:bench · template sheet — a template's detail as a Deployment-style sheet,
// proven in a REAL Chrome at 1280×800 and 1920×1200.
//
// Real: Chrome, a minted StarCraft session pinned to StarCraft for this session only, the
// server-rendered /forge page against production Supabase, and every Forge component on it.
// FIXTURES: every /api/ai-studio/** call is answered by the shared contract-parsed fixtures, with
// two routes overridden here — the template list (a three-format promo: 16:9, 1:1, 9:16) and the
// font readiness (one face uploaded, one not). The backend URL is a dead port.
// NOT exercised: the Fastify backend, the forge engine, the render fleet.
//
// Usage:
//   cd Continuum-Frontend && FORGE_STUDIO_E2E_PORT=3121 \
//     FORGE_STUDIO_DIST_DIR=.next/forge-studio-e2e-sheet \
//     bun run forge:studio:e2e:bench -- e2e/template-sheet.forge-studio.bench.spec.ts
// ---------------------------------------------------------------------------

const { publishableKey, serviceRoleKey } = loadProdSupabaseEnv();

const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const OWNER_EMAIL = 'duane@continuumai.agency';
const RUN_ID = process.env.FORGE_STUDIO_RUN_ID ?? String(Date.now());
const SHOTS_DIR = resolve(__dirname, '__screenshots__/forge-studio');
const RESULTS_PATH = join(tmpdir(), `forge-studio-sheet-bench-${RUN_ID}.jsonl`);

const PROMO = FORGE_FIXTURE.promo;
const MISSING_FACE = 'Koprulu Sans Condensed';
const FORMATS = [
  { ratio: '16:9', width: 1920, height: 1080, comp: 'Wide 1920' },
  { ratio: '1:1', width: 1080, height: 1080, comp: PROMO.compName },
  { ratio: '9:16', width: 1080, height: 1920, comp: 'Story 1080x1920' },
] as const;

/** Every sentence a CHECKS row must say about what it checks. */
const CHECK_WHAT: Record<string, string> = {
  Parse: 'Opens the After Effects file and lists its formats, editable layers and fonts.',
  Fonts:
    'Checks the brand has uploaded every typeface the template uses. Renders are refused while one is missing.',
  Build:
    'Turns the file into a renderable template: works out its fields, builds its table, seeds a sample row, validates the spec.',
  'Test render': 'Renders one watermarked frame to prove each variable reaches its layer.',
  Publish: 'Adds it to the render catalog so this brand can render it.',
};

let session: MintedSession | null = null;
const opened: BrowserContext[] = [];

// --- session ---------------------------------------------------------------------------------

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('[template-sheet-bench] access token has no payload');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    session_id?: string;
  };
  if (!claims.sub || !claims.session_id) {
    throw new Error('[template-sheet-bench] access token carries no sub or session_id claim');
  }
  return { sub: claims.sub, session_id: claims.session_id };
}

/** Pins THIS session to StarCraft through the member's own RLS, then reads it back. */
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
  if (error) throw new Error(`[template-sheet-bench] session brand pin failed: ${error.message}`);
  const { data, error: resolveError } = await member
    .schema('brand_profiles')
    .rpc('resolve_active_brand_for_session');
  if (resolveError || data !== STARCRAFT_BRAND_ID) {
    throw new Error(
      `[template-sheet-bench] the session resolves to ${String(data)} (${resolveError?.message ?? 'no error'}), not StarCraft`,
    );
  }
}

// --- envelope ----------------------------------------------------------------------------------

type Grade = { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string };

function recordGrade(testInfo: TestInfo): void {
  const grade: Grade = {
    step: testInfo.title,
    grade: testInfo.status === 'passed' ? 'PASS' : testInfo.status === 'skipped' ? 'SKIP' : 'FAIL',
    ...(testInfo.error?.message ? { detail: testInfo.error.message.slice(0, 500) } : {}),
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
  console.log(
    JSON.stringify({
      bench: 'forge:studio:e2e:bench · template-sheet',
      mode: 'fixtures',
      results,
      notes: [
        'FIXTURES: every /api/ai-studio/** call was answered in the browser by contract-parsed fixtures; the template list and font readiness were overridden in this spec; the backend URL is a dead port.',
        'NOT exercised: the Fastify backend, the forge engine and the render fleet. Real: Chrome, the minted StarCraft session, the server-rendered brand context, and the template sheet components.',
      ],
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

// --- fixtures ------------------------------------------------------------------------------------

/** The template list serves card-sized parse geometry only, exactly as the Backend's list route does. */
function asSummary(source: TemplateSource): TemplateSourceSummary {
  const { parse } = source;
  return templateSourceSummarySchema.parse({
    ...source,
    parse: parse
      ? {
          parser: parse.parser,
          sourceFamily: parse.sourceFamily,
          filename: parse.filename,
          comps: parse.comps.map(({ name, width, height, durationSec, isDelivery }) => ({
            name,
            width,
            height,
            durationSec,
            isDelivery,
          })),
          ratios: parse.ratios,
          slots: parse.slots.map(({ key, kind, comps, box, placement, instances }) => ({
            key,
            kind,
            comps,
            box,
            placement,
            instances,
          })),
        }
      : null,
  });
}

/** The promo with three formats, so the sheet has a wide, a square and a tall frame to name. */
function threeFormatPromo(): TemplateSource {
  const slots = [
    { key: 'headline', name: 'Headline', kind: 'text' },
    { key: 'tagline', name: 'Tagline', kind: 'text' },
    { key: 'hero', name: 'Hero image', kind: 'image' },
    { key: 'accent', name: 'Accent colour', kind: 'color' },
  ];
  return templateSourceSchema.parse({
    assetId: PROMO.assetId,
    brandId: STARCRAFT_BRAND_ID,
    versionId: '8b2f5d3c-4e6a-4b7c-8d9e-1f2a3b4c5d6e',
    family: 'after_effects',
    parseState: 'parsed',
    parse: {
      parser: 'py_aep',
      sourceFamily: 'after_effects',
      appVersion: '25.2',
      filename: `${PROMO.assetId}.aep`,
      comps: FORMATS.map((format) => ({
        name: format.comp,
        width: format.width,
        height: format.height,
        layerCount: 14,
        isTop: true,
        isDelivery: true,
      })),
      ratios: FORMATS.map((format) => ({
        ratio: format.ratio,
        width: format.width,
        height: format.height,
        comps: [format.comp],
      })),
      slots: slots.map((slot, index) => ({
        ...slot,
        origin: 'essential',
        driver: 'static',
        comps: FORMATS.map((format) => format.comp),
        layerIds: [3 + index],
        instances: FORMATS.map((format, compIndex) => ({
          compId: compIndex + 1,
          comp: format.comp,
          layerId: 3 + index,
          box: [80, 80 + index * 200, format.width - 80, 240 + index * 200],
          compSize: [format.width, format.height],
        })),
      })),
      fonts: [
        { family: 'HeadingNow-36CompBold', layers: 2 },
        { family: MISSING_FACE, layers: 1 },
      ],
      staticText: [],
      warnings: [],
    },
    fonts: ['HeadingNow-36CompBold', MISSING_FACE],
    ratios: FORMATS.map((format) => format.ratio),
    slotCount: slots.length,
    forgeRunId: 'run_sc_promo_v1',
    forgeState: 'published',
    templateKey: PROMO.templateKey,
    displayName: PROMO.title,
    createdAt: '2026-09-10T09:00:00.000Z',
    updatedAt: '2026-09-14T09:00:00.000Z',
  });
}

/** Registered after the shared fixtures, so these answer first. */
async function overrideSheetRoutes(context: BrowserContext): Promise<void> {
  const json = async (
    route: Parameters<Parameters<BrowserContext['route']>[1]>[0],
    body: unknown,
  ) => {
    const origin = (await route.request().headerValue('origin')) ?? '*';
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  };
  await context.route(
    (url) => url.pathname === '/api/ai-studio/templates',
    (route) =>
      route.request().method() === 'GET'
        ? json(route, { items: [asSummary(threeFormatPromo())] })
        : route.fallback(),
  );
  await context.route(
    (url) => /^\/api\/ai-studio\/templates\/[0-9a-f-]{36}\/fonts$/.test(url.pathname),
    (route) =>
      route.request().method() === 'GET'
        ? json(route, {
            fonts: [
              { family: 'HeadingNow-36CompBold', layers: 2, held: true },
              { family: MISSING_FACE, layers: 1, held: false },
            ],
            missing: 1,
            parseState: 'parsed',
          })
        : route.fallback(),
  );
}

// --- page helpers ----------------------------------------------------------------------------------

async function openSheet(
  browser: Browser,
  viewport: { width: number; height: number },
): Promise<{ page: Page; fixtures: ForgeFixtures }> {
  if (!session) throw new Error('[template-sheet-bench] no minted session');
  const context = await browser.newContext({ storageState: session.state, viewport });
  opened.push(context);
  const fixtures = await installForgeFixtures(context);
  await overrideSheetRoutes(context);
  const page = await context.newPage();
  await page.goto('/forge', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 180_000,
  });
  const card = page.getByRole('button', { name: `Open ${PROMO.title}`, exact: true });
  const title = page.getByRole('heading', { level: 2 }).filter({ hasText: PROMO.title });
  // A click on server-rendered markup before hydration does nothing, so retry until it opens.
  await expect(async () => {
    await card.click();
    await expect(title).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  return { page, fixtures };
}

/**
 * The whole sheet, not the viewport: `main` is the page's scroll container, so a full-page shot
 * would stop at the fold. An element shot of the sheet captures past it.
 */
async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  const sheet = page
    .locator('header', { has: page.getByRole('heading', { level: 2 }) })
    .locator('..');
  await sheet.screenshot({ path: resolve(SHOTS_DIR, `sheet-${name}.png`) });
}

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    };
  });

// --- the run -----------------------------------------------------------------------------------------

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

test.describe('Forge Studio — template sheet', () => {
  test.skip(LIVE, 'the template sheet bench runs on fixtures only');

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterEach(async ({}, testInfo) => {
    await Promise.all(opened.splice(0).map((context) => context.close().catch(() => undefined)));
    recordGrade(testInfo);
  });

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1920, height: 1200 },
  ]) {
    const size = `${viewport.width}x${viewport.height}`;

    test(`SHEET ${size} · facts, five self-explaining checks, one-row variables, tabs that keep edits`, async ({
      browser,
    }) => {
      const { page, fixtures } = await openSheet(browser, viewport);

      // Facts: Formats names three shapes; the counts come from the fixtures' reads.
      const formats = page
        .locator('dt', { hasText: /^Formats$/ })
        .locator('xpath=following-sibling::dd[1]');
      await expect(formats).toHaveText('16:91:19:16');
      await expect(formats.locator('span[style*="aspect-ratio"]')).toHaveCount(3);
      const factOf = (label: string) =>
        page
          .locator('dt', { hasText: new RegExp(`^${label}$`) })
          .locator('xpath=following-sibling::dd[1]');
      await expect(factOf('Fonts')).toHaveText('2 · 1 missing');
      await expect(factOf('Variables')).toHaveText('4 · 3 unassigned');
      await expect(factOf('Sets')).toHaveText('1');
      await expect(factOf('Last render').getByRole('img', { name: '2 of 3 done' })).toBeVisible();

      // CHECKS: five rows, each saying what it checks.
      const checks = page.getByRole('list', { name: 'Checks' });
      const rows = checks.getByRole('listitem');
      await expect(rows).toHaveCount(5);
      for (const [index, [name, what]] of Object.entries(CHECK_WHAT).entries()) {
        const row = rows.nth(index);
        await expect(row.locator('.font-mono').first()).toHaveText(name);
        await expect(row.getByText(what, { exact: true })).toBeVisible();
      }
      await expect(page.getByRole('status').filter({ hasText: /^1 failed$/ })).toBeVisible();

      // Wide screens pack, never spread: CHECKS sits beside the preview under the facts, the
      // second fact pair stays near the first, and a row's ticks and a variable's budget stay
      // within the capped row instead of drifting to the far edge.
      const rootPx = await page.evaluate(() =>
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      );
      const boxOf = async (locator: Locator) => {
        const box = await locator.boundingBox();
        if (!box)
          throw new Error('[template-sheet-bench] an element that should be laid out is not');
        return box;
      };
      const preview = await boxOf(page.getByRole('group', { name: 'Preview' }));
      const checksBox = await boxOf(checks);
      const factsBox = await boxOf(
        page
          .locator('dl')
          .filter({ has: page.locator('dt') })
          .first(),
      );
      const statusLabel = await boxOf(page.locator('dt', { hasText: /^Status$/ }));
      const formatsLabel = await boxOf(page.locator('dt', { hasText: /^Formats$/ }));
      const fontsRow = await boxOf(rows.nth(1));
      const fontsTicks = await boxOf(rows.nth(1).getByRole('img', { name: '1 of 2 done' }));
      const fontsMark = await boxOf(rows.nth(1).getByRole('img', { name: 'Failed' }));
      const layout = {
        rootPx,
        checksLeftOfPreviewRight: checksBox.x - (preview.x + preview.width),
        checksTopUnderFacts: checksBox.y - (factsBox.y + factsBox.height),
        checksTopAbovePreviewBottom: preview.y + preview.height - checksBox.y,
        factPairGapRem: (formatsLabel.x - statusLabel.x) / rootPx,
        fontsTicksRem: (fontsTicks.x - fontsRow.x) / rootPx,
        fontsMarkRem: (fontsMark.x - fontsRow.x) / rootPx,
      };
      console.log(`[template-sheet-bench] ${size} layout ${JSON.stringify(layout)}`);
      expect(layout.checksLeftOfPreviewRight, 'CHECKS is right of the preview').toBeGreaterThan(0);
      expect(layout.checksTopUnderFacts, 'CHECKS is under the facts').toBeGreaterThanOrEqual(0);
      expect(
        layout.checksTopAbovePreviewBottom,
        'CHECKS starts beside the preview',
      ).toBeGreaterThan(0);
      expect(layout.factPairGapRem, 'the second fact pair sits near the first').toBeLessThan(24);
      expect(layout.fontsTicksRem, 'ticks stay within the 60rem row').toBeLessThan(60);
      expect(layout.fontsMarkRem, 'the status mark leads the row').toBeLessThan(3);
      await shoot(page, `${viewport.width}`);

      // The footer's next step opens the failing FONTS row onto the per-family state.
      await page.getByRole('button', { name: 'Investigate', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Fonts details' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      const faces = page.getByRole('list', { name: 'Typefaces' });
      await expect(faces.getByText('HeadingNow-36CompBold · uploaded')).toBeVisible();
      await expect(faces.getByText(`${MISSING_FACE} · not uploaded`)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Review font install' })).toBeVisible();
      await shoot(page, `${viewport.width}-fonts`);

      // Variables: one h-8 row per variable; opening one shows Name / Means / Default.
      const variables = page.getByRole('list', { name: 'Variables' });
      const triggers = variables.getByRole('listitem').locator('h3 > button');
      await expect(triggers).toHaveCount(4);
      for (const box of await triggers.evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().height),
      )) {
        expect(
          Math.abs(box - 2 * rootPx),
          `row height ${box}px vs h-8 at ${rootPx}px root`,
        ).toBeLessThan(1);
      }
      const budget = await boxOf(triggers.first().getByText('28 ch', { exact: true }));
      const headlineRow = await boxOf(triggers.first());
      const budgetRem = (budget.x - headlineRow.x) / rootPx;
      console.log(`[template-sheet-bench] ${size} variable budget at ${budgetRem.toFixed(1)}rem`);
      expect(budgetRem, "a variable's budget stays within the packed row").toBeLessThan(54);
      await triggers.nth(1).click();
      const openRow = variables.getByRole('listitem').nth(1);
      for (const label of ['Name', 'Means', 'Default']) {
        await expect(openRow.getByText(label, { exact: true })).toBeVisible();
      }
      await triggers.nth(0).click();
      const headlineDefault = page.getByLabel('Headline default', { exact: true });
      await headlineDefault.fill('Unsaved zerg rush');
      await expect(page.getByText('1 changed', { exact: true })).toBeVisible();

      const scroll = await noHorizontalScroll(page);
      console.log(
        `[template-sheet-bench] ${size} overflow ${JSON.stringify(scroll)} root=${rootPx}px`,
      );
      expect(scroll.document).toBeLessThanOrEqual(0);
      expect(scroll.main).toBeLessThanOrEqual(0);
      await shoot(page, `${viewport.width}-variables`);

      // Switching tabs keeps the unsaved edit.
      for (const tab of ['History', 'Details', 'Variables']) {
        const trigger = page.getByRole('tab', { name: tab, exact: true });
        await trigger.click();
        await expect(trigger).toHaveAttribute('aria-selected', 'true');
      }
      await expect(headlineDefault).toHaveValue('Unsaved zerg rush');
      await expect(page.getByText('1 changed', { exact: true })).toBeVisible();

      expect(fixtures.violations, 'a body the real contract refuses').toEqual([]);
      expect([...fixtures.brandIds]).toEqual([STARCRAFT_BRAND_ID]);
    });
  }
});
