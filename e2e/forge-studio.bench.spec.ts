import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type ApiRenderBatchPreflightRequest,
  type ApiRenderJob,
  type ApiRenderTemplateContract,
  type ApiRenderTemplateListResponse,
  type ApiRenderVariable,
  apiRenderBatchSchema,
  apiRenderDeliveryDestinationsResponseSchema,
  apiRenderJobSchema,
  forgeRenderSetSchema,
  renderApprovalDestinationListResponseSchema,
  type TemplateSource,
  templateDisplayName,
  type WorkspaceTemplate,
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
  type FixtureMeta,
  FORGE_FIXTURE,
  type ForgeFixtures,
  installForgeFixtures,
  STARCRAFT_BRAND_ID,
} from './support/forge-studio-fixtures';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// forge:studio:e2e:bench — Forge Studio (/forge) proven in a REAL Chrome.
//
// The session is real: a magic-link mint for the StarCraft owner, pinned to the StarCraft brand
// for THIS session only (brand_profiles.user_session_brands — the account pointer other devices
// inherit is never touched), and signed out when the run ends. The page is server-rendered
// against production Supabase.
//
// Two modes, chosen by env (see playwright.forge-studio.config.ts):
//
//   FIXTURES (default) — every /api/ai-studio/** call is answered in the browser by typed
//     fixtures parsed through the real @continuum/contracts schemas, and the backend URL is a
//     dead port, so every assertion provably came from the fixtures. Proves D1 D2 D3 D5 D7 D9
//     D10 D13 D14 D15 D16 against the landed components. It does NOT exercise the Fastify backend,
//     the render fleet, Slack or Meta — the envelope says so.
//
//   LIVE (FORGE_STUDIO_LIVE=1) — no interception, the local backend, prod Supabase, StarCraft
//     template 133. D1, D3 (a PERSISTENT rename to FORGE_STUDIO_RENAME) and D7 on real data, and
//     rows built from FORGE_STUDIO_ASSET_IDS through the real spreadsheet import. Only with
//     FORGE_STUDIO_FIRE=1 does it pre-flight to Slack, render ≤ FORGE_STUDIO_MAX_RENDERS and wait
//     for the Slack receipt. Without FIRE, createBatch is blocked in code AND asserted never
//     attempted. FIRE renders from a set of its own, "Bench · Studio <run id>" with rows
//     "Example N", and deletes that set by id when the suite ends (its renders stay in the ledger).
//
// Usage:
//   cd Continuum-Frontend && bun run forge:studio:e2e:bench
//   FORGE_STUDIO_LIVE=1 FORGE_STUDIO_ASSET_IDS=<id,id> bun run forge:studio:e2e:bench
//   FORGE_STUDIO_LIVE=1 FORGE_STUDIO_FIRE=1 FORGE_STUDIO_ASSET_IDS=<id,id> \
//     FORGE_STUDIO_SLACK_DESTINATION=<chat_destinations id> bun run forge:studio:e2e:bench
// ---------------------------------------------------------------------------

const { publishableKey, serviceRoleKey } = loadProdSupabaseEnv();

const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const FIRE = LIVE && process.env.FORGE_STUDIO_FIRE === '1';
const MODE = LIVE ? (FIRE ? 'live+fire' : 'live') : 'fixtures';
const OWNER_EMAIL = 'duane@continuumai.agency';
const RUN_ID = process.env.FORGE_STUDIO_RUN_ID ?? String(Date.now());
/** Resolved by the config, which refuses a non-local backend in LIVE mode. */
const API_URL = process.env.FORGE_STUDIO_API_URL ?? 'http://localhost:4000';
const TEMPLATE_KEY = process.env.FORGE_STUDIO_TEMPLATE_KEY?.trim() || '133';
const RENAME = process.env.FORGE_STUDIO_RENAME?.trim() || 'StarCraft Promo';
const ASSET_IDS = (process.env.FORGE_STUDIO_ASSET_IDS ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const SLACK_DESTINATION = process.env.FORGE_STUDIO_SLACK_DESTINATION?.trim() ?? '';
const MAX_RENDERS = Math.max(1, Math.floor(Number(process.env.FORGE_STUDIO_MAX_RENDERS ?? 6)) || 6);
const RENDER_TIMEOUT_MS = Number(process.env.FORGE_STUDIO_RENDER_TIMEOUT_MS ?? 15 * 60_000);
const SLACK_TIMEOUT_MS = Number(process.env.FORGE_STUDIO_SLACK_TIMEOUT_MS ?? 3 * 60_000);

const SHOTS_DIR = resolve(__dirname, '__screenshots__/forge-studio');
const RESULTS_PATH = join(tmpdir(), `forge-studio-bench-${RUN_ID}.jsonl`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** What D3 says no default view may show: a uuid, the backend app, a render table, "template N". */
const IDENTIFIER_PATTERNS = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  /Continuum_app/,
  /template \d+/i,
  /tpl_/,
];
const TWENTY_CHARACTERS = 'Zerg rush kekekekeke';

const ROWS = FORGE_FIXTURE.set.rows;
const VARS = FORGE_FIXTURE.variables;
/** The brand's usual approval room — a Meta target is refused without one. */
const APPROVAL_ROOM = {
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
const activeGuards: BatchGuard[] = [];

// --- session -------------------------------------------------------------------------------

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('[forge-studio-bench] access token has no payload');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    session_id?: string;
  };
  if (!claims.sub || !claims.session_id) {
    throw new Error('[forge-studio-bench] access token carries no sub or session_id claim');
  }
  return { sub: claims.sub, session_id: claims.session_id };
}

/**
 * Pins THIS session to StarCraft as the member itself, through the same RLS the in-app switcher
 * writes through, then reads it back through the resolver the server render calls. A session on
 * another brand reads an empty world and reports a false green.
 */
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
  if (error) throw new Error(`[forge-studio-bench] session brand pin failed: ${error.message}`);
  const { data, error: resolveError } = await member
    .schema('brand_profiles')
    .rpc('resolve_active_brand_for_session');
  if (resolveError || data !== STARCRAFT_BRAND_ID) {
    throw new Error(
      `[forge-studio-bench] the session resolves to ${String(data)} (${resolveError?.message ?? 'no error'}), not StarCraft`,
    );
  }
}

