import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail, type PlaywrightStorageState } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import {
  attachL1,
  clickExpectingEffect,
  type DefinedState,
  expectDefinedState,
  formatL1Failures,
  type L1Handle,
  l1Failures,
} from './support/l1Invariants';
import { benchBrowserChannel, loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// perfplus:ui:bench — the Performance+ campaign's UI lane (L1), as a smoke over every
// Performance+ surface.
//
// A real Chrome drives the real Frontend as the Easy Fit owner (magic link → verifyOtp → the
// @supabase/ssr cookie the app writes), against production Supabase and the Backend the
// Frontend `.env` names. Each surface is opened at 1280 and at 375 with the L1 invariants
// attached (e2e/support/l1Invariants.ts):
//
//   defined-state     the surface shows content, a named empty state or a named error state
//   console-errors    zero console.error / uncaught errors (allowlisted third-party noise is
//                     reported, never silent)
//   server-errors     zero responses ≥ 500 from our origins
//   failed-requests   zero failed requests to our origins (a page-initiated abort is excused)
//   click-effect      every tab the Optimizer exposes reacts to its click within 2s
//
// Surfaces: /scale?tab=performance (the Optimizer: Overview, then every tab its tablist
// exposes — Automations, Portfolios, Actions, Activity — then the first portfolio's detail and
// its Manage/Activity sections), /scale?tab=jaina, /scale?tab=campaigns, /scale?tab=dashboard,
// /scale/approvals, /scale/campaign-canvas, /dashboard?view=overview.
//
// ── READ ONLY ── Nothing here approves, applies, pauses, converts, reverts, creates or saves.
// The only clicks are `role="tab"` triggers and a portfolio row (a URL push). The single write
// is the bench user's active-brand preference (pinned to Easy Fit, restored at the end) — the
// same row the in-app brand switcher writes, written the same way.
//
// ── ONE TEST, MANY STEPS ── Playwright restarts the worker after a failing test, which would
// re-run beforeAll/afterAll and print one Recorder envelope per worker. One test with a step
// per surface × viewport and SOFT assertions audits every surface, prints one envelope, and
// still names surface, viewport and invariant on every failure. A failed invariant is a
// FINDING for the campaign ledger, never something to loosen here.
//
// Usage: cd Continuum-Frontend && bun run perfplus:ui:bench
// ---------------------------------------------------------------------------

test.use(benchBrowserChannel());

const { serviceRoleKey, publishableKey } = loadProdSupabaseEnv();

const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
/** Easy Fit, the agency row — the campaign's seeded brand (00-context.md, "Auth para tests"). */
const EASYFIT_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
/** The OTHER Easy Fit row (the bench user is an admin on it): it owns the active portfolios on
 *  the same ad account, where the agency row owned none on 2026-10-05 (optimizer:e2e:bench,
 *  BROWSE_BRAND_CANDIDATES). The Optimizer tablist only renders when the account carries a
 *  portfolio, so the tabs are exercised on the first candidate that does; every other surface
 *  stays on the seeded brand. */
const EASYFIT_LEDGER_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const OPTIMIZER_BRAND_CANDIDATES = [EASYFIT_BRAND_ID, EASYFIT_LEDGER_BRAND_ID] as const;

/** The three Optimizer landings that carry NO tablist (OptimizerTab.tsx), by their headline. */
const OPTIMIZER_NO_TABLIST_LANDINGS = [
  'Put ad sets under the Optimizer', // OptimizerOnboarding — no portfolio on this account
  'No portfolios on this ad account', // OptimizerOtherAccountNotice — portfolios live elsewhere
  "Can't reach the optimizer", // OptimizerOffline — the portfolio read failed
] as const;

const VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 375, height: 812 },
] as const;

type Surface = { name: string; path: string };

const SURFACES: readonly Surface[] = [
  { name: 'Optimizer', path: '/scale?tab=performance' },
  { name: 'Jaina', path: '/scale?tab=jaina' },
  { name: 'Campaigns', path: '/scale?tab=campaigns' },
  { name: 'Dashboard', path: '/scale?tab=dashboard' },
  { name: 'Approvals', path: '/scale/approvals' },
  { name: 'Campaign Canvas', path: '/scale/campaign-canvas' },
  { name: 'Home Overview', path: '/dashboard?view=overview' },
];

/** The Optimizer's tablist (OptimizerTab.tsx), minus Overview which is the landing view. */
const OPTIMIZER_TABS = ['Automations', 'Portfolios', 'Actions', 'Activity'] as const;
/** The portfolio detail's section tabs (PortfolioDetailWorkspace.tsx), minus Performance. */
const PORTFOLIO_SECTIONS = ['Manage', 'Activity'] as const;

