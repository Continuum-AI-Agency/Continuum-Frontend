import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  apiRenderTemplateListResponseSchema,
  apiRenderTemplateSummarySchema,
  workspaceTemplateSchema,
} from '@continuum/contracts';
import {
  type Browser,
  type BrowserContext,
  expect,
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

// forge:studio:e2e:bench — ONE list, and no workspace anywhere in the Forge.
//
// The Forge used to make a person choose a sub-app before it would show them anything: a
// "Render workspace" submenu on the Render tab, a "build in workspace" select on the template
// sheet, an environment picker on the canvas render node, plus a gallery that fanned a discover
// call out per workspace and an N+1 loop that listed each workspace until a template key turned
// up. All of it asked the person about our deployment topology in order to make an ad.
//
// The trap this pins is that TEMPLATE KEYS ARE PER SUB-APP. `Continuum_app` 133 is StarCraft's
// promo; `Parsed_app` 133 is another client's product template. A merged list keyed on the key
// alone collapses them into one row, and whichever won would render the other tenant's comp —
// which is precisely why the fixtures below hand the page TWO bindings holding the SAME key.
//
// Same harness as the other forge-studio specs: a real minted StarCraft session, the
// server-rendered /forge page, every /api/ai-studio/** call answered in the browser by fixtures
// parsed through the real contracts, and the backend a dead port.
//
//   CONSOLIDATED  the Render tab's template picker holds both 133s and offers no workspace
//                 control; the two rows are distinct and each carries its own binding
//   NO PICKERS    no combobox, menu item or radio anywhere in the Forge is named for a workspace
//   ONE READ      the gallery reads /templates/discover ONCE and never lists workspaces
//   THE PAIR      choosing the Parsed_app 133 asks for ITS contract with ITS binding, not the
//                 default binding's — the whole point of carrying the pair
//
// It does NOT exercise the Fastify backend, the render fleet, Slack or Meta.
//
// Usage:
//   cd Continuum-Frontend && FORGE_STUDIO_E2E_PORT=3124 \
//     FORGE_STUDIO_DIST_DIR=.next/forge-studio-e2e-consolidated \
//     bun run forge:studio:e2e:bench -- e2e/consolidated.forge-studio.bench.spec.ts

const { publishableKey, serviceRoleKey } = loadProdSupabaseEnv();

const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const OWNER_EMAIL = 'duane@continuumai.agency';
const RUN_ID = process.env.FORGE_STUDIO_RUN_ID ?? String(Date.now());
const SHOTS_DIR = resolve(__dirname, '__screenshots__/forge-studio');
const RESULTS_PATH = join(tmpdir(), `forge-studio-bench-${RUN_ID}.jsonl`);

const PROMO = FORGE_FIXTURE.promo;
/** StarCraft's second binding — the legacy `Parsed_app` grant that holds a COLLIDING key. */
const LEGACY_BINDING_ID = '7c2f1b90-3d4e-4a5b-8c6d-1e2f3a4b5c6d';
/** The same number in both sub-apps. Two different clients' templates. */
const COLLIDING_KEY = '133';

let session: MintedSession | null = null;
const opened: BrowserContext[] = [];
const activeFixtures: ForgeFixtures[] = [];

// --- session and envelope (the pattern every forge-studio spec shares) ----------------------

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('[consolidated-bench] access token has no payload');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    session_id?: string;
  };
  if (!claims.sub || !claims.session_id) {
    throw new Error('[consolidated-bench] access token carries no sub or session_id claim');
  }
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
  if (error) throw new Error(`[consolidated-bench] session brand pin failed: ${error.message}`);
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
        'FIXTURES: every /api/ai-studio/** call answered in the browser through the real contracts, with TWO bindings holding the same template key 133; the backend URL is a dead port.',
        'NOT exercised: the Fastify backend, the render fleet, Slack and Meta. Real: Chrome, the minted StarCraft session, the server-rendered brand context, and every Forge component.',
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

// --- two bindings, one colliding key ---------------------------------------------------------

const summary = (bindingId: string, environment: string, displayName: string) =>
  apiRenderTemplateSummarySchema.parse({
    key: COLLIDING_KEY,
    name: COLLIDING_KEY,
    bindingId,
    environment,
    contractVersion: '1',
    contractHash: 'sc-promo-v1-contract-hash',
    contractSource: 'template_forge',
    outputKinds: ['image'],
    variableCount: 4,
    previewUrl: null,
    updatedAt: '2026-09-14T09:00:00.000Z',
    ratios: ['1:1', '9:16'],
    displayName,
  });

