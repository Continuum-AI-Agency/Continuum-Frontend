import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  type Route,
  test,
} from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail, type PlaywrightStorageState } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import {
  clickExpectingEffect,
  type DefinedState,
  expectDefinedState,
} from './support/l1Invariants';
import { benchBrowserChannel, loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';
import {
  formatVisualViolations,
  groupByRule,
  VISUAL_RULES,
  type VisualViolation,
} from './support/visualGeometry';
import {
  auditVisual,
  installVisualProbes,
  resetLayoutShift,
  resolveAxeScript,
  seedTheme,
  type VisualReport,
  type VisualState,
  type VisualTheme,
} from './support/visualInvariants';

// ---------------------------------------------------------------------------
// perfplus:visual:bench — the Performance+ campaign's VISUAL lane (L1V): the geometric
// detector of docs/perfplus-design-intent.md ("Lo que el detector marca como fallo sin juez")
// run over every Performance+ surface.
//
// A real Chrome drives the real Frontend as the Easy Fit owner, against production Supabase
// and the Backend the Frontend `.env` names. The surface list is the L1 lane's
// (perfplus-l1.bench.spec.ts): the Optimizer (Overview, every tab its tablist exposes, the
// first portfolio's detail and its Manage / Activity sections), Jaina, Campaigns, Dashboard,
// Approvals, Campaign Canvas and Home Overview. Each is audited at
//
//   viewports  375 · 768 · 1280 · 1440
//   themes     light · dark   (seeded the way the app stores it: localStorage.theme)
//   states     loaded always; empty and error for the Optimizer Overview, Jaina and Approvals
//              by routing the surface's OWN data calls (abort → error, empty payload → empty)
//
// with the ten rules of e2e/support/visualInvariants.ts: overlap, clipped-text,
// covered-control, tap-target, horizontal-scroll, layout-shift, contrast, tooltip-offscreen,
// money-currency and selected-tab-indicator. Every violation is one FAIL row naming surface ×
// viewport × theme × state × rule × selector, with a full-page screenshot per audit in
// e2e/__screenshots__/perfplus-l1v/. The thresholds are the intent's (24 px, CLS 0.1, AA) and
// are never tuned here: a violation is a FINDING for the campaign ledger.
//
// ── READ ONLY ── Nothing here approves, applies, pauses, converts, reverts, creates or saves.
// The only clicks are `role="tab"` triggers and a portfolio row (a URL push); the only hovers
// and focuses are the first tooltip triggers of each page. The single write is the bench
// user's active-brand preference (pinned to Easy Fit, restored at the end) — the same row the
// in-app brand switcher writes, written the same way.
//
// ── ONE TEST, MANY STEPS ── as in the L1 lane: one test with a step per audit and SOFT
// assertions prints one Recorder envelope and still names everything on every failure.
//
// Usage: cd Continuum-Frontend && bun run perfplus:visual:bench
// ---------------------------------------------------------------------------

test.use(benchBrowserChannel());

const { serviceRoleKey, publishableKey } = loadProdSupabaseEnv();

const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
/** Easy Fit, the agency row — the campaign's seeded brand (00-context.md, "Auth para tests"). */
const EASYFIT_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
/** The other Easy Fit row: it owns the active portfolios on the same ad account, where the
 *  agency row owned none on 2026-10-05. The Optimizer tablist only renders when the account
 *  carries a portfolio, so the Optimizer step runs on the first candidate that does. */
const EASYFIT_LEDGER_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const OPTIMIZER_BRAND_CANDIDATES = [EASYFIT_BRAND_ID, EASYFIT_LEDGER_BRAND_ID] as const;

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
  { width: 1440, height: 900 },
] as const;

const THEMES: readonly VisualTheme[] = ['light', 'dark'];

/** PERFPLUS_VISUAL_SMOKE=1 runs one viewport and one theme (every surface, every state): a
 *  fifteen-minute check that the detector still runs end to end, before the full matrix. */