const SHOTS_DIR = resolve(__dirname, '__screenshots__/perfplus-l1');
/** How long a surface may keep loading before `defined-state` calls it undefined. */
const SETTLE_MS = 90_000;
/** How long after settle to keep listening for late responses before reading the report. */
const QUIET_MS = 10_000;

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const notes: string[] = [];
const recorder = createBenchRecorder('perfplus:ui:bench', notes);

/** The envelope is printed ONCE: from the test's own `finally` when it completes (pass or soft
 *  fail), and from afterAll when the test was aborted (timeout, a Playwright internal error)
 *  and the finally never ran. The factory runner reads the last `{...counts...}` stdout line. */
let envelopePrinted = false;
function printEnvelopeOnce(): void {
  if (envelopePrinted) return;
  envelopePrinted = true;
  if (findings.length > 0) {
    console.log(
      `[perfplus-l1] FINDINGS (surface × viewport × invariant × evidence):\n${findings
        .map((f) => `  - ${f.surface} @${f.viewport} ${f.invariant}: ${f.evidence}`)
        .join('\n')}`,
    );
  }
  recorder.print();
}

type Finding = { surface: string; viewport: number; invariant: string; evidence: string };
const findings: Finding[] = [];

let storageState: PlaywrightStorageState;
let memberToken: string;
let memberId: string;
let originalBrand: string | null = null;
/** The brand the Optimizer step renders: the first candidate that owns a portfolio. */
let optimizerBrand: string = EASYFIT_BRAND_ID;

/** How many portfolios `brandId` owns, exactly as the Optimizer lists them. */
async function countPortfolios(brandId: string): Promise<number> {
  const { data, error } = await memberClient().rpc('optimizer_list_portfolios', {
    p_brand_id: brandId,
  });
  if (error)
    throw new Error(`[perfplus-l1] optimizer_list_portfolios(${brandId}): ${error.message}`);
  return Array.isArray(data) ? data.length : 0;
}

async function resolveOptimizerBrand(): Promise<string> {
  const seen: string[] = [];
  for (const brandId of OPTIMIZER_BRAND_CANDIDATES) {
    const count = await countPortfolios(brandId);
    seen.push(`${brandId.slice(0, 8)}=${count}`);
    if (count > 0) {
      notes.push(
        `Optimizer brand: ${brandId} (${count} portfolios; candidates ${seen.join(', ')})`,
      );
      return brandId;
    }
  }
  notes.push(
    `Optimizer brand: no candidate owns a portfolio (${seen.join(', ')}) — tabs will be unexercised`,
  );
  return EASYFIT_BRAND_ID;
}

function memberClient(): SupabaseClient {
  return createClient(PROD_SUPABASE_URL, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${memberToken}` } },
  });
}

function subjectOf(token: string): string {
  const payload = token.split('.')[1] ?? '';
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
  };
  if (!decoded.sub) throw new Error('[perfplus-l1] access token carries no sub claim');
  return decoded.sub;
}

/** Pins the brand the pages will render, the way the in-app brand switcher does: the preference
 *  row written AS the bench's own session, so the session pin trigger follows. Read back through
 *  the page's own resolver, so a switch that did not take fails here by name. */
async function selectBrand(brandId: string): Promise<void> {
  const client = memberClient();
  const { error } = await client
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert(
      { user_id: memberId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[perfplus-l1] brand switch failed: ${error.message}`);
  const { data } = await client.schema('brand_profiles').rpc('resolve_active_brand_for_session');
  expect(data, `the bench session must render brand ${brandId}`).toBe(brandId);
}

const describeState = (state: DefinedState): string =>
  state.kind === 'content' ? `content (${state.chars} chars)` : `${state.kind}: ${state.name}`;

const slug = (label: string): string => label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

/** Runs every L1 invariant on the page as it stands, grades each in the Recorder, files each
 *  break as a finding, and soft-asserts so the next surface still runs. */