/** What the merged endpoint answers: the same key twice, told apart only by its binding. */
const MERGED_TEMPLATES = apiRenderTemplateListResponseSchema.parse({
  items: [
    summary(BINDING_ID, 'Continuum_app', PROMO.title),
    summary(LEGACY_BINDING_ID, 'Parsed_app', 'Legacy product card'),
  ],
  nextCursor: null,
});

/** The gallery's merged discover answer — one read, two bindings. */
const MERGED_DISCOVER = {
  workspace: {
    id: BINDING_ID,
    picinst: 'Continuum_app',
    environmentKey: 'prod',
    clientKey: 'starcraft_b17d81',
    isDefault: true,
  },
  items: [
    workspaceTemplateSchema.parse({
      templateKey: COLLIDING_KEY,
      templateId: 133,
      bindingId: BINDING_ID,
      name: 'starcraft_promo',
      rootTable: 'tpl_starcraft_b17d81_starcraft_promo_root',
      updatedAt: '2026-09-14T09:00:00.000Z',
      granted: true,
      draft: false,
    }),
    workspaceTemplateSchema.parse({
      templateKey: COLLIDING_KEY,
      templateId: 133,
      bindingId: LEGACY_BINDING_ID,
      name: 'legacy_product_card',
      rootTable: 'tpl_sams_products_legacy_product_card_root',
      updatedAt: '2026-08-01T09:00:00.000Z',
      granted: true,
      draft: false,
    }),
  ],
};

/** Every contract read the page makes, so a test can assert WHICH binding was asked for. */
const contractReads: Array<{ templateKey: string; bindingId: string | null }> = [];
/**
 * Every merged-list read, recorded HERE rather than read back off `fixtures.requests`: these
 * routes are registered after the fixtures so they answer first, which means the fixture
 * recorder never sees them.
 */
const listReads: Array<{ bindingId: string | null }> = [];
const discoverReads: Array<{ workspaceId: string | null }> = [];