const SMOKE = process.env.PERFPLUS_VISUAL_SMOKE === '1';
const MATRIX_VIEWPORTS = SMOKE ? [VIEWPORTS[2]] : VIEWPORTS;
const MATRIX_THEMES: readonly VisualTheme[] = SMOKE ? ['light'] : THEMES;

type Surface = { name: string; path: string; states: readonly VisualState[] };

const SURFACES: readonly Surface[] = [
  { name: 'Optimizer', path: '/scale?tab=performance', states: ['loaded', 'empty', 'error'] },
  { name: 'Jaina', path: '/scale?tab=jaina', states: ['loaded', 'empty', 'error'] },
  { name: 'Campaigns', path: '/scale?tab=campaigns', states: ['loaded'] },
  { name: 'Dashboard', path: '/scale?tab=dashboard', states: ['loaded'] },
  { name: 'Approvals', path: '/scale/approvals', states: ['loaded', 'empty', 'error'] },
  { name: 'Campaign Canvas', path: '/scale/campaign-canvas', states: ['loaded'] },
  { name: 'Home Overview', path: '/dashboard?view=overview', states: ['loaded'] },
];

/** The Optimizer's tablist (OptimizerTab.tsx), minus Overview which is the landing view. */
const OPTIMIZER_TABS = ['Automations', 'Portfolios', 'Actions', 'Activity'] as const;
const PORTFOLIO_SECTIONS = ['Manage', 'Activity'] as const;

/** Each surface's OWN data calls, so the empty and error states come from the real code path
 *  reacting to the real boundary — not from a prop. `empty` fulfils with the payload the
 *  surface parses as "nothing here"; `error` aborts the request. */
type StateRoute = { match: RegExp; empty: (route: Route) => unknown };
const STATE_ROUTES: Record<string, readonly StateRoute[]> = {
  Optimizer: [
    // useOptimizerData.ts: the portfolio list is the Optimizer's root read; no portfolio
    // lands on OptimizerOnboarding ("Put ad sets under the Optimizer"), an unreachable list
    // on OptimizerOffline ("Can't reach the optimizer").
    { match: /\/rest\/v1\/rpc\/optimizer_list_portfolios/, empty: () => [] },
    // With no portfolio the status edge is never called; in the error state it is aborted too.
    { match: /\/functions\/v1\/optimizer-status/, empty: () => null },
  ],
  Jaina: [
    // JainaChatSurface.tsx: the conversation history behind the transcript and the sidebar.
    {
      match: /\/api\/agents\/jaina\/chat\/conversations/,
      empty: () => ({ sessions: [], uiMessages: [] }),
    },
  ],
  Approvals: [
    // lib/approvals/client.ts: everything goes through the `rule-actions` edge; `list` is the
    // queue read (ListResponse), `dryRun` the mode pill.
    {
      match: /\/functions\/v1\/rule-actions/,
      empty: (route) => {
        const body = route.request().postDataJSON() as { action?: string } | null;
        if (body?.action === 'list') return { data: [], total: 0, limit: 200, offset: 0 };
        return null;
      },
    },
  ],
};

const SHOTS_DIR = resolve(__dirname, '__screenshots__/perfplus-l1v');
/** How long a surface may keep loading before the audit reads it as it stands. */
const SETTLE_MS = 90_000;
/** After settle: late responses and the fonts, then a quiet moment before measuring. */
const QUIET_MS = 5_000;

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const notes: string[] = [];
const recorder = createBenchRecorder('perfplus:visual:bench', notes);

type Finding = {
  surface: string;
  viewport: number;
  theme: VisualTheme;
  state: VisualState;
  violation: VisualViolation;
  screenshot: string;
};
const findings: Finding[] = [];

let storageState: PlaywrightStorageState;
let memberToken: string;
let memberId: string;
let originalBrand: string | null = null;
let optimizerBrand: string = EASYFIT_BRAND_ID;

/** The envelope is printed ONCE: from the test when it completes and from afterAll when the
 *  test was aborted. The factory runner reads the last `{...counts...}` stdout line. */