// --- envelope --------------------------------------------------------------------------------
//
// `scripts/factory/bench.mjs` reads the last stdout JSON line carrying `counts`. Results go to a
// per-run file because Playwright replaces its worker after a failure, and a worker only knows
// its own tests: every worker prints the whole run so far, so the last envelope is complete.

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
      : testInfo.status === 'skipped'
        ? { detail: testInfo.annotations.find((note) => note.type === 'skip')?.description }
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
  const notes = LIVE
    ? [
        'LIVE: no interception — local backend, production Supabase, StarCraft template 133. The rename to FORGE_STUDIO_RENAME is persistent by design.',
        FIRE
          ? `FIRE: real renders (≤ ${MAX_RENDERS}) through pre-flight, with a real Slack post.`
          : 'NOT exercised: createBatch — FORGE_STUDIO_FIRE is not 1, so it was blocked in code and asserted never attempted. No render ran and no Slack post was made.',
        'NOT exercised live: Meta delivery — StarCraft has no ad account (D18 stays offline).',
      ]
    : [
        'FIXTURES: every /api/ai-studio/** call was answered in the browser by fixtures parsed through the real contracts; the backend URL is a dead port.',
        'NOT exercised: the Fastify backend, the render fleet, Slack and Meta. Real: Chrome, the minted StarCraft session, the server-rendered brand context, and every Forge Studio component.',
      ];
  console.log(
    JSON.stringify({
      bench: 'forge:studio:e2e:bench',
      mode: MODE,
      startedAt: new Date(Number.isFinite(startedMs) ? startedMs : Date.now()).toISOString(),
      durationMs: Number.isFinite(startedMs) ? Date.now() - startedMs : 0,
      results,
      notes,
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

/** Runs the per-test checks, always closes the contexts and records the grade, then rethrows. */
async function settle(testInfo: TestInfo, checks: () => void): Promise<void> {
  let problem: unknown = null;
  try {
    if (testInfo.status === 'passed') checks();
  } catch (error) {
    problem = error;
  } finally {
    await Promise.all(opened.splice(0).map((context) => context.close().catch(() => undefined)));
    activeFixtures.length = 0;
    activeGuards.length = 0;
    recordGrade(testInfo, problem);
  }
  if (problem) throw problem;
}

// --- page helpers ----------------------------------------------------------------------------

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function newForgeContext(
  browser: Browser,
  options: { viewport?: { width: number; height: number }; reducedMotion?: 'reduce' } = {},
): Promise<BrowserContext> {
  if (!session) throw new Error('[forge-studio-bench] no minted session');
  const context = await browser.newContext({
    storageState: session.state,
    viewport: options.viewport ?? { width: 1600, height: 1000 },
    reducedMotion: options.reducedMotion ?? 'no-preference',
  });
  opened.push(context);
  await context.addInitScript(recordViewTransitions);
  return context;
}

async function gotoForge(page: Page): Promise<void> {
  await page.goto('/forge', { waitUntil: 'domcontentloaded' });
  // The first hit compiles /forge in the dev server.
  await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 180_000,
  });
}

/** The approval room, pre-selected the way the backend's `defaultDestinationIds` does. */
async function answerApprovalRooms(context: BrowserContext): Promise<void> {
  const body = renderApprovalDestinationListResponseSchema.parse({
    destinations: [APPROVAL_ROOM],
    defaultDestinationIds: [APPROVAL_ROOM.id],
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

async function openFixtureForge(
  browser: Browser,
  options: {
    viewport?: { width: number; height: number };
    reducedMotion?: 'reduce';
    meta?: FixtureMeta;
    preflightDelayMs?: number;
    approvalRoom?: boolean;
  } = {},
): Promise<{ page: Page; fixtures: ForgeFixtures }> {
  const context = await newForgeContext(browser, options);
  const fixtures = await installForgeFixtures(context, {
    meta: options.meta,
    preflightDelayMs: options.preflightDelayMs,
  });
  activeFixtures.push(fixtures);
  // Registered after the fixtures, so it answers first.
  if (options.approvalRoom) await answerApprovalRooms(context);
  const page = await context.newPage();
  await gotoForge(page);
  return { page, fixtures };
}

/**
 * Switch tabs and wait until the tab really is selected. A click that lands on server-rendered
 * markup before hydration does nothing (measured: the first fixture call fires ~10 s after the
 * heading paints in dev), so the click is retried until `aria-selected` flips.
 */
const openTab = async (page: Page, name: 'Templates' | 'Render' | 'Render ledger') => {
  const tab = page.getByRole('tab', { name, exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
};

/**
 * Group header toggles inside the Render ledger panel only. The Render tab stays mounted while hidden,
 * and its Template picker is also an aria-expanded button carrying the template's name.
 */
const renderGroup = (page: Page, text: string): Locator =>
  page
    .getByRole('tabpanel', { name: 'Render ledger' })
    .locator('button[aria-expanded]')
    .filter({ hasText: text });

/** A Render grid row, found by its drag handle — the one control named after the row. */
const gridRow = (page: Page, label: string): Locator =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Drag ${label}`, exact: true }) });

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page
    .screenshot({ path: resolve(SHOTS_DIR, `${MODE}-${name}.png`), fullPage: true })
    .catch(() => undefined);
}

/** Every visible text node under `main` that D3 forbids. */
function identifierLeaks(page: Page): Promise<string[]> {
  return page.getByRole('main').evaluate(
    (root, sources) => {
      const patterns = sources.map(([source, flags]) => new RegExp(source, flags));
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const leaks: string[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        if (!text.trim() || !node.parentElement?.checkVisibility()) continue;
        if (patterns.some((pattern) => pattern.test(text))) leaks.push(text.trim());
      }
      return leaks;
    },
    IDENTIFIER_PATTERNS.map((pattern): [string, string] => [pattern.source, pattern.flags]),
  );
}

type ViewTransitionLog = { calls: number; names: string[]; active: number };

/**
 * Counts `document.startViewTransition` calls, the ones still running, and the
 * `view-transition-name`s React applied around them — before the call (the outgoing element) and
 * after its update (the incoming one).
 */
function recordViewTransitions(): void {
  const log: ViewTransitionLog = { calls: 0, names: [], active: 0 };
  (window as unknown as { __forgeViewTransitions: ViewTransitionLog }).__forgeViewTransitions = log;
  // lib.dom declares it unconditionally; a browser without view transitions does not have it.
  const doc = document as unknown as { startViewTransition?: Document['startViewTransition'] };
  const original = doc.startViewTransition;
  if (typeof original !== 'function') return;
  const scan = () => {
    for (const element of document.querySelectorAll<HTMLElement>(
      '[style*="view-transition-name"]',
    )) {
      const name = element.style.getPropertyValue('view-transition-name');
      if (name && name !== 'none') log.names.push(name);
    }
  };
  const afterUpdate =
    (run: ViewTransitionUpdateCallback): ViewTransitionUpdateCallback =>
    () => {
      const result = run();
      queueMicrotask(scan);
      return result;
    };
  doc.startViewTransition = (update) => {
    log.calls += 1;
    log.active += 1;
    scan();
    const wrapped =
      typeof update === 'function'
        ? afterUpdate(update)
        : update?.update
          ? { ...update, update: afterUpdate(update.update) }
          : update;
    const transition = original.call(document, wrapped);
    const settled = () => {
      log.active -= 1;
    };
    transition.finished.then(settled, settled);
    return transition;
  };
}

const resetViewTransitions = (page: Page) =>
  page.evaluate(() => {
    const log = (window as unknown as { __forgeViewTransitions: ViewTransitionLog })
      .__forgeViewTransitions;
    log.calls = 0;
    log.names = [];
  });

const readViewTransitions = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __forgeViewTransitions: ViewTransitionLog }).__forgeViewTransitions,
  );

/**
 * Waits out a view transition still running — the root cross-fade that reveals /forge lands
 * around the time the Render tab first answers. While one runs the page hit-tests as its root
 * element, so a press meant for a drag handle lands on <html> and Chrome selects text instead.
 */
const viewTransitionsSettled = (page: Page) =>
  expect.poll(async () => (await readViewTransitions(page)).active).toBe(0);

type FocusProbe = {
  keyups: number;
  lostAt: number[];
  connected: boolean;
  focused: boolean;
  value: string;
  startedAt: number;
  endedAt: number;
};

/**
 * Put the caret at the end of a text field. Not `press('End')`: Chromium follows platform
 * keybindings, and on macOS End scrolls instead of moving the caret, so typing lands mid-value.
 */
const caretToEnd = (field: Locator) =>
  field.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.setSelectionRange(input.value.length, input.value.length);
  });

/**
 * Types into `field` one key at a time (pressSequentially focuses ONCE, then sends keys to
 * whatever holds focus) and checks after every keyup that the element holding focus is still the
 * very node typing started in. A remounted cell loses focus to <body> and shows up here.
 */
async function typeKeepingFocus(page: Page, field: Locator, text: string): Promise<FocusProbe> {
  await field.click();
  await caretToEnd(field);
  await field.evaluate((element) => {
    const probe = { element, keyups: 0, lostAt: [] as number[], stop: () => undefined as void };
    const onKeyUp = () => {
      probe.keyups += 1;
      if (document.activeElement !== element) probe.lostAt.push(probe.keyups);
    };
    window.addEventListener('keyup', onKeyUp, true);
    probe.stop = () => window.removeEventListener('keyup', onKeyUp, true);
    (window as unknown as { __forgeFocus: typeof probe }).__forgeFocus = probe;
  });
  const startedAt = Date.now();
  await field.pressSequentially(text, { delay: 90 });
  const endedAt = Date.now();
  const result = await page.evaluate(() => {
    const probe = (
      window as unknown as {
        __forgeFocus: { element: Element; keyups: number; lostAt: number[]; stop: () => void };
      }
    ).__forgeFocus;
    probe.stop();
    return {
      keyups: probe.keyups,
      lostAt: probe.lostAt,
      connected: probe.element.isConnected,
      focused: document.activeElement === probe.element,
      value: (probe.element as HTMLInputElement).value,
    };
  });
  return { ...result, startedAt, endedAt };
}

/** Drags a grid row by its handle so that row's centre lands on the middle of the target row. */
async function dragRowInside(page: Page, label: string, targetLabel: string): Promise<void> {
  const handle = page.getByRole('button', { name: `Drag ${label}`, exact: true });
  await handle.scrollIntoViewIfNeeded();
  await viewTransitionsSettled(page);
  const [handleBox, sourceBox, targetBox] = await Promise.all([
    handle.boundingBox(),
    gridRow(page, label).boundingBox(),
    gridRow(page, targetLabel).boundingBox(),
  ]);
  if (!handleBox || !sourceBox || !targetBox) {
    throw new Error(`[forge-studio-bench] cannot measure ${label} → ${targetLabel}`);
  }
  const x = handleBox.x + handleBox.width / 2;
  const y = handleBox.y + handleBox.height / 2;
  const dy = targetBox.y + targetBox.height / 2 - (sourceBox.y + sourceBox.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Past the sensor's 4px activation distance first, then onto the target.
  await page.mouse.move(x, y + Math.sign(dy || 1) * 8, { steps: 3 });
  await page.mouse.move(x, y + dy, { steps: 15 });
  await page.mouse.move(x, y + dy + 0.5, { steps: 1 });
  await page.mouse.up();
}

const svgSlotText = (page: Page, slot: string) =>
  page
    .getByRole('img', { name: `${FORGE_FIXTURE.promo.compName} preview` })
    .locator(`g[data-slot="${slot}"] text`)
    .evaluate((node) => (node.textContent ?? '').replace(/\s+/g, ''));

async function openPreflight(page: Page, rowCount: number): Promise<Locator> {
  const render = page.getByRole('button', {
    name: new RegExp(`^Render ${rowCount} rows? · \\d+ files?$`),
  });
  await expect(render).toBeEnabled();
  await render.click();
  // The review is a tray docked under the grid, never a modal over it.
  const tray = page.getByRole('region', { name: 'Review and render' });
  await expect(tray).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return tray;
}

/** The tray's one way forward: the last button in its footer, named for the step it takes. */
async function pressPrimary(tray: Locator, name: string | RegExp, timeout?: number) {
  const primary = tray.locator('footer').getByRole('button').last();
  await expect(primary).toHaveText(name);
  await expect(primary).toBeEnabled({ timeout });
  await primary.click();
}

/** Deliver folds its defaults into one line; this opens the full form when it is folded. */
async function openDeliveryForm(tray: Locator): Promise<void> {
  const change = tray.getByRole('button', { name: 'Change delivery', exact: true });
  if (await change.isVisible()) await change.click();
}

/** A shadcn Select: open the trigger, then press the option in its listbox. */
async function chooseOption(
  scope: Locator,
  combobox: string,
  option: string | RegExp,
): Promise<void> {
  await scope.getByRole('combobox', { name: combobox, exact: true }).click();
  await scope.page().getByRole('listbox').getByRole('option', { name: option }).click();
}

async function uploadCsv(page: Page, fileName: string, csv: string, rowCount: number) {
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Upload CSV or XLSX…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import render rows' });
  await expect(dialog).toBeVisible();
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: fileName, mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await expect(
    dialog.getByText(`${fileName} · ${rowCount} row${rowCount === 1 ? '' : 's'}`),
  ).toBeVisible();
  const importButton = dialog.getByRole('button', { name: 'Import reviewed rows' });
  // Media columns are looked up in the Library before the import unlocks.
  await expect(importButton)
    .toBeEnabled({ timeout: 60_000 })
    .catch(async (error: unknown) => {
      const alerts = await dialog.getByRole('alert').allTextContents();
      throw new Error(
        `[forge-studio-bench] the import stayed locked: ${alerts.join(' | ') || String(error)}`,
      );
    });
  await importButton.click();
  await expect(dialog).toBeHidden();
}

const csvCell = (value: string) =>
  /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

// --- the run -----------------------------------------------------------------------------------

test.beforeAll(async () => {
  test.setTimeout(120_000);
  session = await mintSessionBundleForEmail(OWNER_EMAIL);
  await pinSessionToStarCraft(session.accessToken);
});

test.afterAll(async () => {
  if (session) {
    // Revokes only this bench session; the FK cascade takes its session-brand pin with it.
    const admin = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.auth.admin.signOut(session.accessToken, 'local').catch(() => undefined);
    session = null;
  }
  printEnvelope();
});

test.describe('Forge Studio — fixtures', () => {
  test.skip(LIVE, 'FORGE_STUDIO_LIVE=1 runs the live suite instead');

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterEach(async ({}, testInfo) => {
    const fixtures = [...activeFixtures];
    await settle(testInfo, () => {
      for (const fixture of fixtures) {
        if (fixture.unhandled.length) {
          console.log(
            `[forge-studio-bench] no fixture for: ${[...new Set(fixture.unhandled)].join(', ')}`,
          );
        }
        expect(fixture.violations, 'a body the real contract refuses').toEqual([]);
        expect([...fixture.brandIds], 'every Forge request is scoped to StarCraft').toEqual([
          STARCRAFT_BRAND_ID,
        ]);
      }
    });
  });

  test('D1 · at 2000px the Templates gallery spans ≥ 90% of the content pane', async ({
    browser,
  }) => {
    const { page } = await openFixtureForge(browser, { viewport: { width: 2000, height: 1200 } });
    const gallery = page.getByRole('list', { name: 'Templates' });
    await expect(
      gallery.getByRole('button', { name: `Open ${FORGE_FIXTURE.promo.title}`, exact: true }),
    ).toBeVisible();
    const [galleryBox, paneBox] = await Promise.all([
      gallery.boundingBox(),
      page.getByRole('main').boundingBox(),
    ]);
    expect(galleryBox && paneBox, 'gallery and main must both be laid out').toBeTruthy();
    const share = (galleryBox?.width ?? 0) / (paneBox?.width ?? 1);
    console.log(
      `[forge-studio-bench] D1 gallery ${galleryBox?.width}px of main ${paneBox?.width}px (${(share * 100).toFixed(1)}%)`,
    );
    expect(share).toBeGreaterThanOrEqual(0.9);
    await shoot(page, 'd1-gallery-2000');
  });

  test('D2 · a card opens its detail through the shared-element view transition', async ({
    browser,
  }) => {
    const { page } = await openFixtureForge(browser);
    const card = page.getByRole('button', {
      name: `Open ${FORGE_FIXTURE.promo.title}`,
      exact: true,
    });
    await expect(card).toBeVisible();
    const supported = await page.evaluate(
      () =>
        typeof (document as { startViewTransition?: unknown }).startViewTransition === 'function',
    );
    await resetViewTransitions(page);
    await card.click();
    await expect(page.getByRole('button', { name: 'Templates', exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2 }).filter({ hasText: FORGE_FIXTURE.promo.title }),
    ).toBeVisible();
    const log = await readViewTransitions(page);
    console.log(
      `[forge-studio-bench] D2 startViewTransition=${log.calls} names=${log.names.join(',')}`,
    );
    if (!supported) {
      test.info().annotations.push({
        type: 'note',
        description: 'document.startViewTransition is unsupported in this browser',
      });
      return;
    }
    expect(log.calls, 'opening a card starts a view transition').toBeGreaterThan(0);
    expect(
      log.names.some((name) => name.includes(`forge-template-${FORGE_FIXTURE.promo.assetId}`)),
      'the card preview carries the shared forge-template-<id> name into the transition',
    ).toBe(true);
    await shoot(page, 'd2-detail');
  });

  test('D2 · with reduced motion the detail opens with no view transition', async ({ browser }) => {
    const { page } = await openFixtureForge(browser, { reducedMotion: 'reduce' });
    const card = page.getByRole('button', {
      name: `Open ${FORGE_FIXTURE.promo.title}`,
      exact: true,
    });
    await expect(card).toBeVisible();
    await resetViewTransitions(page);
    await card.click();
    await expect(
      page.getByRole('heading', { level: 2 }).filter({ hasText: FORGE_FIXTURE.promo.title }),
    ).toBeVisible();
    const log = await readViewTransitions(page);
    console.log(
      `[forge-studio-bench] D2 reduced startViewTransition=${log.calls} names=${log.names.join(',')}`,
    );
    expect(log.names.filter((name) => name.includes('forge-template-'))).toEqual([]);
    // A root <NavigationTransition> cross-fade is still a transition: "instant swap" means none.
    expect(log.calls, 'reduced motion gets an instant swap, not a cross-fade').toBe(0);
  });

  test('D3 · Templates shows names, never identifiers; an inline rename reaches the Render picker', async ({
    browser,
  }) => {
    const { page, fixtures } = await openFixtureForge(browser);
    const gallery = page.getByRole('list', { name: 'Templates' });
    const { promo, draft, shared } = FORGE_FIXTURE;
    await expect(
      gallery.getByRole('button', { name: `Open ${promo.title}`, exact: true }),
    ).toBeVisible();
    // The upload whose filename is a bare uuid reads as its build name.
    await expect(
      gallery.getByRole('button', { name: `Open ${draft.displayName}`, exact: true }),
    ).toBeVisible();
    await expect(gallery.getByText(shared.displayName, { exact: true })).toBeVisible();
    expect(await identifierLeaks(page)).toEqual([]);

    const renamed = 'Protoss Promo';
    await gallery.getByRole('button', { name: `Rename ${promo.title}`, exact: true }).click();
    const field = page.getByRole('textbox', { name: `Rename ${promo.title}`, exact: true });
    await field.fill(renamed);
    await field.press('Enter');
    await expect(
      gallery.getByRole('button', { name: `Open ${renamed}`, exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => fixtures.calls('PATCH', /^\/api\/ai-studio\/templates\//).length)
      .toBe(1);
    const [patch] = fixtures.calls('PATCH', /^\/api\/ai-studio\/templates\//);
    expect(patch?.path).toBe(`/api/ai-studio/templates/${promo.assetId}`);
    expect(patch?.body).toEqual({ brandId: STARCRAFT_BRAND_ID, title: renamed });
    expect(await identifierLeaks(page)).toEqual([]);

    await openTab(page, 'Render');
    const picker = page.getByRole('button', { name: 'Template', exact: true });
    await expect(picker).toContainText(renamed);
    await picker.click();
    await expect(
      page.getByRole('menuitemradio', { name: new RegExp(`^${escapeRegExp(renamed)}`) }),
    ).toBeVisible();
    await shoot(page, 'd3-render-picker');
    await page.keyboard.press('Escape');
  });

  test('D5 · the variable editor has no horizontal scroll at 1280px', async ({ browser }) => {
    const { page } = await openFixtureForge(browser, { viewport: { width: 1280, height: 900 } });
    await page
      .getByRole('button', { name: `Open ${FORGE_FIXTURE.promo.title}`, exact: true })
      .click();
    const editor = page.getByRole('list', { name: 'Variables' });
    await expect(editor).toBeVisible();
    // The first row opens by default, and the longest thing in it is inline: the After Effects
    // binding path and its comp names, in mono.
    const openRow = editor.getByRole('listitem').first();
    await expect(openRow.getByText('After Effects', { exact: true })).toBeVisible();
    const measured = await editor.evaluate((list) => {
      const row = list.querySelector('li');
      const main = list.closest('main')?.getBoundingClientRect();
      return {
        scrollWidth: list.scrollWidth,
        clientWidth: list.clientWidth,
        rowScrollWidth: row?.scrollWidth ?? 0,
        rowClientWidth: row?.clientWidth ?? 0,
        listRight: list.getBoundingClientRect().right,
        mainRight: main?.right ?? Number.POSITIVE_INFINITY,
      };
    });
    console.log(`[forge-studio-bench] D5 ${JSON.stringify(measured)}`);
    expect(measured.scrollWidth).toBeLessThanOrEqual(measured.clientWidth);
    expect(measured.rowScrollWidth).toBeLessThanOrEqual(measured.rowClientWidth);
    expect(measured.listRight).toBeLessThanOrEqual(measured.mainRight + 1);
    await shoot(page, 'd5-variables-1280');
  });

  test('D7 · 20 characters into a text cell and a label cell keep focus while preflight lands', async ({
    browser,
  }) => {
    const { page, fixtures } = await openFixtureForge(browser, { preflightDelayMs: 300 });
    await openTab(page, 'Render');
    const root = gridRow(page, ROWS.root);
    const solo = gridRow(page, ROWS.solo);
    await expect(root.getByText('Ready', { exact: true })).toBeVisible();
    await expect(solo.getByText('Ready', { exact: true })).toBeVisible();

    const cells = [
      { kind: 'text', field: root.getByRole('textbox', { name: VARS.headline, exact: true }) },
      { kind: 'label', field: root.getByRole('textbox', { name: 'Row name', exact: true }) },
    ];
    for (const { kind, field } of cells) {
      // An edit on ANOTHER row arms its debounced preflight (600 ms), answered 300 ms later —
      // squarely inside the ~1.8 s it takes to type 20 characters here.
      const soloHeadline = solo.getByRole('textbox', { name: VARS.headline, exact: true });
      await soloHeadline.click();
      await caretToEnd(soloHeadline);
      await page.keyboard.type('!');
      const probe = await typeKeepingFocus(page, field, TWENTY_CHARACTERS);
      const landed = fixtures.preflightAnsweredAt.filter(
        (at) => at > probe.startedAt && at < probe.endedAt,
      );
      console.log(
        `[forge-studio-bench] D7 ${kind}: keyups=${probe.keyups} lost=${probe.lostAt.join(',') || 'none'} preflights mid-typing=${landed.length} value=${JSON.stringify(probe.value)}`,
      );
      expect(probe.keyups).toBe(TWENTY_CHARACTERS.length);
      expect(probe.lostAt, `${kind} cell lost focus after these keystrokes`).toEqual([]);
      expect(probe.connected, `${kind} cell was replaced while typing`).toBe(true);
      expect(probe.focused).toBe(true);
      expect(probe.value.endsWith(TWENTY_CHARACTERS)).toBe(true);
      expect(landed.length, 'a preflight response arrived while typing').toBeGreaterThan(0);
    }
    await shoot(page, 'd7-typed');
  });

  test('D16 · a Render color cell picks from the stored brand palette', async ({ browser }) => {
    const { page, fixtures } = await openFixtureForge(browser);
    await openTab(page, 'Render');
    const root = gridRow(page, ROWS.root);
    const palette = root.getByRole('button', {
      name: `${VARS.accent} brand palette`,
      exact: true,
    });
    await expect(palette).toBeVisible();
    await palette.click();

    const group = page.getByRole('group', {
      name: `${VARS.accent} brand colors`,
      exact: true,
    });
    const swatch = group.getByRole('button').first();
    await expect(swatch).toBeVisible();
    const title = await swatch.getAttribute('title');
    const hex = title?.match(/#[0-9a-f]{6}$/)?.[0];
    expect(hex, `brand swatch title carries a six-digit hex: ${title}`).toBeTruthy();
    if (!hex) throw new Error(`brand swatch title carries no six-digit hex: ${title}`);
    await swatch.click();

    await expect(
      root.getByRole('button', { name: `${VARS.accent} colour`, exact: true }),
    ).toContainText(hex);
    await expect
      .poll(() =>
        fixtures.calls('POST', /\/renders\/preflight$/).some((call) => {
          const body = call.body as { variables?: Record<string, unknown> };
          return body.variables?.accent === hex;
        }),
      )
      .toBe(true);
    await shoot(page, 'd16-brand-palette');
  });

  test('D9 · dragging a root row onto another makes it a fork; a drop past depth 3 is refused', async ({
    browser,
  }) => {
    const { page } = await openFixtureForge(browser);
    await openTab(page, 'Render');
    for (const label of [ROWS.root, ROWS.solo]) {
      await expect(gridRow(page, label).getByText('Ready', { exact: true })).toBeVisible();
    }
    await expect(gridRow(page, ROWS.solo).locator('p[title]')).toHaveCount(0);

    await dragRowInside(page, ROWS.solo, ROWS.root);
    const solo = gridRow(page, ROWS.solo);
    await expect(solo.locator(`p[title="${ROWS.root}"]`)).toBeVisible();
    expect(await solo.locator('[data-guide]').count(), 'a depth-1 fork draws one guide line').toBe(
      1,
    );

    // Root now carries a subtree one level deep; inside Launch · B · B (depth 2) it would reach 4.
    await dragRowInside(page, ROWS.root, ROWS.launchGrandFork);
    await expect(page.getByText('Forks go at most 3 levels deep. Nothing moved.')).toBeVisible();
    await expect(gridRow(page, ROWS.root).locator('p[title]')).toHaveCount(0);
    await shoot(page, 'd9-fork');
  });

  test('D10 · selecting a row and typing a headline redraws the preview', async ({ browser }) => {
    const { page } = await openFixtureForge(browser);
    await openTab(page, 'Render');
    const launch = gridRow(page, ROWS.launch);
    await expect(launch).toBeVisible();
    await launch.getByRole('cell').last().click();
    await expect(
      page.getByRole('img', { name: `${FORGE_FIXTURE.promo.compName} preview` }),
    ).toBeVisible();
    await expect.poll(() => svgSlotText(page, 'headline')).toBe('Launchday');

    const headline = launch.getByRole('textbox', { name: VARS.headline, exact: true });
    await headline.fill('');
    await headline.pressSequentially('Zerg rush', { delay: 30 });
    await expect.poll(() => svgSlotText(page, 'headline')).toBe('Zergrush');
    await shoot(page, 'd10-preview');
  });

  test('D13 · the spreadsheet template downloads; a quoted-comma CSV with Parent imports a fork', async ({
    browser,
  }) => {
    const { page } = await openFixtureForge(browser);
    await openTab(page, 'Render');
    await expect(gridRow(page, ROWS.root)).toBeVisible();

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Download spreadsheet template' }).click();
    const download = await downloading;
    const csv = readFileSync(await download.path(), 'utf8');
    const header = csv.replace(/^﻿/, '').split(/\r?\n/)[0]?.split(',');
    expect(header).toEqual([
      'Name',
      'Parent',
      'Formats',
      VARS.headline,
      VARS.tagline,
      VARS.price,
      VARS.accent,
      VARS.hero,
      'Replace ad ID',
    ]);

    const sheet = [
      'Name,Parent,Formats,Headline',
      '"Zerg, rush",,Square,"Spawn more overlords, now"',
      'Zerg follow-up,"Zerg, rush",Square,Second wave',
    ].join('\r\n');
    await uploadCsv(page, 'zerg-rows.csv', sheet, 2);
    await expect(gridRow(page, 'Zerg follow-up').locator('p[title="Zerg, rush"]')).toBeVisible();
    await expect(
      gridRow(page, 'Zerg, rush').getByRole('textbox', { name: VARS.headline, exact: true }),
    ).toHaveValue('Spawn more overlords, now');
    await shoot(page, 'd13-imported');
  });

  test('D14 · pre-flight reviews rows × formats, picks Slack, and forces one format per ad replacement', async ({
    browser,
  }) => {
    const { page, fixtures } = await openFixtureForge(browser, {
      meta: 'not_connected',
      approvalRoom: true,
    });
    const { promo, slack, meta } = FORGE_FIXTURE;
    await openTab(page, 'Render');
    for (const label of [ROWS.root, ROWS.launch]) {
      const row = gridRow(page, label);
      await expect(row.getByText('Ready', { exact: true })).toBeVisible();
      await row.getByRole('checkbox', { name: 'Select row' }).click();
    }

    // Review: exactly the selected rows × their formats.
    const review = await openPreflight(page, 2);
    await expect(review.getByText(`${promo.title} · 4 files`)).toBeVisible();
    await expect(review.getByText('Ready · 2 of 2 rows checked')).toBeVisible();
    for (const label of [ROWS.root, ROWS.launch]) {
      const item = review.getByRole('listitem').filter({ hasText: new RegExp(`^${label}`) });
      await expect(item.locator('[data-ratio]')).toHaveCount(2);
      await expect(item).toContainText('2 files');
    }
    await pressPrimary(review, 'Next: delivery');
    await openDeliveryForm(review);
    await expect(review.getByText('No ad account connected')).toBeVisible();
    await expect(review.getByRole('combobox', { name: 'Slack channel', exact: true })).toBeVisible();
    await expect(review.locator('select')).toHaveCount(0);
    await shoot(page, 'd14-no-ad-account');
    await review.getByRole('button', { name: 'Close review', exact: true }).click();
    await expect(review).toBeHidden();

    // Connected: Slack destination, then campaign → ad set → ad for one row.
    fixtures.state.meta = 'connected';
    const tray = await openPreflight(page, 2);
    await expect(tray.getByText('Ready · 2 of 2 rows checked')).toBeVisible();
    await pressPrimary(tray, 'Next: delivery');
    await openDeliveryForm(tray);
    await chooseOption(tray, 'Slack channel', new RegExp(`^#${escapeRegExp(slack.channelName)} · `));
    await expect(tray.getByRole('combobox', { name: 'Slack channel', exact: true })).toContainText(
      `#${slack.channelName}`,
    );
    await tray
      .getByRole('button', { name: `Replace an ad for ${ROWS.launch}`, exact: true })
      .click();
    await tray
      .getByRole('button', { name: new RegExp(`^${escapeRegExp(meta.campaign.name)}`) })
      .click();
    await tray.getByRole('button', { name: new RegExp(`^${escapeRegExp(meta.adset.name)}`) }).click();
    await tray.getByRole('button', { name: new RegExp(`^${escapeRegExp(meta.ad.name)}`) }).click();
    // A Meta target adds the Confirm step, and it waits on one format for the replacement.
    await expect(tray.getByText('Choose one format for each ad replacement.')).toBeVisible();
    const primary = tray.locator('footer').getByRole('button').last();
    await expect(primary).toHaveText('Next: confirm');
    await expect(primary).toBeDisabled();
    await chooseOption(tray, `Format for ${ROWS.launch}`, FORGE_FIXTURE.outputs.square);
    // The replacing row now renders one file: 2 (Root) + 1 (Launch).
    await expect(tray.getByText(`${promo.title} · 3 files`)).toBeVisible();
    await pressPrimary(tray, 'Next: confirm');
    await expect(tray).toContainText(`#${slack.channelName}`);
    await expect(tray).toContainText('1 ad replacement held for approval');
    await expect(tray).toContainText(`#${APPROVAL_ROOM.name} approval`);
    await shoot(page, 'd14-confirm');
    await pressPrimary(tray, 'Render 3 files');
    await expect.poll(() => fixtures.calls('POST', /\/renders\/batches$/).length).toBe(1);

    const confirmed = fixtures.calls('POST', /\/renders\/batch-preflight$/).at(-1)
      ?.body as ApiRenderBatchPreflightRequest;
    expect(confirmed.slack).toEqual({ destinationId: slack.destinationId });
    expect(confirmed.approvalDestinationIds).toEqual([APPROVAL_ROOM.id]);
    const launchRecord = confirmed.records.find((record) => record.label === ROWS.launch);
    const rootRecord = confirmed.records.find((record) => record.label === ROWS.root);
    expect(launchRecord?.delivery).toMatchObject({
      action: 'replace',
      adAccountId: meta.adAccountId,
      campaignId: meta.campaign.id,
      adsetId: meta.adset.id,
      adId: meta.ad.id,
    });
    expect(launchRecord?.outputIds).toEqual(['square']);
    expect(rootRecord?.delivery).toBeUndefined();
    expect(rootRecord?.outputIds).toEqual(['square', 'story']);
  });

  test('D15 · Render ledger groups by template, sorts, searches, shows the delivery chain and opens the step timeline', async ({
    browser,
  }) => {
    const { page } = await openFixtureForge(browser);
    const { promo, shared, slack, meta, jobs } = FORGE_FIXTURE;
    await openTab(page, 'Render ledger');
    const promoGroup = renderGroup(page, promo.title);
    const zergGroup = renderGroup(page, shared.displayName);
    await expect(promoGroup).toHaveText(/2 finished · 1 in flight\s*3$/);
    await expect(zergGroup).toHaveText(/1 finished · 1 failed\s*2$/);

    const nameHeader = page.getByRole('columnheader', { name: 'Name', exact: true });
    await expect(nameHeader).toHaveAttribute('aria-sort', 'none');
    await nameHeader.getByRole('button').click();
    await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');

    await page.getByRole('searchbox', { name: 'Search renders' }).fill(slack.channelName);
    await expect(zergGroup).toHaveCount(0);
    await expect(promoGroup).toHaveText(/1$/);
    await expect(page.getByText('1 of 5 loaded renders match')).toBeVisible();

    const delivered = page.getByRole('row').filter({ hasText: meta.ad.name });
    await expect(delivered).toContainText(`#${slack.channelName}`);
    await expect(delivered).toContainText('posted');
    await expect(delivered).toContainText(
      `Meta › ${meta.adAccountName} › ${meta.campaign.name} › ${meta.adset.name} ›`,
    );
    await expect(delivered).toContainText('awaiting approval');
    await shoot(page, 'd15-ledger');

    await delivered.getByText(jobs.deliveredLabel, { exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: jobs.deliveredLabel })).toBeVisible();
    // Job detail explains its checks: each row names what it checks, Delivery carries the chain.
    const checks = page.getByRole('list', { name: 'Checks' }).getByRole('listitem');
    const expected = ['Inputs', 'Placement', 'Brand', 'Render', 'Judge', 'Delivery'];
    await expect(checks).toHaveCount(expected.length);
    for (const [index, name] of expected.entries()) {
      await expect(checks.nth(index)).toContainText(name, { ignoreCase: true });
    }
    const delivery = checks.nth(expected.indexOf('Delivery'));
    await expect(delivery).toContainText(`posted to #${slack.channelName}`);
    await expect(delivery).toContainText('awaiting approval');
    await shoot(page, 'd15-detail');
  });
});

// --- LIVE ----------------------------------------------------------------------------------------

type BatchGuard = { attempts: number; refused: string[]; fired: boolean; pendingRenders: number };

type LiveSource = Pick<TemplateSource, 'assetId' | 'templateKey' | 'displayName' | 'parse'>;

async function liveGet<T>(path: string): Promise<T> {
  if (!session) throw new Error('[forge-studio-bench] no minted session');
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok) {
    throw new Error(
      `[forge-studio-bench] GET ${path} → ${response.status} ${(await response.text()).slice(0, 300)}`,
    );
  }
  return (await response.json()) as T;
}