async function answer(
  context: BrowserContext,
  matches: (url: URL) => boolean,
  body: unknown,
  onCall?: (url: URL) => void,
) {
  await context.route(
    (url) => matches(url),
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
      onCall?.(new URL(route.request().url()));
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
  tab: 'Render' | 'Templates',
): Promise<{ page: Page; fixtures: ForgeFixtures }> {
  if (!session) throw new Error('[consolidated-bench] no minted session');
  const context = await browser.newContext({
    storageState: session.state,
    viewport: { width: 1440, height: 900 },
  });
  opened.push(context);
  const fixtures = await installForgeFixtures(context);
  activeFixtures.push(fixtures);

  // Registered after the fixtures, so these answer first.
  await answer(
    context,
    (url) => url.pathname === '/api/ai-studio/renders/templates',
    MERGED_TEMPLATES,
    (url) => listReads.push({ bindingId: url.searchParams.get('bindingId') }),
  );
  await answer(
    context,
    (url) => url.pathname === '/api/ai-studio/templates/discover',
    MERGED_DISCOVER,
    (url) => discoverReads.push({ workspaceId: url.searchParams.get('workspaceId') }),
  );
  await answer(
    context,
    (url) => /^\/api\/ai-studio\/renders\/templates\/[^/]+\/contract$/.test(url.pathname),
    null,
    (url) =>
      contractReads.push({
        templateKey: decodeURIComponent(url.pathname.split('/').at(-2) ?? ''),
        bindingId: url.searchParams.get('bindingId'),
      }),
  );

  const page = await context.newPage();
  await page.goto('/forge', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 180_000,
  });
  const target = page.getByRole('tab', { name: tab, exact: true });
  // A click before hydration does nothing; retry until the tab really is selected.
  await expect(async () => {
    await target.click();
    await expect(target).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
  return { page, fixtures };
}

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page
    .screenshot({ path: resolve(SHOTS_DIR, `consolidated-${name}.png`) })
    .catch(() => undefined);
}

/**
 * Every control on the page whose ACCESSIBLE NAME mentions a workspace.
 *
 * Deliberately not `getByText(/workspace/i)`: the template sheet's Details tab still reports
 * which sub-app a finished build actually ran in, which is trace information, not a choice. What
 * must be zero is anything a person can operate.
 */
async function workspaceControls(page: Page): Promise<string[]> {
  const names = await page
    .getByRole('combobox')
    .or(page.getByRole('menuitem'))
    .or(page.getByRole('menuitemradio'))
    .or(page.getByRole('radio'))
    .or(page.getByRole('button'))
    .evaluateAll((nodes) =>
      nodes.map(
        (node) =>
          (node as HTMLElement).getAttribute('aria-label') ??
          (node as HTMLElement).textContent ??
          '',
      ),
    );
  return names.filter((name) => /workspace|environment|sub-?app/i.test(name));
}

// --- the run ---------------------------------------------------------------------------------

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

test.describe('Forge — one consolidated list', () => {
  test.skip(LIVE, 'the consolidation bench runs on fixtures only');

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

  test('C1 · the Render picker holds both 133s, and no workspace control anywhere', async ({
    browser,
  }) => {
    contractReads.length = 0;
    listReads.length = 0;
    const { page, fixtures } = await openForge(browser, 'Render');

    const picker = page.getByRole('button', { name: 'Template', exact: true });
    await expect(picker).toBeEnabled({ timeout: 30_000 });
    await picker.click();

    // Both templates are offered, and they are TWO rows — a merge keyed on the template key
    // alone would have shown one.
    await expect(page.getByRole('menuitemradio', { name: PROMO.title })).toBeVisible();
    await expect(page.getByRole('menuitemradio', { name: 'Legacy product card' })).toBeVisible();

    // The submenu that used to sit under these items is gone.
    expect(await workspaceControls(page), 'a control named for a workspace').toEqual([]);
    await shoot(page, 'render-picker');

    // And the list was fetched WITHOUT naming a binding: one merged read, not one per workspace.
    expect(listReads.length, 'the template list is read').toBeGreaterThan(0);
    for (const read of listReads) {
      expect(read.bindingId, 'the product never names a workspace to list').toBeNull();
    }
    // The environments endpoint has no caller left in the Forge at all.
    expect(
      fixtures.calls('GET', /^\/api\/ai-studio\/renders\/environments$/),
      'nothing enumerates workspaces any more',
    ).toEqual([]);
  });

  test('C2 · choosing the legacy 133 reads ITS contract, not the default binding’s', async ({
    browser,
  }) => {
    contractReads.length = 0;
    const { page } = await openForge(browser, 'Render');

    const picker = page.getByRole('button', { name: 'Template', exact: true });
    await expect(picker).toBeEnabled({ timeout: 30_000 });
    await picker.click();
    await page.getByRole('menuitemradio', { name: 'Legacy product card' }).click();

    // THE WHOLE POINT. Both templates are key 133; only the binding tells them apart, so a
    // contract read that carried the default binding would be reading StarCraft's promo while
    // the person is looking at another client's product card.
    await expect(async () => {
      const legacy = contractReads.filter((read) => read.bindingId === LEGACY_BINDING_ID);
      expect(
        legacy.length,
        `contract reads so far: ${JSON.stringify(contractReads)}`,
      ).toBeGreaterThan(0);
    }).toPass({ timeout: 20_000 });
    expect(contractReads.every((read) => read.templateKey === COLLIDING_KEY)).toBe(true);
  });

  test('C3 · the gallery reads the merged list once and lists no workspaces', async ({
    browser,
  }) => {
    discoverReads.length = 0;
    const { page, fixtures } = await openForge(browser, 'Templates');
    await expect(page.getByRole('tab', { name: 'Templates', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Both 133s are on screen, told apart by name rather than by a workspace label.
    await expect(page.getByText('Legacy product card')).toBeVisible({ timeout: 30_000 });
    expect(await workspaceControls(page), 'a control named for a workspace').toEqual([]);
    await shoot(page, 'gallery');

    expect(discoverReads.length, 'the gallery reads the merged list').toBeGreaterThan(0);
    for (const read of discoverReads) {
      expect(read.workspaceId, 'the gallery never fans out per workspace').toBeNull();
    }
    expect(
      fixtures.calls('GET', /^\/api\/ai-studio\/templates\/workspaces$/),
      'the browser no longer enumerates the brand’s workspaces',
    ).toEqual([]);
  });
});