async function audit(
  page: Page,
  l1: L1Handle,
  surface: string,
  viewport: number,
  extra: readonly { invariant: string; evidence: string }[] = [],
): Promise<void> {
  const label = `${surface} @${viewport}`;
  const broken: { invariant: string; evidence: string }[] = [...extra];

  try {
    const state = await expectDefinedState(page, { label, settleMs: SETTLE_MS });
    recorder.record(`${label} defined-state`, 'PASS', describeState(state));
    if (state.kind === 'error') notes.push(`${label} rendered a named error state — ${state.name}`);
  } catch (error) {
    const evidence = error instanceof Error ? error.message : String(error);
    broken.push({ invariant: 'defined-state', evidence });
  }

  // Late responses (a slow edge answering after the skeleton left) still count.
  await page.waitForLoadState('networkidle', { timeout: QUIET_MS }).catch(() => undefined);

  const report = l1.report();
  for (const line of report.ignored) notes.push(`${label} ignored: ${line}`);
  // The grade keeps the first line; the notes keep every DISTINCT line, so a "+3 more" is
  // readable from the envelope without re-running.
  for (const [invariant, lines] of [
    ['console-errors', report.consoleErrors],
    ['server-errors', report.serverErrors],
    ['failed-requests', report.failedRequests],
  ] as const) {
    for (const line of [...new Set(lines)].slice(0, 8))
      notes.push(`${label} ${invariant}: ${line}`);
  }
  broken.push(...l1Failures(report));

  for (const invariant of ['console-errors', 'server-errors', 'failed-requests'] as const) {
    const hit = broken.find((b) => b.invariant === invariant);
    recorder.record(`${label} ${invariant}`, hit ? 'FAIL' : 'PASS', hit?.evidence);
  }
  for (const b of broken) {
    if (
      b.invariant === 'defined-state' ||
      b.invariant === 'click-effect' ||
      b.invariant === 'tab-selected'
    ) {
      recorder.record(`${label} ${b.invariant}`, 'FAIL', b.evidence);
    }
    findings.push({ surface, viewport, invariant: b.invariant, evidence: b.evidence });
  }

  mkdirSync(SHOTS_DIR, { recursive: true });
  await page
    .screenshot({ path: resolve(SHOTS_DIR, `${slug(label)}.png`), fullPage: true })
    .catch(() => undefined);

  expect.soft(broken, formatL1Failures(label, broken)).toEqual([]);
}

async function open(context: BrowserContext, path: string): Promise<{ page: Page; l1: L1Handle }> {
  const page = await context.newPage();
  const l1 = attachL1(page);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  return { page, l1 };
}

/** Clicks a tab, proving the click reacted; a silent click is a `click-effect` finding carried
 *  into the next audit rather than a thrown error, so the tab's own state is still audited. */
async function clickTab(
  page: Page,
  name: string,
): Promise<{ invariant: string; evidence: string }[]> {
  const tab = page.getByRole('tab', { name }).first();
  try {
    await clickExpectingEffect(tab, { label: `tab ${name}` });
    // A reaction is not enough for a tab: the Portfolios content once swapped in while the
    // Automations trigger stayed highlighted. The tab the user pressed must read as selected.
    const selected = await tab
      .evaluate(
        (el) =>
          new Promise<boolean>((resolve) => {
            const started = Date.now();
            const poll = () => {
              if (el.getAttribute('aria-selected') === 'true') return resolve(true);
              if (Date.now() - started > 2000) return resolve(false);
              setTimeout(poll, 50);
            };
            poll();
          }),
      )
      .catch(() => false);
    if (!selected) {
      const selectedNow = await page
        .getByRole('tab', { selected: true })
        .first()
        .textContent()
        .catch(() => null);
      return [
        {
          invariant: 'tab-selected',
          evidence: `tab "${name}" is not aria-selected 2000ms after its click (selected tab: ${selectedNow?.trim() ?? 'none'})`,
        },
      ];
    }
    return [];
  } catch (error) {
    return [
      {
        invariant: 'click-effect',
        evidence: error instanceof Error ? error.message : String(error),
      },
    ];
  }
}