/** DELETE through the same backend route the rail's Delete uses; a row already gone is fine. */
async function liveDelete(path: string): Promise<void> {
  if (!session) throw new Error('[forge-studio-bench] no minted session');
  const response = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `[forge-studio-bench] DELETE ${path} → ${response.status} ${(await response.text()).slice(0, 300)}`,
    );
  }
}

const brandQuery = `brandId=${encodeURIComponent(STARCRAFT_BRAND_ID)}`;

/**
 * A LIVE context with the createBatch guard in code: without FIRE the request is aborted before it
 * leaves the page and recorded, so "no render was fired" is asserted, not assumed. With FIRE it
 * lets exactly one batch through, and only when the confirmed pre-flight is within the budget.
 */
async function openLiveContext(
  browser: Browser,
  contract: ApiRenderTemplateContract | null,
  viewport?: { width: number; height: number },
): Promise<{ page: Page; guard: BatchGuard }> {
  const context = await newForgeContext(browser, { viewport });
  const guard: BatchGuard = { attempts: 0, refused: [], fired: false, pendingRenders: 0 };
  activeGuards.push(guard);
  await context.route(
    (url) => url.pathname === '/api/ai-studio/renders/batch-preflight',
    async (route) => {
      const body = route.request().postDataJSON() as ApiRenderBatchPreflightRequest | null;
      guard.pendingRenders = (body?.records ?? []).reduce(
        (total, record) => total + (record.outputIds?.length || contract?.outputs.length || 1),
        0,
      );
      await route.continue();
    },
  );
  await context.route(
    (url) => url.pathname === '/api/ai-studio/renders/batches',
    async (route) => {
      guard.attempts += 1;
      const refusal = !FIRE
        ? 'FORGE_STUDIO_FIRE is not 1'
        : guard.fired
          ? 'one batch per run'
          : guard.pendingRenders > MAX_RENDERS
            ? `${guard.pendingRenders} renders exceeds FORGE_STUDIO_MAX_RENDERS=${MAX_RENDERS}`
            : null;
      if (refusal) {
        guard.refused.push(refusal);
        await route.abort('blockedbyclient');
        return;
      }
      guard.fired = true;
      await route.continue();
    },
  );
  const page = await context.newPage();
  return { page, guard };
}