let envelopePrinted = false;
function printEnvelopeOnce(): void {
  if (envelopePrinted) return;
  envelopePrinted = true;
  if (findings.length > 0) {
    const byRule = groupByRule(findings.map((f) => f.violation));
    const lines: string[] = [];
    for (const [rule, hits] of byRule) {
      lines.push(`  ${rule}: ${hits.length}`);
      for (const f of findings.filter((f) => f.violation.rule === rule)) {
        lines.push(
          `    - ${f.surface} @${f.viewport} ${f.theme} ${f.state} ${f.violation.selector}: ${f.violation.detail} [${f.screenshot}]`,
        );
      }
    }
    console.log(
      `[perfplus-l1v] FINDINGS by rule (surface × viewport × theme × state × selector):\n${lines.join('\n')}`,
    );
  }
  recorder.print();
}

/* ------------------------------------------------------------------------- */
/* Session and brand — as the L1 lane does it                                 */
/* ------------------------------------------------------------------------- */

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
  if (!decoded.sub) throw new Error('[perfplus-l1v] access token carries no sub claim');
  return decoded.sub;
}

async function countPortfolios(brandId: string): Promise<number> {
  const { data, error } = await memberClient().rpc('optimizer_list_portfolios', {
    p_brand_id: brandId,
  });
  if (error)
    throw new Error(`[perfplus-l1v] optimizer_list_portfolios(${brandId}): ${error.message}`);
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

/** Pins the brand the pages will render, the way the in-app brand switcher does, read back
 *  through the page's own resolver so a switch that did not take fails here by name. */
async function selectBrand(brandId: string): Promise<void> {
  const client = memberClient();
  const { error } = await client
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert(
      { user_id: memberId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[perfplus-l1v] brand switch failed: ${error.message}`);
  const { data } = await client.schema('brand_profiles').rpc('resolve_active_brand_for_session');
  expect(data, `the bench session must render brand ${brandId}`).toBe(brandId);
}

/* ------------------------------------------------------------------------- */
/* The audit                                                                  */
/* ------------------------------------------------------------------------- */

const slug = (label: string): string => label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

const describeState = (state: DefinedState): string =>
  state.kind === 'content' ? `content (${state.chars} chars)` : `${state.kind}: ${state.name}`;

const axeScriptPath = resolveAxeScript();

type AuditKey = { surface: string; viewport: number; theme: VisualTheme; state: VisualState };

const labelOf = (key: AuditKey): string =>
  `${key.surface} @${key.viewport} ${key.theme} ${key.state}`;

/** Waits for the surface to settle (a defined state, late responses, fonts, a quiet moment),
 *  runs the detector, screenshots, grades every rule in the Recorder and files each violation
 *  as a finding. Soft-asserted so the next audit still runs. */
async function audit(page: Page, key: AuditKey): Promise<VisualReport | null> {
  const label = labelOf(key);
  let settled = '';
  try {
    const state = await expectDefinedState(page, { label, settleMs: SETTLE_MS });
    settled = describeState(state);
    if (key.state !== 'loaded' && state.kind !== key.state) {
      notes.push(`${label}: requested ${key.state}, the surface rendered ${settled}`);
    }
  } catch (error) {
    settled = `undefined — ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
    notes.push(`${label}: ${settled}`);
  }
  await page.waitForLoadState('networkidle', { timeout: QUIET_MS }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
  await page.waitForTimeout(500);

  const theme = await page
    .evaluate(() => document.documentElement.getAttribute('data-theme'))
    .catch(() => null);
  if (theme !== key.theme) notes.push(`${label}: data-theme is "${theme}", expected ${key.theme}`);

  let report: VisualReport;
  try {
    report = await auditVisual(page, key, { axeScriptPath });
  } catch (error) {
    const evidence = error instanceof Error ? error.message.split('\n')[0] : String(error);
    recorder.record(`${label} audit`, 'FAIL', `detector did not run: ${evidence}`);
    notes.push(`${label}: detector did not run — ${evidence}`);
    return null;
  }

  mkdirSync(SHOTS_DIR, { recursive: true });
  const screenshot = `${slug(label)}.png`;
  await page
    .screenshot({ path: resolve(SHOTS_DIR, screenshot), fullPage: true })
    .catch(() => undefined);

  for (const line of report.unexercised)
    recorder.record(`${label} ${line.split(':')[0]}`, 'SKIP', line);
  const byRule = groupByRule(report.violations);
  for (const rule of VISUAL_RULES) {
    const hits = byRule.get(rule) ?? [];
    if (report.unexercised.some((line) => line.split(':')[0].split('/').includes(rule))) continue;
    if (hits.length === 0) {
      recorder.record(`${label} ${rule}`, 'PASS');
      continue;
    }
    for (const hit of hits) {
      recorder.record(`${label} ${rule} ${hit.selector}`, 'FAIL', hit.detail);
      findings.push({ ...key, violation: hit, screenshot });
    }
  }
  notes.push(
    `${label}: ${settled}; ${report.stats.nodes} nodes, ${report.stats.controls} controls, ${report.stats.textElements} text boxes, ${report.stats.figures} figures, ${report.stats.tablists} tablists, CLS ${report.stats.layoutShift.toFixed(3)}, ${report.stats.tooltipsProbed} tooltip triggers, ${report.stats.contrastUndetermined} contrast nodes axe could not decide`,
  );

  expect.soft(report.violations, formatVisualViolations(label, report.violations)).toEqual([]);
  return report;
}

/** Applies the surface's empty / error routing to `page`. */
async function routeState(page: Page, surface: string, state: VisualState): Promise<void> {
  if (state === 'loaded') return;
  for (const { match, empty } of STATE_ROUTES[surface] ?? []) {
    await page.route(
      (url) => match.test(url.href),
      async (route) => {
        if (state === 'error') {
          await route.abort('failed');
          return;
        }
        const body = empty(route);
        if (body === null) {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      },
    );
  }
}

async function open(context: BrowserContext, surface: Surface, state: VisualState): Promise<Page> {
  const page = await context.newPage();
  await routeState(page, surface.name, state);
  await page.goto(surface.path, { waitUntil: 'domcontentloaded' });
  return page;
}

/** Clicks a tab, proving the click reacted and waiting for it to read as selected; a tab that
 *  never reads as selected is noted (the L1 lane's `tab-selected` finding) and the state the
 *  page is left in is what rule (j) audits. */
async function clickTab(page: Page, name: string, label: string): Promise<void> {
  const tab = page.getByRole('tab', { name }).first();
  try {
    await clickExpectingEffect(tab, { label: `tab ${name}` });
  } catch (error) {
    notes.push(
      `${label}: tab "${name}" ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
    );
    return;
  }
  const selected = await tab
    .evaluate(
      (el) =>
        new Promise<boolean>((resolveSelected) => {
          const started = Date.now();
          const poll = () => {
            if (el.getAttribute('aria-selected') === 'true') return resolveSelected(true);
            if (Date.now() - started > 2000) return resolveSelected(false);
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
    notes.push(
      `${label}: tab "${name}" is not aria-selected 2000ms after its click (selected tab: ${selectedNow?.trim() ?? 'none'})`,
    );
  }
}

async function auditOptimizer(
  context: BrowserContext,
  viewport: number,
  theme: VisualTheme,
  state: VisualState,
): Promise<void> {
  const surface = SURFACES[0];
  const page = await open(context, surface, state);
  try {
    await audit(page, { surface: 'Optimizer/Overview', viewport, theme, state });
    if (state !== 'loaded') return;

    // The tablist exists only when the account carries a portfolio; any other landing was
    // audited above and the tabs are unexercised by name.
    const hasTablist = await page
      .getByRole('tab', { name: 'Overview' })
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (!hasTablist) {
      const landing = (
        await page
          .locator('main h2, main h3')
          .first()
          .textContent()
          .catch(() => null)
      )?.trim();
      recorder.record(
        `Optimizer tabs @${viewport} ${theme}`,
        'SKIP',
        `no tablist (${landing ?? 'unknown landing'})`,
      );
      notes.push(
        `Optimizer tabs @${viewport} ${theme}: unexercised — brand ${optimizerBrand} landed on "${landing}" (no tablist)`,
      );
      return;
    }

    for (const tab of OPTIMIZER_TABS) {
      const key = { surface: `Optimizer/${tab}`, viewport, theme, state };
      await resetLayoutShift(page);
      await clickTab(page, tab, labelOf(key));
      await audit(page, key);
    }

    // The detail workspace: the first portfolio row on the Portfolios tab, when there is one.
    await clickTab(page, 'Portfolios', `Optimizer/Portfolios @${viewport} ${theme}`);
    const rows = page.getByRole('button', { name: /^Open / });
    if ((await rows.count()) === 0) {
      recorder.record(
        `Optimizer/Portfolio detail @${viewport} ${theme}`,
        'SKIP',
        'no portfolio row',
      );
      notes.push(
        `Optimizer/Portfolio detail @${viewport} ${theme}: unexercised — no portfolio row for ${optimizerBrand}`,
      );
      return;
    }
    const name = (await rows.first().textContent())?.trim().slice(0, 40) ?? 'first portfolio';
    await resetLayoutShift(page);
    try {
      await clickExpectingEffect(rows.first(), { label: `portfolio row "${name}"` });
    } catch (error) {
      notes.push(
        `Optimizer/Portfolio detail @${viewport} ${theme}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
    }
    await audit(page, { surface: 'Optimizer/Portfolio detail', viewport, theme, state });

    for (const section of PORTFOLIO_SECTIONS) {
      const key = { surface: `Optimizer/Portfolio detail/${section}`, viewport, theme, state };
      await resetLayoutShift(page);
      await clickTab(page, section, labelOf(key));
      await audit(page, key);
    }
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function auditSurface(
  context: BrowserContext,
  surface: Surface,
  viewport: number,
  theme: VisualTheme,
  state: VisualState,
): Promise<void> {
  const page = await open(context, surface, state);
  try {
    await audit(page, { surface: surface.name, viewport, theme, state });
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function themedContext(
  browser: Browser,
  viewport: { width: number; height: number },
  theme: VisualTheme,
): Promise<BrowserContext> {
  const context = await browser.newContext({ storageState, viewport });
  await installVisualProbes(context);
  await seedTheme(context, theme);
  return context;
}

test.describe('Performance+ L1V — every surface × viewport × theme × state, Easy Fit owner', () => {
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
    notes.push(
      axeScriptPath
        ? `contrast: axe-core at ${axeScriptPath}`
        : 'contrast: axe-core not resolvable — rule (g) unexercised everywhere',
    );
  });

  test.afterAll(async () => {
    if (originalBrand && originalBrand !== EASYFIT_BRAND_ID) await selectBrand(originalBrand);
    printEnvelopeOnce();
  });

  test('every Performance+ surface holds the visual invariants at 375/768/1280/1440, light and dark, loaded/empty/error', async ({
    browser,
  }) => {
    test.setTimeout(4 * 60 * 60_000);

    for (const viewport of MATRIX_VIEWPORTS) {
      for (const theme of MATRIX_THEMES) {
        const context = await themedContext(browser, viewport, theme);
        try {
          for (const surface of SURFACES) {
            for (const state of surface.states) {
              await test.step(`${surface.name} @${viewport.width} ${theme} ${state}`, async () => {
                if (surface.name !== 'Optimizer') {
                  await auditSurface(context, surface, viewport.width, theme, state);
                  return;
                }
                // The Optimizer renders on the brand that owns a portfolio; the rest of the
                // lane stays on the seeded brand, so the pin is swapped around this step only.
                if (optimizerBrand !== EASYFIT_BRAND_ID) await selectBrand(optimizerBrand);
                try {
                  await auditOptimizer(context, viewport.width, theme, state);
                } finally {
                  if (optimizerBrand !== EASYFIT_BRAND_ID) await selectBrand(EASYFIT_BRAND_ID);
                }
              });
            }
          }
        } finally {
          await context.close().catch((error: unknown) => {
            notes.push(
              `context.close @${viewport.width} ${theme} failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
            );
          });
        }
      }
    }
    printEnvelopeOnce();
  });
});