async function auditOptimizer(context: BrowserContext, viewport: number): Promise<void> {
  const { page, l1 } = await open(context, '/scale?tab=performance');
  try {
    await audit(page, l1, 'Optimizer/Overview', viewport);

    // The tablist exists only when the account carries a portfolio. Any other landing is a
    // defined state the audit above already graded; the tabs are then UNEXERCISED by name,
    // never a click-effect finding against a control that is not on the page.
    const tablist = page.getByRole('tab', { name: 'Overview' });
    const hasTablist = await tablist.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!hasTablist) {
      const landing =
        (await Promise.all(
          OPTIMIZER_NO_TABLIST_LANDINGS.map(async (headline) =>
            (await page
              .getByText(headline)
              .first()
              .isVisible()
              .catch(() => false))
              ? headline
              : null,
          ),
        ).then((hits) => hits.find((hit) => hit !== null))) ??
        'an unrecognised landing without a tablist';
      for (const tab of OPTIMIZER_TABS) {
        recorder.record(`Optimizer/${tab} @${viewport}`, 'SKIP', `landed on "${landing}"`);
      }
      recorder.record(`Optimizer/Portfolio detail @${viewport}`, 'SKIP', `landed on "${landing}"`);
      notes.push(
        `Optimizer tabs @${viewport}: unexercised — brand ${optimizerBrand} landed on "${landing}" (no tablist)`,
      );
      return;
    }

    for (const tab of OPTIMIZER_TABS) {
      l1.reset();
      const clickFindings = await clickTab(page, tab);
      await audit(page, l1, `Optimizer/${tab}`, viewport, clickFindings);
    }

    // The detail workspace: the first portfolio row on the Portfolios tab, when there is one.
    l1.reset();
    const portfolioClick = await clickTab(page, 'Portfolios');
    // OptimizerPortfolios.tsx renders each portfolio as `<button aria-label="Open <name>">`;
    // `portfolio-row` is the Overview's card, not this list's.
    const rows = page.getByRole('button', { name: /^Open / });
    const rowCount = await rows.count();
    if (rowCount === 0) {
      recorder.record(`Optimizer/Portfolio detail @${viewport}`, 'SKIP', 'no portfolio row');
      notes.push(
        `Optimizer/Portfolio detail @${viewport}: unexercised — the Portfolios tab listed no portfolio-row for ${optimizerBrand}`,
      );
      if (portfolioClick.length > 0) {
        expect
          .soft(
            portfolioClick,
            formatL1Failures(`Optimizer/Portfolios @${viewport}`, portfolioClick),
          )
          .toEqual([]);
      }
      return;
    }
    l1.reset();
    const name = (await rows.first().textContent())?.trim().slice(0, 40) ?? 'first portfolio';
    let rowFindings: { invariant: string; evidence: string }[] = [];
    try {
      await clickExpectingEffect(rows.first(), { label: `portfolio row "${name}"` });
    } catch (error) {
      rowFindings = [
        {
          invariant: 'click-effect',
          evidence: error instanceof Error ? error.message : String(error),
        },
      ];
    }
    await audit(page, l1, 'Optimizer/Portfolio detail', viewport, rowFindings);

    for (const section of PORTFOLIO_SECTIONS) {
      l1.reset();
      const clickFindings = await clickTab(page, section);
      await audit(page, l1, `Optimizer/Portfolio detail/${section}`, viewport, clickFindings);
    }
  } finally {
    l1.detach();
    await page.close();
  }
}

async function auditSurface(
  context: BrowserContext,
  surface: Surface,
  viewport: number,
): Promise<void> {
  const { page, l1 } = await open(context, surface.path);
  try {
    await audit(page, l1, surface.name, viewport);
  } finally {
    l1.detach();
    await page.close();
  }
}

async function viewportContext(browser: Browser, width: number, height: number) {
  return browser.newContext({ storageState, viewport: { width, height } });
}

test.describe('Performance+ L1 — every surface, both viewports, Easy Fit owner', () => {
  test.beforeAll(async () => {
    const session = await mintSessionBundleForEmail(OWNER_EMAIL);
    memberToken = session.accessToken;
    memberId = subjectOf(memberToken);
    storageState = session.state;
    const { data } = await admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', memberId)
      .maybeSingle();
    originalBrand = (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
    optimizerBrand = await resolveOptimizerBrand();
    await selectBrand(EASYFIT_BRAND_ID);
  });

  test.afterAll(async () => {
    if (originalBrand && originalBrand !== EASYFIT_BRAND_ID) await selectBrand(originalBrand);
    printEnvelopeOnce();
  });

  test('every Performance+ surface holds the L1 invariants at 1280 and 375', async ({
    browser,
  }) => {
    // 7 surfaces × 2 viewports, plus the Optimizer's tabs, each settling on live reads.
    test.setTimeout(45 * 60_000);

    for (const { width, height } of VIEWPORTS) {
      const context = await viewportContext(browser, width, height);
      try {
        for (const surface of SURFACES) {
          await test.step(`${surface.name} @${width}`, async () => {
            if (surface.name !== 'Optimizer') {
              await auditSurface(context, surface, width);
              return;
            }
            // The Optimizer renders on the brand that owns a portfolio; the rest of the lane
            // stays on the seeded brand, so the pin is swapped around this step only.
            if (optimizerBrand !== EASYFIT_BRAND_ID) await selectBrand(optimizerBrand);
            try {
              await auditOptimizer(context, width);
            } finally {
              if (optimizerBrand !== EASYFIT_BRAND_ID) await selectBrand(EASYFIT_BRAND_ID);
            }
          });
        }
      } finally {
        // A context that fails to close (a Playwright artifact race) must not cost the next
        // viewport its audit; it is noted, and the envelope still carries every grade.
        await context.close().catch((error: unknown) => {
          notes.push(
            `context.close @${width} failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
          );
        });
      }
    }
    printEnvelopeOnce();
  });
});