/** Selects template 133 in the Render picker by the label the page itself derives. */
async function selectLiveTemplate(page: Page): Promise<string> {
  const list = await liveGet<ApiRenderTemplateListResponse>(
    `/api/ai-studio/renders/templates?${brandQuery}`,
  );
  const summary = list.items.find((item) => item.key === TEMPLATE_KEY);
  if (!summary) {
    throw new Error(
      `[forge-studio-bench] template ${TEMPLATE_KEY} is not renderable for StarCraft (${list.items.length} templates listed)`,
    );
  }
  const label = summary.displayName ?? templateDisplayName(summary.name);
  const picker = page.getByRole('button', { name: 'Template', exact: true });
  await expect(picker).toBeEnabled({ timeout: 120_000 });
  if (!(await picker.textContent())?.includes(label)) {
    await picker.click();
    await page
      .getByRole('menuitemradio', { name: new RegExp(`^${escapeRegExp(label)}`) })
      .first()
      .click();
  }
  await expect(picker).toContainText(label);
  await expect(page.getByRole('button', { name: /^Drag / }).first()).toBeVisible({
    timeout: 120_000,
  });
  return label;
}

/** A spreadsheet cell a real row can render with: media from the Library ids, the rest sampled. */
function liveCell(variable: ApiRenderVariable, row: number, mediaIndex: number): string {
  if (mediaIndex >= 0) return ASSET_IDS[(row + mediaIndex) % ASSET_IDS.length] ?? '';
  const sample = variable.sample ?? '';
  switch (variable.kind) {
    case 'number':
      return sample && Number.isFinite(Number(sample)) ? sample : variable.required ? '1' : '';
    case 'color':
      return /^#?[0-9a-f]{6}$/i.test(sample) ? sample : variable.required ? '#000000' : '';
    case 'enum':
      return variable.options.includes(sample)
        ? sample
        : variable.required
          ? (variable.options[0] ?? '')
          : '';
    case 'boolean':
      return variable.required ? 'false' : '';
    default:
      return sample || (variable.required ? 'StarCraft' : '');
  }
}

/**
 * Builds rows through the real spreadsheet import: one row per Library image (≤ the render
 * budget), each in ONE format so rows = renders, every media slot filled by asset id.
 */
async function importLiveRows(
  page: Page,
  contract: ApiRenderTemplateContract,
  prefix: string,
): Promise<string[]> {
  const variables = contract.variables.filter((variable) => !variable.reserved);
  const media = variables.filter(
    (variable) => variable.kind === 'image' || variable.kind === 'video',
  );
  expect(
    media.length,
    `template ${TEMPLATE_KEY} exposes no media variable to fill`,
  ).toBeGreaterThan(0);
  const taken = (header: string) =>
    variables.some(
      (variable) =>
        variable.key.toLowerCase() === header.toLowerCase() ||
        variable.label.trim().toLowerCase() === header.toLowerCase(),
    );
  const nameHeader = ['Name', 'Label'].find((header) => !taken(header));
  const formatHeader = ['Formats', 'Format'].find((header) => !taken(header));
  if (!nameHeader || !formatHeader) {
    throw new Error('[forge-studio-bench] template variables shadow every Name/Formats header');
  }
  const format = contract.outputs[0]?.id;
  const count = Math.min(MAX_RENDERS, ASSET_IDS.length);
  const names = Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);
  const table = [
    [nameHeader, ...(format ? [formatHeader] : []), ...variables.map((variable) => variable.key)],
    ...names.map((name, row) => [
      name,
      ...(format ? [format] : []),
      ...variables.map((variable) => liveCell(variable, row, media.indexOf(variable))),
    ]),
  ];
  const csv = table.map((cells) => cells.map(csvCell).join(',')).join('\r\n');
  await uploadCsv(page, `forge-studio-${RUN_ID}.csv`, csv, count);
  for (const name of names) {
    const row = gridRow(page, name);
    await expect(row).toBeVisible();
    for (const variable of media) {
      await expect(
        row.getByRole('button', { name: `Change ${variable.label}`, exact: true }),
      ).toBeVisible();
    }
  }
  return names;
}

async function pollJobs(
  ids: string[],
  done: (job: ApiRenderJob) => boolean,
  timeoutMs: number,
  what: string,
): Promise<ApiRenderJob[]> {
  const deadline = Date.now() + timeoutMs;
  let jobs: ApiRenderJob[] = [];
  while (Date.now() < deadline) {
    jobs = await Promise.all(
      ids.map(async (id) =>
        apiRenderJobSchema.parse(await liveGet(`/api/ai-studio/renders/jobs/${id}?${brandQuery}`)),
      ),
    );
    if (jobs.every(done)) return jobs;
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 10_000));
  }
  throw new Error(
    `[forge-studio-bench] ${what} not reached in ${Math.round(timeoutMs / 1000)}s: ${jobs
      .map((job) => `${job.label}=${job.status}/slack:${job.slackDelivery?.status ?? 'none'}`)
      .join(', ')}`,
  );
}

test.describe('Forge Studio — LIVE on StarCraft template 133', () => {
  test.skip(!LIVE, 'set FORGE_STUDIO_LIVE=1 to run against the local backend and real data');

  let contract: ApiRenderTemplateContract | null = null;
  /** Every render set this suite creates, deleted by id when it ends — never by name or time. */
  const createdSetIds: string[] = [];

  test.beforeAll(async () => {
    contract = await liveGet<ApiRenderTemplateContract>(
      `/api/ai-studio/renders/templates/${encodeURIComponent(TEMPLATE_KEY)}/contract?${brandQuery}`,
    );
  });

  // Runs before the file's own afterAll signs the session out. Renders already made stay in the
  // Render ledger, as the rail's own Delete says.
  test.afterAll(async () => {
    for (const id of createdSetIds.splice(0)) {
      await liveDelete(`/api/ai-studio/renders/sets/${encodeURIComponent(id)}?${brandQuery}`);
      console.log(`[forge-studio-bench] LIVE cleanup deleted render set ${id}`);
    }
  });

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterEach(async ({}, testInfo) => {
    const guards = [...activeGuards];
    await settle(testInfo, () => {
      for (const guard of guards) {
        if (!FIRE) expect(guard.attempts, 'createBatch was attempted without FIRE').toBe(0);
        expect(guard.refused, 'the batch guard refused a request').toEqual([]);
      }
    });
  });

  test('LIVE D1 · at 2000px the Templates gallery spans ≥ 90% of the pane on real data', async ({
    browser,
  }) => {
    const { page } = await openLiveContext(browser, contract, { width: 2000, height: 1200 });
    await gotoForge(page);
    const gallery = page.getByRole('list', { name: 'Templates' });
    await expect(gallery.getByRole('button', { name: /^Open / }).first()).toBeVisible({
      timeout: 120_000,
    });
    const [galleryBox, paneBox] = await Promise.all([
      gallery.boundingBox(),
      page.getByRole('main').boundingBox(),
    ]);
    const share = (galleryBox?.width ?? 0) / (paneBox?.width ?? 1);
    console.log(`[forge-studio-bench] LIVE D1 ${(share * 100).toFixed(1)}%`);
    expect(share).toBeGreaterThanOrEqual(0.9);
    await shoot(page, 'd1-gallery-2000');
  });

  test('LIVE D3 · no identifiers on real Templates; renaming template 133 persists into the Render picker', async ({
    browser,
  }) => {
    const { items: sources } = await liveGet<{ items: LiveSource[] }>(
      `/api/ai-studio/templates?${brandQuery}`,
    );
    const source = sources.find((item) => item.templateKey === TEMPLATE_KEY);
    if (!source)
      throw new Error(`[forge-studio-bench] no Library source carries template ${TEMPLATE_KEY}`);
    const { items: discovered } = await liveGet<{ items: WorkspaceTemplate[] }>(
      `/api/ai-studio/templates/discover?${brandQuery}`,
    ).catch(() => ({ items: [] as WorkspaceTemplate[] }));
    const build = discovered.find((item) => item.sourceAssetId === source.assetId);
    // ForgeWorkbench's own order: a title, else the build name, else the prettified filename.
    const current =
      source.displayName ??
      (build ? templateDisplayName(build.name) : templateDisplayName(source.parse?.filename));

    const { page } = await openLiveContext(browser, contract);
    await gotoForge(page);
    const gallery = page.getByRole('list', { name: 'Templates' });
    await expect(
      gallery.getByRole('button', { name: `Open ${current}`, exact: true }).first(),
    ).toBeVisible({
      timeout: 120_000,
    });
    expect(await identifierLeaks(page)).toEqual([]);

    if (current === RENAME) {
      console.log(
        `[forge-studio-bench] LIVE D3 template ${TEMPLATE_KEY} is already "${RENAME}" — no PATCH sent`,
      );
    } else {
      await gallery
        .getByRole('button', { name: `Rename ${current}`, exact: true })
        .first()
        .click();
      const field = page.getByRole('textbox', { name: `Rename ${current}`, exact: true });
      await field.fill(RENAME);
      const saved = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          new URL(response.url()).pathname === `/api/ai-studio/templates/${source.assetId}`,
      );
      await field.press('Enter');
      expect((await saved).status(), 'the rename PATCH').toBe(200);
    }

    // Persisted, not optimistic: a fresh render reads it back.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      gallery.getByRole('button', { name: `Open ${RENAME}`, exact: true }).first(),
    ).toBeVisible({
      timeout: 120_000,
    });
    await openTab(page, 'Render');
    const picker = page.getByRole('button', { name: 'Template', exact: true });
    await expect(picker).toBeEnabled({ timeout: 120_000 });
    await picker.click();
    await expect(
      page.getByRole('menuitemradio', { name: new RegExp(`^${escapeRegExp(RENAME)}`) }).first(),
    ).toBeVisible();
    await shoot(page, 'd3-render-picker');
    await page.keyboard.press('Escape');
  });

  test('LIVE D7 · typing into template 133 cells keeps focus through real preflight', async ({
    browser,
  }) => {
    const { page } = await openLiveContext(browser, contract);
    const preflightAt: number[] = [];
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/ai-studio/renders/preflight') {
        preflightAt.push(Date.now());
      }
    });
    await gotoForge(page);
    await openTab(page, 'Render');
    await selectLiveTemplate(page);
    const firstRow = page
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: /^Drag / }) })
      .first();
    const textVariable = contract?.variables.find(
      (variable) => variable.kind === 'text' && !variable.reserved,
    );
    const cells = [
      ...(textVariable
        ? [
            {
              kind: 'text',
              field: firstRow.getByRole('textbox', { name: textVariable.label, exact: true }),
            },
          ]
        : []),
      { kind: 'label', field: firstRow.getByRole('textbox', { name: 'Row name', exact: true }) },
    ];
    for (const { kind, field } of cells) {
      const probe = await typeKeepingFocus(page, field, TWENTY_CHARACTERS);
      const landed = preflightAt.filter((at) => at > probe.startedAt && at < probe.endedAt).length;
      console.log(
        `[forge-studio-bench] LIVE D7 ${kind}: keyups=${probe.keyups} lost=${probe.lostAt.join(',') || 'none'} real preflights mid-typing=${landed}`,
      );
      expect(probe.keyups).toBe(TWENTY_CHARACTERS.length);
      expect(probe.lostAt, `${kind} cell lost focus after these keystrokes`).toEqual([]);
      expect(probe.connected).toBe(true);
      expect(probe.value.endsWith(TWENTY_CHARACTERS)).toBe(true);
    }
    if (!textVariable) {
      test.info().annotations.push({
        type: 'note',
        description: `template ${TEMPLATE_KEY} has no text variable`,
      });
    }
  });

  test('LIVE rows · AI-generated Library images fill template 133 media slots (createBatch never called)', async ({
    browser,
  }) => {
    test.skip(
      ASSET_IDS.length === 0,
      'FORGE_STUDIO_ASSET_IDS is empty — no Library images to build rows from',
    );
    if (!contract) throw new Error('[forge-studio-bench] contract not loaded');
    const { page, guard } = await openLiveContext(browser, contract);
    await gotoForge(page);
    await openTab(page, 'Render');
    await selectLiveTemplate(page);
    const names = await importLiveRows(page, contract, 'Example');
    for (const name of names) {
      await expect(
        gridRow(page, name).getByText(/^(Ready|AI check after render|Needs review)$/),
        `${name} passes the real preflight`,
      ).toBeVisible({ timeout: 120_000 });
    }
    await shoot(page, 'rows-imported');
    // Nothing is saved or rendered here: no Save, no Render click, and the guard saw nothing.
    expect(guard.attempts).toBe(0);
  });

  test('LIVE FIRE · pre-flight to Slack, render ≤ budget, land under the renamed template with a posted receipt', async ({
    browser,
  }) => {
    test.skip(!FIRE, 'FORGE_STUDIO_FIRE is not 1 — nothing is rendered');
    test.skip(ASSET_IDS.length === 0, 'FORGE_STUDIO_ASSET_IDS is empty');
    test.setTimeout(RENDER_TIMEOUT_MS + SLACK_TIMEOUT_MS + 10 * 60_000);
    expect(
      SLACK_DESTINATION,
      'FORGE_STUDIO_SLACK_DESTINATION must be a chat_destinations id',
    ).toMatch(UUID);
    if (!contract) throw new Error('[forge-studio-bench] contract not loaded');

    const { page } = await openLiveContext(browser, contract);
    await gotoForge(page);
    await openTab(page, 'Render');
    await selectLiveTemplate(page);

    // A set of the bench's own, so the Render click's save never rewrites someone's saved set.
    // Named for a person reading the rail; deleted by id in afterAll.
    const setName = `Bench · Studio ${RUN_ID}`;
    await page.getByRole('button', { name: 'New set', exact: true }).click();
    const discard = page.getByRole('alertdialog', { name: 'Discard unsaved edits?' });
    const nameDialog = page.getByRole('dialog', { name: 'New render set' });
    await expect(discard.or(nameDialog)).toBeVisible();
    if (await discard.isVisible()) await discard.getByRole('button', { name: 'Discard' }).click();
    await nameDialog.getByRole('textbox', { name: 'Name', exact: true }).fill(setName);
    const createdResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/ai-studio/renders/sets',
    );
    await nameDialog.getByRole('button', { name: 'Create', exact: true }).click();
    const created = await createdResponse;
    expect(created.ok(), `createRenderSet → ${created.status()}`).toBe(true);
    createdSetIds.push(forgeRenderSetSchema.parse(await created.json()).id);
    await expect(
      page.getByRole('button', { name: `Open ${setName}`, exact: true }),
    ).toHaveAttribute('aria-current', 'true', { timeout: 60_000 });

    const names = await importLiveRows(page, contract, 'Example');
    for (const name of names) {
      await gridRow(page, name).getByRole('checkbox', { name: 'Select row' }).click();
    }
    const render = page.getByRole('button', {
      name: new RegExp(`^Render ${names.length} rows? · \\d+ files?$`),
    });
    await expect(render, 'every selected row passes the real preflight').toBeEnabled({
      timeout: 180_000,
    });
    await render.click();
    const tray = page.getByRole('region', { name: 'Review and render' });
    await expect(tray).toBeVisible();
    const description =
      (await tray.locator('header').getByText(/ · \d+ files?$/).textContent()) ?? '';
    const renderCount = Number(/(\d+) files?$/.exec(description)?.[1] ?? Number.NaN);
    expect(
      renderCount,
      `the pre-flight renders ≤ FORGE_STUDIO_MAX_RENDERS (${description})`,
    ).toBeLessThanOrEqual(MAX_RENDERS);

    // Review re-checks on its own; the one button moves on once it is not blocked.
    await pressPrimary(tray, 'Next: delivery', 120_000);
    await openDeliveryForm(tray);
    // The picker names rooms, not ids: find the destination's channel through the same read.
    const { slack } = apiRenderDeliveryDestinationsResponseSchema.parse(
      await liveGet(`/api/ai-studio/renders/destinations?${brandQuery}`),
    );
    const destination = slack.destinations.find((item) => item.id === SLACK_DESTINATION);
    expect(
      destination,
      `StarCraft's Slack destinations: ${slack.destinations.map((item) => `#${item.channelName}`).join(', ')}`,
    ).toBeTruthy();
    const channelName = destination?.channelName ?? '';
    await chooseOption(tray, 'Slack channel', new RegExp(`^#${escapeRegExp(channelName)} · `));
    console.log(
      `[forge-studio-bench] LIVE Meta: ${(await tray.getByText('No ad account connected').isVisible()) ? 'no ad account connected' : 'an ad account is connected (not targeted)'}`,
    );
    // No Meta target, so Deliver is the last step: its foot reads Proof and where renders go.
    await expect(tray.locator('footer')).toContainText(`#${channelName}`);

    const signed = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/ai-studio/renders/batch-preflight' &&
        Boolean((request.postDataJSON() as ApiRenderBatchPreflightRequest | null)?.slack),
    );
    const batchResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/ai-studio/renders/batches',
      { timeout: 120_000 },
    );
    await pressPrimary(tray, /^Render \d+ files?$/);
    expect(
      ((await signed).postDataJSON() as ApiRenderBatchPreflightRequest).slack,
      'the signed pre-flight names the chosen Slack destination',
    ).toEqual({ destinationId: SLACK_DESTINATION });
    const response = await batchResponse;
    expect(response.ok(), `createBatch → ${response.status()}`).toBe(true);
    const batch = apiRenderBatchSchema.parse(await response.json());
    const ids = batch.jobs.map((job) => job.id);
    console.log(`[forge-studio-bench] LIVE fired ${ids.length} job(s): ${ids.join(', ')}`);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(MAX_RENDERS);

    const finished = await pollJobs(
      ids,
      (job) => job.status === 'finished' || job.status === 'failed',
      RENDER_TIMEOUT_MS,
      'every render finished',
    );
    expect(
      finished
        .filter((job) => job.status !== 'finished')
        .map((job) => `${job.label}: ${job.error}`),
    ).toEqual([]);
    const receipts = await pollJobs(
      ids,
      (job) => ['posted', 'error', 'skipped'].includes(job.slackDelivery?.status ?? ''),
      SLACK_TIMEOUT_MS,
      'every Slack receipt settled',
    );
    expect(
      receipts.map((job) =>
        `${job.label}: ${job.slackDelivery?.status} ${job.slackDelivery?.reason ?? ''}`.trim(),
      ),
    ).toEqual(receipts.map((job) => `${job.label}: posted`));

    // What a person sees: the renamed template's group, the bench's renders, the Slack receipt.
    await openTab(page, 'Render ledger');
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search renders' }).fill(setName);
    const group = renderGroup(page, RENAME);
    await expect(group).toHaveText(new RegExp(`${ids.length}$`), { timeout: 60_000 });
    for (const job of receipts) {
      const row = page.getByRole('row').filter({ hasText: job.label ?? '' });
      await expect(row).toContainText(`#${job.slackDelivery?.channelName ?? channelName}`);
      await expect(row).toContainText('posted');
    }
    await shoot(page, 'fire-renders');
  });
});
