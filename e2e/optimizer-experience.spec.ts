import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  mintAccessTokenForEmail,
  mintSessionForEmail,
  type PlaywrightStorageState,
} from './support/auth';
import { benchBrowserChannel, loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// optimizer:e2e:bench — the Paid Media Optimizer experience, end to end.
//
// A real Chrome, driving the real Frontend, as a REAL authenticated member
// (magic-link → verifyOtp → the exact @supabase/ssr session cookie the app writes),
// against the REAL deployed stack: production Supabase, the deployed optimizer edge
// functions, and the optimizer service on the VM. Real client data throughout — no
// mock, no fixture, no synthetic payload. Every assertion is on RENDERED DOM.
//
// Surfaces proven, in order:
//   1. Portfolio browsing — the account that owns portfolios lists them, and opening
//      one renders the portfolio detail workspace with its cycle data.
//   2. The cross-account path — an ad account with NO portfolios renders the
//      "portfolios live on another account" notice (NOT onboarding), names the owning
//      account, and its browse/switch control actually reaches the portfolios.
//   3. Signal readiness on an all-CBO account — the verdict must read `nothing movable`,
//      never `ready`. That exact regression shipped and was caught by eye; this is its
//      DOM assertion.
//   4. Projected CBO→ABO — a projected-conversion card per CBO campaign showing
//      held-vs-projected budgets, and "Project the first cycle" running the REAL engine
//      through the deployed optimizer-cycle-preview edge → the reallocation flow and the
//      recommendation count. The UI degrades quietly when that route is missing; this
//      bench does NOT. An `unavailable` outcome FAILS the run and says so.
//   5. Portfolio CTAs — "Open the audience proposal" on an asked-for row and "Open the
//      creative recommendation" on a news card each land on ONE expanded, on-screen queue
//      row; a blocked proposal shows its reason and a disabled create button; and the
//      Ask-Jaina band sits between the vital signs and the news cards.
//   6. The Overview as proposal O1 orders it (Performance+ redesign, stage 1b): the sentence
//      with figures, the sub-line, the Jaina band, four to six state-coloured tiles, the
//      recommendation cards with the lead marked, then the portfolio rows — in that order,
//      nothing else above the fold, no chart, and none of the old copy.
//   7. The portfolio hero as ONE module (idea D, "número ancla") on FORMULARIOS // TODOS:
//      the name line, the 44px anchor beside two sentences with a figure, four frameless
//      state-ruled tiles, the last-cycle line and Jaina's bar at the foot, then the cards; the
//      ad-set ranking first in the body; the funnel and the reallocation behind "Ver
//      detalle"; and no full-width green or red bar anywhere under the hero.
//
// ── MONEY SAFETY — this is a READ/BROWSE bench, and it cannot move money ──
//   * Nothing here clicks Apply, Convert, Revert, "Run now", Create, Enroll, Archive, or
//     any confirm in ApplyReallocationDialog / RevertApplyDialog / the convert dialog.
//     None of those labels is targeted anywhere in this file.
//   * The two engine paths it DOES exercise are read-only by construction: the projected
//     conversion is a pure client-side computation, and optimizer-cycle-preview runs the
//     engine at the service with no persist, no applier and no run row.
//   * No portfolio is created, enrolled, archived or mutated. Browsing only.
//   * The one write this bench makes is the ACTIVE-BRAND PREFERENCE row for the bench
//     user (brand_profiles.user_brand_preferences) — the same row the in-app brand
//     switcher writes. It is captured before the run and restored after.
//   * Money-family ACTIONS are counted for BOTH brands before and after, through the
//     `optimizer_list_actions` RPC — the ad-account write ledger itself. NOT through
//     `.schema('optimizer').from(...)`: the `optimizer` schema is not in PostgREST's
//     exposed-schema allowlist, so that read silently returns a null count and would
//     make the money assertion incapable of failing.
//
// Usage: cd Continuum-Frontend && bun run optimizer:e2e:bench
// ---------------------------------------------------------------------------

test.use(benchBrowserChannel());

const { serviceRoleKey, publishableKey } = loadProdSupabaseEnv();

// Verified production pairs. A mismatched (brand, member) pair reads an EMPTY world and
// reports a false green, so brand AND owner are pinned together here.
//
// Production carries TWO duplicate "Easy Fit" brand rows, and they split the evidence: the
// AGENCY row owns the live portfolios this bench browses, while the CLIENT row owns every
// ad-account write in optimizer.apply_audits (and 8 active portfolios of its own on the same
// ad account). Both are pinned below, and both are inside the money-safety net.
const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
const AGENCY_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
const VIVO47_BRAND_ID = '61b80f51-709a-4408-9f11-04142a286baa';
/** The OTHER "Easy Fit" row (the bench user is an admin on it). It is where every ad-account
 *  write in production actually lives — 38 budget writes in optimizer.apply_audits, all of
 *  them reversible, against 8 active portfolios on the SAME ad account as the agency row,
 *  which owns zero apply_audits rows. The action feed can only be proven against real rows,
 *  so the Activity test runs here; every other test stays on the agency row. */
const EASYFIT_LEDGER_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';

/** Owns both live portfolios and 64 live ad sets. */
const PORTFOLIO_ACCOUNT_ID = '521903353286118';
const PORTFOLIO_ACCOUNT_LABEL = 'Easyfit';
/** Assigned to the same brand, owns NO portfolios — the cross-account notice's trigger. */
const EMPTY_ACCOUNT_ID = '1296885445611472';
/** All CBO: 4 campaigns, every ad set held `unsupported_budget`, nothing optimizable. */
const CBO_ACCOUNT_ID = '1164707387246066';

// Pinned by NAME, so they go stale when the account's portfolios are renamed or replaced —
// which is what happened to the previous pair ('Mensajes Julio 2026' / 'Leads test'). Verify
// against optimizer.portfolios for brand 148583e0… before assuming a failure here is a
// regression: ENROLLED must be the one with active portfolio_adsets, EMPTY the one without.
const ENROLLED_PORTFOLIO_NAME = 'Citas Agosto - check leads';
const EMPTY_PORTFOLIO_NAME = 'Reporte Agosto - Citas y Mensajes';

// Two portfolios on the LEDGER brand whose read rows carry a CTA into the queue, read from
// production on 2026-09-28. Both premises are checked against optimizer.audience_proposals /
// optimizer.recommendations before assuming a failure here is a regression:
//   TOURS — an asked-for audience row (ad-hoc suggestion 89a4a5ec, adopted) handed off to
//     recommendation 1a36cfc3 and proposal 622bc858; the worker BLOCKED the proposal
//     (no_creatives, proposal null) and the next cycle superseded it, expiring the
//     recommendation. "Open the audience proposal" must still land on that row, expanded,
//     with the block's reason and a disabled create button.
//   PRUEBA — a pending C2 variate_creative recommendation (e4093df7) the brief lists as a
//     secondary candidate, so its insight card offers "Open the creative recommendation".
const TOURS_PORTFOLIO_NAME = 'Septiembre - Tours Programados';
const PRUEBA_PORTFOLIO_NAME = 'Prueba';
/** The portfolio every idea on the redesign page is drawn with (portafolio.html): 9 ad sets on
 *  autopilot, leads against a 35 MXN target, pending decisions. Same ledger brand. */
const FORMULARIOS_PORTFOLIO_NAME = 'FORMULARIOS // TODOS';

const SHOTS_DIR = resolve(__dirname, '__screenshots__/optimizer-e2e');

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let storageState: PlaywrightStorageState;
let benchUserId: string;
let originalActiveBrandId: string | null = null;
let moneyEventsBefore = 0;

/** The `sub` claim of a real GoTrue access token — the bench user's id, read from the
 *  token the auth server actually issued rather than looked up by email. */
function subjectOf(accessToken: string): string {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('[optimizer-bench] access token has no payload segment');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
  };
  if (!decoded.sub) throw new Error('[optimizer-bench] access token carries no sub claim');
  return decoded.sub;
}

/** Money-family ACTIONS for a brand — every write that touched the ad account, read from
 *  the ledger itself (optimizer.apply_audits, via public.optimizer_list_actions).
 *
 *  This used to count `apply_*` / `convert_*` rows in `optimizer_list_logs`. That counter is
 *  now structurally blind: optimizer_list_logs was narrowed to LIFECYCLE server-side and
 *  DENYLISTS `apply\_%`, so a real budget write would no longer appear in it at all and the
 *  assertion would have gone on passing while proving nothing. The ledger is the right source
 *  anyway — apply_audits is written in the same transaction as the ledger confirm, where the
 *  log sink was best-effort and drops a batch on flush failure. */
async function moneyEventCount(brandId: string): Promise<number> {
  const { data, error } = await admin.rpc('optimizer_list_actions', {
    p_brand_id: brandId,
    p_limit: 500,
  });
  if (error) {
    throw new Error(`[optimizer-bench] optimizer_list_actions unreachable: ${error.message}`);
  }
  const rows = Array.isArray(data) ? (data as Array<{ family?: unknown }>) : [];
  return rows.filter((row) => row.family === 'money').length;
}

/** Every brand this bench selects has to be inside the money-safety net, or a write made
 *  while it was active would go uncounted. */
const WATCHED_BRAND_IDS = [AGENCY_BRAND_ID, VIVO47_BRAND_ID, EASYFIT_LEDGER_BRAND_ID];

async function totalMoneyEvents(): Promise<number> {
  const counts = await Promise.all(WATCHED_BRAND_IDS.map((brandId) => moneyEventCount(brandId)));
  return counts.reduce((sum, count) => sum + count, 0);
}

async function readActiveBrandPreference(): Promise<string | null> {
  const { data, error } = await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', benchUserId)
    .maybeSingle();
  if (error) throw new Error(`[optimizer-bench] preference read failed: ${error.message}`);
  return (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
}

/** Selects the brand the page will render, through the same row the in-app brand switcher
 *  writes (brand_profiles.get_active_brand_id reads it). Restored in afterAll. */
async function selectBrand(brandId: string): Promise<void> {
  const { error } = await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert(
      { user_id: benchUserId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[optimizer-bench] brand switch failed: ${error.message}`);
}

/** Pins the ad account through the real account picker and waits for the optimizer surface
 *  to settle out of its skeleton. Split from the page load so a deep-link cold load — which
 *  navigates WITH the optimizer params already in the URL — can pin the account without a
 *  second `goto` wiping those params (the ad account is React state on the page shell, not a
 *  URL param, so it does not survive a full navigation and must be re-pinned after one). */
async function pinAdAccount(page: Page, accountId: string): Promise<void> {
  const accountPicker = page.getByRole('combobox').first();
  await expect(accountPicker).toBeEnabled({ timeout: 180_000 });
  await accountPicker.click();
  await page.getByPlaceholder('Search ad accounts...').fill(accountId);
  await page.getByRole('option').filter({ hasText: accountId }).first().click();

  await expect(page.getByRole('status').filter({ hasText: 'Loading optimizer' })).toHaveCount(0, {
    timeout: 120_000,
  });
}

/** Loads the Scale page's Optimization tab and pins the ad account through the real
 *  account picker, then waits for the optimizer surface to settle out of its skeleton. */
async function openOptimizationTab(page: Page, accountId: string): Promise<void> {
  await page.goto('/scale?tab=performance', { waitUntil: 'domcontentloaded' });
  await pinAdAccount(page, accountId);
}

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS_DIR, `${name}.png`), fullPage: true });
}

/** A context that RECORDS which Supabase origin the browser actually talked to. A run that
 *  quietly fell back to the local stack is the failure mode this bench most has to rule out. */
async function benchContext(
  browser: Browser,
): Promise<{ context: BrowserContext; hosts: Set<string> }> {
  const context = await browser.newContext({ storageState });
  const hosts = new Set<string>();
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname.includes('supabase') || url.port === '54321') hosts.add(url.host);
  });
  return { context, hosts };
}

/** Reach the SETUP surface (PortfolioSetup) for the pinned ad account — the one screen that
 *  carries Signal readiness and the CBO projection cards. It backs BOTH the empty-state
 *  onboarding and the create view, so which one an account lands on depends on whether its
 *  brand already owns portfolios. That premise drifts with production (the VIVO47 brand owns
 *  one now, where it owned none), so resolve it at run time instead of pinning it. */
async function openSetupSurface(page: Page): Promise<void> {
  const onboarding = page.getByRole('heading', { name: 'Set up the Optimizer' });
  const newPortfolio = page.getByRole('button', { name: 'Nuevo portafolio' });
  await expect(onboarding.or(newPortfolio).first()).toBeVisible({ timeout: 120_000 });
  if ((await onboarding.count()) > 0) return;
  await newPortfolio.click();
  await expect(page).toHaveURL(/optimizerView=create/);
}

test.describe.configure({ mode: 'serial' });

test.describe('Paid Media Optimizer — live experience', () => {
  test.beforeAll(async () => {
    expect(
      publishableKey.length,
      'a production Supabase publishable key must be resolved before this bench runs',
    ).toBeGreaterThan(20);

    const memberToken = await mintAccessTokenForEmail(OWNER_EMAIL);
    benchUserId = subjectOf(memberToken);
    storageState = await mintSessionForEmail(OWNER_EMAIL);

    originalActiveBrandId = await readActiveBrandPreference();
    moneyEventsBefore = await totalMoneyEvents();
    console.log(
      `[optimizer-bench] money-family actions BEFORE (watched brands): ${moneyEventsBefore}`,
    );
    console.log(`[optimizer-bench] active brand before: ${originalActiveBrandId ?? '(none)'}`);
  });

  test.afterAll(async () => {
    if (originalActiveBrandId) await selectBrand(originalActiveBrandId);
  });

  test('portfolio browsing — the owning account lists its portfolios and opens one', async ({
    browser,
  }) => {
    await selectBrand(AGENCY_BRAND_ID);
    const { context, hosts } = await benchContext(browser);
    const page = await context.newPage();

    try {
      await openOptimizationTab(page, PORTFOLIO_ACCOUNT_ID);

      // The tabbed optimizer surface — NOT onboarding, NOT the offline state.
      await expect(page.getByRole('tab', { name: 'Portfolios' })).toBeVisible();
      await expect(page.getByText('Set up the Optimizer')).toHaveCount(0);
      await expect(page.getByText(ENROLLED_PORTFOLIO_NAME).first()).toBeVisible({
        timeout: 120_000,
      });
      await expect(page.getByText(EMPTY_PORTFOLIO_NAME).first()).toBeVisible();
      await shoot(page, '01-portfolio-list');

      // Runtime proof the browser is on PROD, not the local stack .env.local pins.
      expect([...hosts], 'the browser must have talked to production Supabase').toContain(
        new URL(PROD_SUPABASE_URL).host,
      );
      expect([...hosts].filter((host) => host.includes('127.0.0.1'))).toHaveLength(0);

      // Open the enrolled portfolio's detail workspace (read-only navigation).
      await page.getByRole('button').filter({ hasText: ENROLLED_PORTFOLIO_NAME }).first().click();

      await expect(page.getByRole('button', { name: 'Back to portfolios' })).toBeVisible({
        timeout: 120_000,
      });
      await expect(
        page.getByRole('heading', { level: 2 }).filter({ hasText: ENROLLED_PORTFOLIO_NAME }),
      ).toBeVisible();
      // Its cycle data, rendered: the headline sentence with its figures, the four tiles,
      // and the disclosure the reallocation now waits behind.
      await expect(page.getByTestId('headline-status')).toBeVisible({ timeout: 120_000 });
      await expect(page.getByTestId('headline-status')).toContainText(/\d/);
      await expect(
        page.getByTestId('portfolio-tiles').locator('[data-testid^="tile-"]'),
      ).toHaveCount(4);
      await expect(page.getByTestId('portfolio-detail-more')).toContainText('Ver detalle');
      await shoot(page, '02-portfolio-detail');
    } finally {
      await context.close();
    }
  });

  test('cross-account path — the notice names the owning account and reaches its portfolios', async ({
    browser,
  }) => {
    await selectBrand(AGENCY_BRAND_ID);
    const { context } = await benchContext(browser);
    const page = await context.newPage();

    try {
      await openOptimizationTab(page, EMPTY_ACCOUNT_ID);

      // The exact distinction this surface exists to make: an empty account view whose
      // brand DOES own portfolios must NOT claim the optimizer is unconfigured.
      await expect(
        page.getByRole('heading', { name: 'No portfolios on this ad account' }),
      ).toBeVisible({ timeout: 120_000 });
      await expect(page.getByText('Set up the Optimizer')).toHaveCount(0);
      // The count is live (brandPortfolioCount) and grows as portfolios are created — the
      // regression this guards is the *wording* (a brand that DOES own portfolios must not be
      // told to "set up the optimizer"), not any one number, so match the count flexibly.
      await expect(
        page.getByText(/This brand has \d+ portfolios on\s+another ad account/),
      ).toBeVisible();
      // …and it names the account that owns them, with the one-click switch.
      await expect(page.getByText(PORTFOLIO_ACCOUNT_LABEL, { exact: true })).toBeVisible();
      // exact: the sidebar's own "Switch brand" button matches a substring 'Switch' too.
      await expect(page.getByRole('button', { name: 'Switch', exact: true })).toBeVisible();
      await shoot(page, '03-other-account-notice');

      // The browse control must actually reach the portfolios (count is live — match flexibly).
      await page.getByRole('button', { name: /Browse all \d+ portfolios/ }).click();
      await expect(page.getByText('All portfolios')).toBeVisible();
      await expect(page.getByText(ENROLLED_PORTFOLIO_NAME).first()).toBeVisible();
      await expect(page.getByText(EMPTY_PORTFOLIO_NAME).first()).toBeVisible();
      await shoot(page, '04-portfolio-browser');

      // Switch-and-open: the ad account moves AND the portfolio opens, in one action.
      await page
        .getByRole('button', {
          name: new RegExp(`Switch ad account and open ${ENROLLED_PORTFOLIO_NAME}`),
        })
        .click();
      await expect(page.getByRole('button', { name: 'Back to portfolios' })).toBeVisible({
        timeout: 120_000,
      });
      await expect(
        page.getByRole('heading', { level: 2 }).filter({ hasText: ENROLLED_PORTFOLIO_NAME }),
      ).toBeVisible();
      await shoot(page, '05-switch-and-open');
    } finally {
      await context.close();
    }
  });

  test('signal readiness on an all-CBO account reads `nothing movable`, never `ready`', async ({
    browser,
  }) => {
    await selectBrand(VIVO47_BRAND_ID);
    const { context } = await benchContext(browser);
    const page = await context.newPage();

    try {
      await openOptimizationTab(page, CBO_ACCOUNT_ID);
      await openSetupSurface(page);

      const readiness = page
        .locator('div')
        .filter({ hasText: /^Signal readiness/ })
        .first();
      await expect(page.getByText('Signal readiness')).toBeVisible({ timeout: 120_000 });

      // The regression this assertion exists for: every ad set on this account is held at
      // the campaign level, so the verdict badge must say `nothing movable`. `ready` here
      // would claim a balanced allocation over budget the optimizer cannot even move.
      await expect(page.getByText('nothing movable', { exact: true })).toBeVisible();
      await expect(readiness.getByText('ready', { exact: true })).toHaveCount(0);
      await expect(page.getByText(/ad sets have no daily budget of their own/)).toBeVisible();
      await expect(page.getByText(/\d+ not movable/)).toBeVisible();
      await shoot(page, '06-signal-readiness-nothing-movable');
    } finally {
      await context.close();
    }
  });

  test('projected CBO→ABO — cards render held-vs-projected budgets and the real engine runs', async ({
    browser,
  }) => {
    await selectBrand(VIVO47_BRAND_ID);
    const { context } = await benchContext(browser);
    const page = await context.newPage();

    try {
      await openOptimizationTab(page, CBO_ACCOUNT_ID);
      await openSetupSurface(page);

      await expect(page.getByText(/Projections, not conversions/)).toBeVisible({
        timeout: 120_000,
      });
      const projectionToggles = page.getByRole('button', { name: /Project the first cycle/ });
      const projectionCount = await projectionToggles.count();
      expect(
        projectionCount,
        'every CBO campaign on this account should project a conversion card',
      ).toBeGreaterThan(0);
      console.log(`[optimizer-bench] projected-conversion cards rendered: ${projectionCount}`);

      // Held-vs-projected budgets, on the card itself.
      await expect(page.getByText(/held at the campaign/).first()).toBeVisible();
      await expect(page.getByText(/budgeted at about/).first()).toBeVisible();
      await shoot(page, '07-projected-conversions');

      // The real engine, through the deployed optimizer-cycle-preview edge → the VM.
      await projectionToggles.first().click();
      await expect(page.getByText(/Running the optimizer over the projected ad sets/)).toHaveCount(
        0,
        { timeout: 120_000 },
      );

      // The UI degrades QUIETLY when the route is missing. A bench must not: an
      // un-exercised hop has to be stated out loud and fail, never pass in silence.
      const unavailable = await page.getByText(/Projection isn.t available yet/).count();
      const errored = await page.getByText(/Couldn.t run the projection just now/).count();
      expect(
        unavailable,
        'UN-EXERCISED HOP: the deployed optimizer-cycle-preview route was unreachable (404/501), ' +
          'so the engine leg of this projection never ran. The UI degraded quietly by design; ' +
          'this bench fails loudly instead.',
      ).toBe(0);
      expect(
        errored,
        'the optimizer-cycle-preview call returned an error outcome — the projection did not run',
      ).toBe(0);

      // The rendered result of a REAL engine run: the reallocation flow (or its honest
      // "nothing moved" state) plus the recommendation count.
      const flow = page.getByText(
        /moved across \d+ ad sets|No budget moved this cycle — allocations held steady\./,
      );
      await expect(flow.first()).toBeVisible();
      console.log(
        `[optimizer-bench] reallocation flow rendered: "${await flow.first().innerText()}"`,
      );

      const recLine = page.getByText(
        /(No action recommendations raised on the projected ad sets|\d+ action recommendations? raised on the projected ad sets)/,
      );
      await expect(recLine.first()).toBeVisible();
      console.log(
        `[optimizer-bench] recommendation count line: "${await recLine.first().innerText()}"`,
      );
      await shoot(page, '08-projected-cycle-preview');
    } finally {
      await context.close();
    }
  });

  // -------------------------------------------------------------------------
  // A-redesign navigation surfaces (IA / snappiness / create flow / deep links).
  //
  // Every test below is READ/BROWSE-ONLY, consistent with the money-safety
  // contract at the top of this file: nothing here clicks Create, Preview,
  // Save, Archive, Apply, Convert, Revert, Enroll or "Run now". They open
  // sub-views, the create PAGE STATE (render-only), and the workspace's inner
  // Manage tab, and assert the URL the shallow-history nav writes — which the
  // money-safety test at the end still proves moved nothing.
  // -------------------------------------------------------------------------

  test('sub-view nav — Overview → Portfolios swaps the sub-view and writes optimizerView to the URL', async ({
    browser,
  }) => {
    await selectBrand(AGENCY_BRAND_ID);
    const { context } = await benchContext(browser);
    const page = await context.newPage();

    try {
      await openOptimizationTab(page, PORTFOLIO_ACCOUNT_ID);

      // The tabbed surface lands on Overview (no optimizerView param → the default).
      // Clicking the Portfolios tab is a shallow history push: the sub-view swaps and the
      // URL follows without a server round-trip. `toHaveURL` reads window.location, which
      // reflects the History API write — this is the guard for the shallow-history rewrite.
      await page.getByRole('tab', { name: 'Portfolios' }).click();
      await expect(page).toHaveURL(/optimizerView=portfolios/);
      await expect(page.getByRole('heading', { name: /Portfolios \(\d+\)/ })).toBeVisible();
      await expect(page.getByText(ENROLLED_PORTFOLIO_NAME).first()).toBeVisible();
      await shoot(page, '09-portfolios-subview');
    } finally {
      await context.close();
    }
  });

  test('create view — the Nuevo portafolio action opens the create page state, and Back returns to Portfolios', async ({
    browser,
  }) => {
    await selectBrand(AGENCY_BRAND_ID);
    const { context } = await benchContext(browser);
    const page = await context.newPage();

    try {
      await openOptimizationTab(page, PORTFOLIO_ACCOUNT_ID);

      // The Overview carries the primary "Nuevo portafolio" action → the dedicated create page
      // state (NOT a sheet overlay). Render-only: the Create/Preview controls are never clicked.
      await page.getByRole('button', { name: 'Nuevo portafolio' }).click();
      await expect(page).toHaveURL(/optimizerView=create/);
      await expect(page.getByRole('heading', { name: 'Start from a suggestion' })).toBeVisible({
        timeout: 120_000,
      });

      const back = page.getByRole('button', { name: 'Back', exact: true });
      await expect(back).toBeVisible();
      await shoot(page, '10-create-view');

      // Back leaves the create state for the Portfolios sub-view.
      await back.click();
      await expect(page).toHaveURL(/optimizerView=portfolios/);
      await expect(page.getByRole('heading', { name: /Portfolios \(\d+\)/ })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('workspace Manage — the inner Manage tab renders its controls and drives section=manage', async ({
    browser,
  }) => {
    await selectBrand(AGENCY_BRAND_ID);
    const { context } = await benchContext(browser);
    const page = await context.newPage();

    try {
      await openOptimizationTab(page, PORTFOLIO_ACCOUNT_ID);

      // Open the enrolled portfolio through the existing browse flow, then move to its inner
      // Manage tab. The workspace replaces the whole tab body, so its [Performance | Manage |
      // Activity] tabs are the only tabs on screen.
      await page.getByRole('button').filter({ hasText: ENROLLED_PORTFOLIO_NAME }).first().click();
      await expect(page.getByRole('button', { name: 'Back to portfolios' })).toBeVisible({
        timeout: 120_000,
      });
      // Performance is the default inner section — its headline sentence is showing.
      await expect(page.getByTestId('headline-status')).toBeVisible({ timeout: 120_000 });

      await page.getByRole('tab', { name: 'Manage' }).click();
      await expect(page).toHaveURL(/section=manage/);
      // Manage controls render. Save/Archive are NEVER clicked.
      // The field carries a visible label and a screen-reader legend of the same text.
      await expect(page.getByText('Autonomy tier').first()).toBeVisible();
      await expect(page.getByText(/Enrolled (ad sets|campaigns)/)).toBeVisible();

      // Every config field carries the portfolio's CURRENT value — the whole point of the
      // config panel, and what it did NOT do while blanks stood in for "keep current".
      // Read-only: nothing is typed here and nothing is saved.
      await expect(page.getByLabel('Name', { exact: true })).toHaveValue(ENROLLED_PORTFOLIO_NAME);
      await expect(page.getByLabel(/^Daily budget/)).toHaveValue('3500');

      // And the autopilot guardrails stay off screen until they matter: this portfolio runs
      // on Recommend, so its opt-in entry point stands in for the section.
      await expect(page.getByText('Autopilot guardrails')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Set up autopilot/ })).toBeVisible();
      await shoot(page, '11-workspace-manage');

      // Performance restores the headline (and the section param drops).
      await page.getByRole('tab', { name: 'Performance' }).click();
      await expect(page.getByTestId('headline-status')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('deep-link cold loads — optimizerView=create and portfolio+section=manage render on first paint', async ({
    browser,
  }) => {
    await selectBrand(AGENCY_BRAND_ID);
    const { context } = await benchContext(browser);
    const page = await context.newPage();

    try {
      // (1) A cold load whose URL already carries optimizerView=create must land on the create
      // page state once its account is pinned — proving useOptimizerUrlState reads the view from
      // the URL on the FIRST render, not only after a client-side nav. The ad account is page
      // state (not a URL param), so it is pinned after the load rather than encoded in the link.
      await page.goto('/scale?tab=performance&optimizerView=create', {
        waitUntil: 'domcontentloaded',
      });
      await pinAdAccount(page, PORTFOLIO_ACCOUNT_ID);
      await expect(page).toHaveURL(/optimizerView=create/);
      await expect(page.getByRole('heading', { name: 'Start from a suggestion' })).toBeVisible({
        timeout: 120_000,
      });
      await shoot(page, '12-deeplink-create');

      // Resolve the enrolled portfolio's real id THROUGH the UI (this spec pins portfolios by
      // name, not id): open it once and read the id the redesigned nav wrote into the URL.
      await openOptimizationTab(page, PORTFOLIO_ACCOUNT_ID);
      await page.getByRole('button').filter({ hasText: ENROLLED_PORTFOLIO_NAME }).first().click();
      await expect(page.getByRole('button', { name: 'Back to portfolios' })).toBeVisible({
        timeout: 120_000,
      });
      const enrolledId = new URL(page.url()).searchParams.get('portfolio');
      expect(
        enrolledId,
        'opening the enrolled portfolio must write its id into the URL',
      ).toBeTruthy();

      // (2) A cold load of portfolio=<id>&section=manage must open the workspace directly on
      // its Manage section — the deep-linked section is honored on first paint.
      await page.goto(`/scale?tab=performance&portfolio=${enrolledId}&section=manage`, {
        waitUntil: 'domcontentloaded',
      });
      await pinAdAccount(page, PORTFOLIO_ACCOUNT_ID);
      await expect(page.getByRole('button', { name: 'Back to portfolios' })).toBeVisible({
        timeout: 120_000,
      });
      await expect(page).toHaveURL(/section=manage/);
      await expect(page.getByText('Autonomy tier').first()).toBeVisible({ timeout: 120_000 });
      await shoot(page, '13-deeplink-manage');
    } finally {
      await context.close();
    }
  });

  // -------------------------------------------------------------------------
  // Activity — the two feeds that used to be one.
  //
  // Runs on EASYFIT_LEDGER_BRAND_ID because that is the brand production actually wrote to:
  // 38 budget writes in optimizer.apply_audits, 57 portfolio-setting edits, 11 recommendation
  // decisions. On the agency brand the action feed is legitimately EMPTY, and a green run
  // against an empty feed would prove nothing about it.
  //
  // READ-ONLY, consistent with the money-safety contract at the top of this file: it opens
  // the Activity sub-view, switches between its two feeds, and pages the action feed. It
  // never clicks Revert or Unpause — their triggers are asserted to EXIST, never pressed —
  // and the money-safety test at the end proves the ledger did not move.
  // -------------------------------------------------------------------------
  test('activity — Actions and the Server log are two separate feeds, not one merged stream', async ({
    browser,
  }) => {
    await selectBrand(EASYFIT_LEDGER_BRAND_ID);
    const { context } = await benchContext(browser);
    const page = await context.newPage();

    try {
      await openOptimizationTab(page, PORTFOLIO_ACCOUNT_ID);

      await page.getByRole('tab', { name: 'Activity' }).click();
      await expect(page).toHaveURL(/optimizerView=logs/);

      // The ACTION feed lands first — what we did to the ad account.
      const actionsToggle = page.getByRole('button', { name: 'Actions', exact: true });
      await expect(actionsToggle).toHaveAttribute('aria-pressed', 'true', { timeout: 120_000 });
      await expect(page.getByText('Nothing has changed yet')).toHaveCount(0, { timeout: 120_000 });

      // Every action row states WHAT changed, before → after. A budget row is labelled by the
      // field it moved, not by an event name.
      await expect(page.getByText('Daily budget').first()).toBeVisible({ timeout: 120_000 });

      // WHO: the RPC's actor_kind, rendered rather than left implicit.
      const actorLine = page.getByText(/· (Autopilot|Human|System)$/);
      await expect(actorLine.first()).toBeVisible();
      console.log(`[optimizer-bench] first action actor: "${await actorLine.first().innerText()}"`);

      // UNDO: this brand's 38 budget writes are all `reversible` in the RPC, so the feed MUST
      // offer at least one revert. The trigger is asserted, never clicked.
      const revertTriggers = page.getByRole('button', { name: /^(Revert|Unpause)$/ });
      const revertCount = await revertTriggers.count();
      console.log(`[optimizer-bench] revertible action rows on page 1: ${revertCount}`);
      expect(
        revertCount,
        'every production budget write on this brand is reversible — the feed must offer undo',
      ).toBeGreaterThan(0);

      // PAGINATION: 106 actions exist and one page is 50, so the footer must say there are
      // older ones — not present the loaded window as the whole world.
      const moreFooter = page.getByText(/\d+ actions loaded — there are older ones\./);
      await expect(moreFooter).toBeVisible({ timeout: 60_000 });
      const beforeText = await moreFooter.innerText();
      await page.getByRole('button', { name: 'Load more' }).click();
      await expect(
        page.getByText(/\d+ actions (loaded — there are older ones\.|— that is all of them\.)/),
      ).not.toHaveText(beforeText, { timeout: 60_000 });
      console.log(
        `[optimizer-bench] action feed footer after Load more: "${await page
          .getByText(/\d+ actions /)
          .first()
          .innerText()}"`,
      );

      await shoot(page, '14-activity-actions');

      // The SERVER LOG is the other half — lifecycle only, structured rather than a dump of
      // the first four keys of a fields bag.
      await page.getByRole('button', { name: 'Server log' }).click();
      await expect(page.getByRole('button', { name: 'Server log' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      const lifecycle = page
        .getByText('Cycle complete')
        .or(page.getByText('Cycle skipped'))
        .or(page.getByText('Roster drift'))
        .or(page.getByText('The optimizer has not run yet'));
      await expect(lifecycle.first()).toBeVisible({ timeout: 120_000 });

      // The split is load-bearing: an ad-account write must NOT appear in the server log.
      // 'Daily budget' is the action feed's own label for a budget move, and it was visible
      // on the other feed moments ago.
      await expect(page.getByText('Daily budget')).toHaveCount(0);
      // ...and undo lives with the action, never with the lifecycle row.
      await expect(page.getByRole('button', { name: /^(Revert|Unpause)$/ })).toHaveCount(0);
      await shoot(page, '15-activity-server-log');
    } finally {
      await context.close();
    }
  });

  test("portfolio CTAs — a read row's button lands on an expanded queue row, and the Jaina panel sits under the name line", async ({
    browser,
  }) => {
    await selectBrand(EASYFIT_LEDGER_BRAND_ID);
    const { context } = await benchContext(browser);
    const page = await context.newPage();

    /** The one queue row whose expander is open, once the CTA has switched to Activity. */
    const expandedQueueRow = () =>
      page
        .locator('li[data-row-key^="rec:"], li[data-row-key^="budget:"]')
        .filter({ has: page.locator('button[aria-expanded="true"]') });
    /** Runs in the page: is the node's top edge inside the panel that scrolls it? */
    const inScrollView = (node: Element) => {
      const box = node.getBoundingClientRect();
      const panel = node.closest('[role="tabpanel"]');
      const frame = panel ? panel.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      return box.top >= frame.top - 1 && box.top < frame.bottom;
    };
    /** The workspace's own Activity tab — the optimizer bar above it has a tab of the same
     *  name, so the tablist is picked by its sibling "Manage" first. */
    const workspaceActivityTab = () =>
      page
        .getByRole('tablist')
        .filter({ has: page.getByRole('tab', { name: 'Manage' }) })
        .getByRole('tab', { name: 'Activity' });

    try {
      await openOptimizationTab(page, PORTFOLIO_ACCOUNT_ID);

      // ── TOURS: the blocked, superseded audience proposal ──
      await page.getByRole('button').filter({ hasText: TOURS_PORTFOLIO_NAME }).first().click();
      await expect(
        page.getByRole('heading', { level: 2 }).filter({ hasText: TOURS_PORTFOLIO_NAME }),
      ).toBeVisible({ timeout: 120_000 });

      // The Jaina panel: the first block after the portfolio's name line, before the
      // sentences and the news cards, five prepared questions.
      const band = page.getByTestId('jaina-entry-chips');
      await expect(band).toBeVisible({ timeout: 120_000 });
      await expect(band.getByRole('link')).toHaveCount(5);
      // The name line and the band stand before the cycle read lands; the cards only after.
      // An order is only checkable once all three are on the page.
      await expect(page.getByTestId('portfolio-news-row')).toBeVisible({ timeout: 120_000 });
      const order = await page.evaluate(() => {
        const hero = document.querySelector('[data-testid="portfolio-hero"]');
        const pick = (id: string) => hero?.querySelector(`[data-testid="${id}"]`) ?? null;
        const header = pick('portfolio-header');
        const chips = pick('jaina-entry-chips');
        const news = pick('portfolio-news-row');
        if (!header || !chips || !news) return { header: !!header, chips: !!chips, news: !!news };
        const follows = (a: Element, b: Element) =>
          Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        return { headerBeforeChips: follows(header, chips), chipsBeforeNews: follows(chips, news) };
      });
      console.log(`[optimizer-bench] Jaina panel order: ${JSON.stringify(order)}`);
      expect(order).toEqual({ headerBeforeChips: true, chipsBeforeNews: true });
      await shoot(page, '16-tours-ask-jaina-band');

      // The asked-for rows and the queue live on the workspace's Activity section. The row
      // says what became of the proposal it opened — blocked, and why — instead of "being
      // built", and its button is the one this bench presses.
      await workspaceActivityTab().click();
      await expect(page).toHaveURL(/section=activity/);
      const askedRow = page
        .locator('[data-row-key^="read:asked:"]')
        .filter({ hasText: 'Open the audience proposal' })
        .first();
      await expect(askedRow).toBeVisible({ timeout: 120_000 });
      await expect(askedRow.getByText('Blocked', { exact: true })).toBeVisible();
      await expect(askedRow.getByText(/^Blocked — /)).toContainText('creative');
      await askedRow.getByRole('button', { name: 'Open the audience proposal' }).click();

      await expect(expandedQueueRow()).toHaveCount(1, { timeout: 120_000 });
      const landedKey = await expandedQueueRow().getAttribute('data-row-key');
      console.log(`[optimizer-bench] Tours "Open the audience proposal" landed on ${landedKey}`);
      expect(landedKey).toMatch(/^rec:[0-9a-f-]{36}$/);

      // Expanded AND on screen: the row's top edge inside the visible box of the panel that
      // scrolls it (the workspace tab panel clips; the window alone would not tell).
      await expect
        .poll(() => expandedQueueRow().evaluate(inScrollView), {
          message: 'the focused row must be scrolled into view',
          timeout: 15_000,
        })
        .toBe(true);

      // The blocked proposal's face: the reason, and the create button visibly off.
      const card = expandedQueueRow().getByTestId('audience-recommendation-card');
      await expect(card).toBeVisible();
      await expect(card.getByText('Bloqueada', { exact: true })).toBeVisible();
      await expect(card.getByTestId('audience-blocked-reason')).toContainText('creative');
      await expect(card.getByTestId('audience-create-blocked')).toBeDisabled();
      console.log(
        `[optimizer-bench] Tours blocked reason: "${await card
          .getByTestId('audience-blocked-reason')
          .innerText()}"`,
      );
      await shoot(page, '17-tours-blocked-proposal-row');

      // ── PRUEBA: the creative candidate's card → its pending recommendation row ──
      await page.getByRole('button', { name: 'Back to portfolios' }).click();
      await page.getByRole('button').filter({ hasText: PRUEBA_PORTFOLIO_NAME }).first().click();
      await expect(
        page.getByRole('heading', { level: 2 }).filter({ hasText: PRUEBA_PORTFOLIO_NAME }),
      ).toBeVisible({ timeout: 120_000 });
      const creativeCta = page
        .getByRole('button', { name: 'Open the creative recommendation' })
        .first();
      await expect(creativeCta).toBeVisible({ timeout: 120_000 });
      await creativeCta.click();

      await expect(page).toHaveURL(/section=activity/);
      await expect(expandedQueueRow()).toHaveCount(1, { timeout: 120_000 });
      const creativeKey = await expandedQueueRow().getAttribute('data-row-key');
      console.log(
        `[optimizer-bench] Prueba "Open the creative recommendation" landed on ${creativeKey}`,
      );
      expect(creativeKey).toMatch(/^rec:[0-9a-f-]{36}$/);
      await expect(expandedQueueRow().getByRole('button', { name: 'Hide detail' })).toBeVisible();
      // This section mounts fresh on the press, so the lists above the queue land AFTER the
      // first scroll; the row has to end up in view all the same.
      await expect
        .poll(() => expandedQueueRow().evaluate(inScrollView), {
          message: 'the focused creative row must be scrolled into view',
          timeout: 15_000,
        })
        .toBe(true);
      await shoot(page, '18-prueba-creative-row');
    } finally {
      await context.close();
    }
  });

  // -------------------------------------------------------------------------
  // The portfolio hero — Performance+ redesign, idea D (portafolio-unificado.html): one
  // module on the portfolio the redesign page is drawn with. Every assertion reads the
  // RENDERED page.
  // -------------------------------------------------------------------------
  test('portfolio hero — FORMULARIOS // TODOS opens on one module: name line, anchor number, two sentences, four tiles, the last cycle and Jaina’s bar, then the cards, with no full-width bar under it', async ({
    browser,
  }) => {
    await selectBrand(EASYFIT_LEDGER_BRAND_ID);
    const { context } = await benchContext(browser);
    const page = await context.newPage();

    try {
      await openOptimizationTab(page, PORTFOLIO_ACCOUNT_ID);
      await page
        .getByRole('button')
        .filter({ hasText: FORMULARIOS_PORTFOLIO_NAME })
        .first()
        .click();
      await expect(
        page.getByRole('heading', { level: 2 }).filter({ hasText: FORMULARIOS_PORTFOLIO_NAME }),
      ).toBeVisible({ timeout: 120_000 });
      await expect(page.getByTestId('headline-status')).toBeVisible({ timeout: 120_000 });
      await expect(page.getByTestId('portfolio-news-row')).toBeVisible({ timeout: 120_000 });
      // The strip reads the daily series, which lands after the cycle read; grade it once
      // it has data (it says so, rather than printing zeros, until then).
      await expect(page.getByTestId('portfolio-before-after')).not.toHaveAttribute(
        'data-source',
        'none',
        { timeout: 120_000 },
      );

      const report = await page.evaluate(() => {
        const hero = document.querySelector('[data-testid="portfolio-hero"]');
        const panel = hero?.closest('[role="tabpanel"]') ?? document.body;
        const pick = (id: string) => hero?.querySelector(`[data-testid="${id}"]`) ?? null;
        const follows = (a: Element | null, b: Element | null) =>
          Boolean(a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        const blocks = [
          'portfolio-header',
          'portfolio-anchor',
          'portfolio-headline',
          'portfolio-tiles',
          'portfolio-before-after',
          'portfolio-news-row',
        ];
        const nodes = blocks.map((id) => pick(id));
        const present = nodes.map((node) => node !== null);
        const ordered = nodes.every((node, i) => i === 0 || follows(nodes[i - 1] ?? null, node));
        const tiles = [
          ...(pick('portfolio-tiles')?.querySelectorAll('[data-testid^="tile-"]') ?? []),
        ];
        const jaina = pick('portfolio-jaina');
        const read = pick('portfolio-headline')?.querySelector('[data-testid="jaina-read"]');
        const heroRect = hero?.getBoundingClientRect() ?? { bottom: 0 };
        const panelRect = panel.getBoundingClientRect();
        // Every visible element under the hero painted with the success or destructive
        // background token, at half the panel's width or more: a full-width bar.
        const bars = [...panel.querySelectorAll('*')]
          .filter((el) =>
            /\bbg-(success|destructive)(\/\d+)?\b/.test(el.getAttribute('class') ?? ''),
          )
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return (
              rect.height > 0 &&
              rect.top >= heroRect.bottom - 1 &&
              rect.width >= panelRect.width * 0.5
            );
          })
          .map(
            (el) => `${Math.round(el.getBoundingClientRect().width)}px ${el.getAttribute('class')}`,
          );
        const more = panel.querySelector('[data-testid="portfolio-detail-more"]');
        const firstBodyBlock = hero?.nextElementSibling?.textContent ?? '';
        return {
          present,
          ordered,
          headerName: pick('portfolio-header')?.querySelector('h3')?.textContent ?? '',
          facts: [...(hero?.querySelectorAll('[data-testid="header-chip"]') ?? [])].map((chip) =>
            chip.getAttribute('data-setting'),
          ),
          oneSurface,
          anchorText: anchorFigure?.textContent ?? '',
          anchorPx: anchorFigure ? Number.parseFloat(getComputedStyle(anchorFigure).fontSize) : 0,
          anchorPrior: pick('anchor-prior')?.textContent ?? '',
          readInJainaBar: Boolean(jaina?.querySelector('[data-testid="jaina-read"]')),
          status: pick('headline-status')?.textContent ?? '',
          statusFigures:
          'portfolio-jaina',
            pick('headline-status')?.querySelectorAll('[data-testid="figure"]').length ?? 0,
          opportunity: pick('headline-opportunity')?.textContent ?? '',
          blocker: pick('headline-blocker')?.getAttribute('data-blocker') ?? null,
        // One surface: the module's own children draw no border; only the tiles' state
        // rule is allowed, and it lives a level down.
        const module = pick('portfolio-module');
        const bordered = (el: Element) => {
          const style = getComputedStyle(el);
          return ['Top', 'Right', 'Bottom', 'Left'].some(
            (side) =>
              Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0,
          );
        };
        const oneSurface =
          Boolean(module) && [...(module?.children ?? [])].every((child) => !bordered(child));
        const anchorFigure = pick('portfolio-anchor')?.querySelector('[data-figure-role="anchor"]');
          tiles: tiles.map((tile) => tile.getAttribute('data-testid')),
          tileStates: tiles.map((tile) => tile.getAttribute('data-state')),
          tileCharts: tiles.filter((tile) => tile.querySelector('svg, canvas')).length,
          readSource: read?.getAttribute('data-source') ?? null,
          readLabel: read?.querySelector('[data-testid="jaina-read-label"]')?.textContent ?? '',
          readSentence:
            read?.querySelector('[data-testid="jaina-read-sentence"]')?.textContent ?? '',
          askField: Boolean(
            jaina?.querySelector('form[data-testid="jaina-ask"] input[name="question"]'),
          ),
          jainaLinks: jaina?.querySelectorAll('[data-testid="jaina-entry-chips"] a').length ?? 0,
          cycleLine: pick('before-after-cycle')?.textContent ?? '',
          projection: pick('before-after-projection')?.textContent ?? null,
          vitals: Boolean(
            pick('portfolio-vitals') || panel.querySelector('[data-testid="vital-bullet"]'),
          ),
          bars,
          moreSummary:
            (more?.querySelector('summary') as HTMLElement | null)?.innerText?.trim() ?? '',
          moreOpen: more?.hasAttribute('open') ?? null,
          moreHolds: {
            funnel: more?.textContent?.includes('Conversion funnel') ?? false,
            reallocation: more?.textContent?.includes('Reallocation') ?? false,
          },
          firstBodyBlock: firstBodyBlock.slice(0, 80),
        };
      });
      console.log(`[optimizer-bench] FORMULARIOS hero: ${JSON.stringify(report)}`);

      // The module's blocks and the cards, all present, in this order, on one surface.
      expect(report.present).toEqual([true, true, true, true, true, true, true]);
      expect(report.ordered).toBe(true);
      expect(report.headerName).toBe(FORMULARIOS_PORTFOLIO_NAME);
      // Each setting beside the figure it governs: the grey line, the anchor, the spend tile.
      expect(report.facts).toEqual(['objective', 'strategy', 'window', 'target', 'budget']);

      // The anchor: the cost per result at 44px, and the two windows by their dates.
      expect(report.anchorText).toMatch(/^(\d[\d,]*(\.\d+)?|—)$/);
      expect(Math.round(report.anchorPx)).toBe(44);
      if (report.anchorText !== '—') expect(report.anchorPrior).toMatch(/\d+–\d+.*: /);

      // Two sentences with a figure; the third only when a blocker exists.
      expect(report.status).toMatch(/^\d[\d,]* leads en \d+ días/);
      expect(report.statusFigures).toBeGreaterThanOrEqual(2);
      expect(report.opportunity).toMatch(/\d/);
      expect(report.opportunity).toMatch(
        /^(La oportunidad:|Ninguna oportunidad|Sin oportunidades)/,
      );
      if (report.blocker) {
        expect(['kpi_mismatch', 'zero_delivery', 'no_signal']).toContain(report.blocker);
      }

      // Four tiles, each coloured by a state on its top border, never by a chart.
      expect(report.tiles).toEqual(['tile-spend', 'tile-results', 'tile-adsets', 'tile-decisions']);
      for (const state of report.tileStates) expect(['ok', 'warn', 'bad', 'none']).toContain(state);
      expect(report.tileCharts).toBe(0);

      // Jaina: her read only when a model wrote something the headline does not say, as one
      // attributed line under it; her bar at the module's foot holds the field and five
      // questions.
      expect([null, 'jaina']).toContain(report.readSource);
      if (report.readSource) expect(report.readLabel).toMatch(/^Jaina/);
      expect(report.readInJainaBar).toBe(false);
      expect(report.askField).toBe(true);
      expect(report.jainaLinks).toBe(5);

      // The last cycle in one line, the projection when a pause is pending.
      expect(report.cycleLine).toMatch(/^(Último ciclo, |Sin ciclo)/);
      if (report.projection) expect(report.projection).toMatch(/costo proyectado|no compraron/);

      // The vital signs and their bands are gone, and nothing under the hero is a bar.
      expect(report.vitals).toBe(false);
      expect(report.bars, 'full-width success/destructive bars under the hero').toEqual([]);

      expect(report.oneSurface).toBe(true);
      // The body: the ad-set ranking first; the funnel and the reallocation behind the
      // disclosure, closed.
      expect(report.firstBodyBlock).toContain('per ad set');
      expect(report.moreSummary).toBe('Ver detalle');
      expect(report.moreOpen).toBe(false);
      expect(report.moreHolds).toEqual({ funnel: true, reallocation: true });
      await shoot(page, '19-formularios-hero');

      // Opening the disclosure reveals the two panels — and still no bar at the width of
      // the panel: the ramps are per-row.
      await page.getByTestId('portfolio-detail-more').locator('> summary').click();
      await expect(page.getByText('Conversion funnel').first()).toBeVisible();
      await shoot(page, '20-formularios-ver-detalle');

      // The typed question deep-links into Jaina with the portfolio as context. The
      // navigation is caught before it reaches the app: nothing is asked of Jaina.
      let asked: string | null = null;
      await page.route('**/scale?tab=jaina*', async (route) => {
        asked = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<html><body>caught</body></html>',
        });
      });
      const field = page.getByTestId('jaina-ask').locator('input[name="question"]');
      await field.fill('¿Y si pauso el conjunto más caro?');
      await field.press('Enter');
      await expect.poll(() => asked, { timeout: 30_000 }).not.toBeNull();
      const prompt = new URL(asked as unknown as string).searchParams.get('prompt') ?? '';
      console.log(`[optimizer-bench] FORMULARIOS ask → ${prompt}`);
      expect(prompt).toContain(`"${FORMULARIOS_PORTFOLIO_NAME}"`);
      expect(prompt).toContain('¿Y si pauso el conjunto más caro?');
    } finally {
      await context.close();
    }
  });

  // -------------------------------------------------------------------------
  // Type scale — Performance+ redesign, stage 1a (optimizer/typeScale.ts).
  //
  // Five screens at two widths, and the assertions read the RENDERED page, not the source:
  // no micro class (text-3xs / text-2xs) anywhere on the surface, no HTML text below 12px,
  // every uppercase label at 12px, every HeroFigure at its role's size, and nothing inside
  // the optimizer panel pushed past its right edge unless a scroller owns it.
  // Screenshots: 16-type-scale-<screen>-<width>.png — look at them.
  // -------------------------------------------------------------------------
  test('overview — O1: the sentence, the sub-line, the Jaina band, the tiles, the cards and the rows, in that order and nothing else above the fold', async ({
    browser,
  }) => {
    await selectBrand(EASYFIT_LEDGER_BRAND_ID);
    const { context } = await benchContext(browser);
    const page = await context.newPage();

    // A read that fails at load is what turns a whole-account figure into a partial one, so
    // every non-2xx answer from the optimizer RPCs is printed with the run.
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/rest/v1/rpc/optimizer_') && response.status() >= 400) {
        console.log(`[optimizer-bench] RPC ${response.status()} ${new URL(url).pathname}`);
      }
    });

    try {
      await openOptimizationTab(page, PORTFOLIO_ACCOUNT_ID);

      // The sentence is composed once every portfolio's efficiency series has landed; until
      // then it says it is still reading, and that state must clear on a live account. A
      // read that failed says the figure is incomplete instead of printing a partial sum;
      // one retry is allowed here, because the failure it guards against is transient.
      const headline = page.getByTestId('overview-headline');
      await expect(headline).toBeVisible({ timeout: 120_000 });
      await expect(headline).not.toHaveAttribute('data-pending', 'true', { timeout: 120_000 });
      if ((await headline.getAttribute('data-incomplete')) === 'true') {
        console.log(`[optimizer-bench] incomplete read: ${await headline.textContent()}`);
        await page.getByTestId('overview-retry').click();
        await expect(headline).not.toHaveAttribute('data-incomplete', 'true', {
          timeout: 60_000,
        });
      }
      const sentence = (await headline.textContent()) ?? '';
      console.log(`[optimizer-bench] Overview sentence: ${sentence}`);
      expect(sentence).toMatch(/^La cuenta gastó .+ en 7 días/);
      expect(sentence).toMatch(/decisi(ón espera|ones esperan)\.$/);
      expect(sentence).toMatch(/\d/);

      const report = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="optimizer-overview"]');
        const ids = [...(root?.children ?? [])].map(
          (child) => child.getAttribute('data-testid') ?? `(${child.tagName.toLowerCase()})`,
        );
        const inner = (id: string) => root?.querySelector(`[data-testid="${id}"]`) ?? null;
        const follows = (a: Element | null, b: Element | null) =>
          Boolean(a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        const sequence = [
          'overview-headline',
          'overview-subline',
          'jaina-entry-chips',
          'account-tiles',
          'account-cards',
          'portfolio-rows',
        ]
          .map((id) => inner(id))
          .filter((node): node is Element => node !== null);
        const ordered = sequence.every(
          (node, i) => i === 0 || follows(sequence[i - 1] ?? null, node),
        );
        const tiles = [
          ...(inner('account-tiles')?.querySelectorAll('[data-testid^="tile-"]') ?? []),
        ];
        const tileStates = tiles.map((tile) => tile.getAttribute('data-state'));
        const tileBorders = tiles.map((tile) =>
          (tile.getAttribute('class') ?? '')
            .split(/\s+/)
            .filter((c) => /^border-t-[a-z]/.test(c))
            .join(' '),
        );
        const tileCharts = tiles.filter((tile) => tile.querySelector('svg, canvas')).length;
        const noTarget = tiles
          .filter((tile) => tile.getAttribute('data-testid')?.startsWith('tile-kind-'))
          .filter((tile) => !/objetivo \d/.test(tile.textContent ?? ''))
          .map((tile) => ({
            state: tile.getAttribute('data-state'),
            saysSinObjetivo: (tile.textContent ?? '').includes('sin objetivo'),
            saysSinResultado: (tile.textContent ?? '').includes('sin resultado'),
          }));
        const cards = [
          ...(inner('account-cards')?.querySelectorAll('[data-testid="account-card"]') ?? []),
        ];
        const rows = [
          ...(inner('portfolio-rows')?.querySelectorAll('[data-testid="portfolio-row"]') ?? []),
        ];
        const heroCharts = root?.querySelectorAll(
          '[data-testid="overview-hero"] svg, [data-testid="overview-hero"] canvas, [data-testid="account-cards"] svg.recharts-surface, [data-testid="account-cards"] canvas',
        ).length;
        const sortPressed = inner('portfolio-rows')
          ?.querySelector('[aria-pressed="true"], [data-pressed], [data-state="on"]')
          ?.textContent?.trim();
        return {
          ids,
          ordered,
          jainaLabel: inner('jaina-entry-chips')?.textContent?.includes('Preguntale a Jaina'),
          jainaLinks: inner('jaina-entry-chips')?.querySelectorAll('a').length ?? 0,
          tiles: tiles.length,
          tileStates,
          tileBorders,
          tileCharts,
          noTarget,
          cards: cards.length,
          leadFlags: cards.map((card) => card.getAttribute('data-lead')),
          rows: rows.length,
          rowStates: rows.map((row) => row.getAttribute('data-state')),
          heroCharts: heroCharts ?? 0,
          sortPressed,
          bookLine: inner('book-line')?.textContent ?? '',
        };
      });
      console.log(`[optimizer-bench] Overview O1: ${JSON.stringify(report)}`);

      // In this order and nothing else: the header line, the sentence block, the band, the
      // tiles, the cards (when a read has landed), the rows.
      const expectedIds = ['(div)', 'overview-hero', 'jaina-entry-chips', 'account-tiles'];
      if (report.ids.includes('overview-recommendations'))
        expectedIds.push('overview-recommendations');
      expectedIds.push('portfolio-rows');
      expect(report.ids).toEqual(expectedIds);
      expect(report.ordered).toBe(true);
      expect(report.jainaLabel).toBe(true);
      expect(report.jainaLinks).toBeGreaterThanOrEqual(4);

      // Four to six tiles, each coloured by a state on its top border and never by a chart.
      expect(report.tiles).toBeGreaterThanOrEqual(4);
      expect(report.tiles).toBeLessThanOrEqual(6);
      for (const state of report.tileStates) expect(['ok', 'warn', 'bad', 'none']).toContain(state);
      for (const border of report.tileBorders) {
        expect(border).toMatch(/^border-t-(success|warning|destructive|border)$/);
      }
      expect(report.tileCharts).toBe(0);
      expect(report.heroCharts).toBe(0);
      // A result kind with no target reads neutral and says so; one with no results says that.
      for (const tile of report.noTarget) {
        expect(tile.state).toBe('none');
        expect(tile.saysSinObjetivo || tile.saysSinResultado).toBe(true);
      }

      // The cards, when today's read carries any, lead with exactly one marked card.
      if (report.cards > 0) {
        expect(report.leadFlags[0]).toBe('true');
        expect(report.leadFlags.filter((flag) => flag === 'true')).toHaveLength(1);
      } else {
        console.log(
          '[optimizer-bench] UN-EXERCISED: no account read row today — no cards to grade',
        );
      }

      // Every portfolio in the book is one row, sorted by distance to target by default.
      const bookCount = Number.parseInt(/^(\d+)/.exec(report.bookLine)?.[1] ?? '0', 10);
      expect(report.rows).toBe(bookCount);
      expect(report.rows).toBeGreaterThan(0);
      for (const state of report.rowStates) expect(['ok', 'warn', 'bad', 'none']).toContain(state);
      expect(report.sortPressed).toBe('Distancia al objetivo');

      // The old surface is gone: none of its copy anywhere on the tab.
      const panelText = await page.evaluate(
        () =>
          (
            document.querySelector('[role="tabpanel"][data-state="active"]') ??
            document.querySelector('main') ??
            document.body
          ).textContent ?? '',
      );
      for (const gone of [
        'The auction moved',
        'Across the account',
        'checks could not run',
        'Spend by objective',
        'How sure',
        'Daily budget',
        'Spent yesterday',
      ]) {
        expect(panelText, `old copy still on screen: ${gone}`).not.toContain(gone);
      }
      await shoot(page, '17-overview-o1');
    } finally {
      await context.close();
    }
  });

  test('type scale — Overview, portfolio detail, Automations, Actions and Activity read at one scale with no overflow at 1280 and 390', async ({
    browser,
  }) => {
    test.setTimeout(900_000);
    await selectBrand(AGENCY_BRAND_ID);
    const { context } = await benchContext(browser);
    const page = await context.newPage();

    type ScreenReport = {
      micro: string[];
      small: string[];
      labels: string[];
      figures: string[];
      overflow: string[];
      panelWidth: number;
      panelScrollWidth: number;
    };

    const inspect = (): Promise<ScreenReport> =>
      page.evaluate(() => {
        const panel =
          document.querySelector('[role="tabpanel"][data-state="active"]') ??
          document.querySelector('main') ??
          document.body;
        const describe = (el: Element) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(/\s+/).slice(0, 6).join('.')} "${(el.textContent ?? '').trim().slice(0, 40)}"`;
        const inSvg = (el: Element) => el.closest('svg') !== null;
        const ownText = (el: Element) =>
          [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
        const px = (el: Element) => Number.parseFloat(getComputedStyle(el).fontSize);
        // The app runs a root font-size ladder (15px, 14.5px under 1536 wide, 13.5px and
        // 13px below), so the scale is measured in rem: `text-xs` is the 0.75rem floor at
        // every tier, and a label is on scale when it sits exactly on that step. The
        // figure roles are absolute pixel classes and stay measured in px.
        const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
        const rem = (el: Element) => px(el) / root;
        const FLOOR_REM = 0.75;
        const all = [...panel.querySelectorAll('*')].filter((el) => !inSvg(el));
        const micro = all
          .filter((el) => /\btext-[23]xs\b/.test(el.getAttribute('class') ?? ''))
          .map(describe);
        const small = all
          .filter((el) => ownText(el) && rem(el) < FLOOR_REM - 0.005)
          .map((el) => `${rem(el).toFixed(3)}rem ${describe(el)}`);
        const labels = all
          .filter((el) => ownText(el) && getComputedStyle(el).textTransform === 'uppercase')
          .filter((el) => Math.abs(rem(el) - FLOOR_REM) > 0.01)
          .map((el) => `${rem(el).toFixed(3)}rem ${describe(el)}`);
        const expectedFigure: Record<string, number> = {
          tile: 22,
          headline: 21,
          lead: 21,
          anchor: 44,
        };
        const figures = [...panel.querySelectorAll('[data-figure-role]')]
          .filter(
            (el) =>
              Math.round(px(el)) !== expectedFigure[el.getAttribute('data-figure-role') ?? ''],
          )
          .map((el) => `${px(el)}px ${el.getAttribute('data-figure-role')} ${describe(el)}`);
        const panelRect = panel.getBoundingClientRect();
        const scrolls = (el: Element | null): boolean => {
          for (let node = el; node && node !== panel; node = node.parentElement) {
            const { overflowX } = getComputedStyle(node);
            if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden')
              return true;
          }
          return false;
        };
        const overflow = all
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.right > panelRect.right + 2 && !scrolls(el.parentElement);
          })
          .map(
            (el) =>
              `${Math.round(el.getBoundingClientRect().right - panelRect.right)}px past ${describe(el)}`,
          );
        return {
          micro,
          small,
          labels,
          figures,
          overflow,
          panelWidth: Math.round(panel.clientWidth),
          panelScrollWidth: Math.round(panel.scrollWidth),
        };
      });

    const settle = async () => {
      await expect(page.getByRole('status').filter({ hasText: 'Loading optimizer' })).toHaveCount(
        0,
        {
          timeout: 120_000,
        },
      );
      await page.waitForTimeout(1_500);
    };

    const check = async (screen: string, width: number) => {
      await settle();
      const report = await inspect();
      await shoot(page, `16-type-scale-${screen}-${width}`);
      console.log(
        `[optimizer-bench] type scale ${screen}@${width}: panel ${report.panelWidth}px, scrollWidth ${report.panelScrollWidth}px, micro ${report.micro.length}, under-floor ${report.small.length}, off-scale labels ${report.labels.length}, off-scale figures ${report.figures.length}, overflow ${report.overflow.length}`,
      );
      // Name what is off before failing on it: a count alone sends the next person back to
      // the browser to find out which node.
      if (
        report.micro.length +
          report.small.length +
          report.labels.length +
          report.figures.length +
          report.overflow.length >
        0
      ) {
        console.log(
          `[optimizer-bench] type scale ${screen}@${width} offenders: ${JSON.stringify({
            micro: report.micro,
            small: report.small.slice(0, 60),
            labels: report.labels,
            figures: report.figures,
            overflow: report.overflow.slice(0, 20),
          })}`,
        );
      }
      expect(report.micro, `${screen}@${width}: micro classes`).toEqual([]);
      expect(report.small, `${screen}@${width}: text below the 0.75rem floor`).toEqual([]);
      expect(report.labels, `${screen}@${width}: uppercase labels off the 0.75rem step`).toEqual(
        [],
      );
      expect(report.figures, `${screen}@${width}: HeroFigure off its role size`).toEqual([]);
      expect(report.overflow, `${screen}@${width}: pushed past the panel edge`).toEqual([]);
      expect(
        report.panelScrollWidth,
        `${screen}@${width}: the optimizer panel scrolls sideways`,
      ).toBeLessThanOrEqual(report.panelWidth + 1);
    };

    try {
      // Resolve the enrolled portfolio's id once, through the UI, at desktop width.
      await page.setViewportSize({ width: 1280, height: 900 });
      await openOptimizationTab(page, PORTFOLIO_ACCOUNT_ID);
      await page.getByRole('button').filter({ hasText: ENROLLED_PORTFOLIO_NAME }).first().click();
      await expect(page.getByRole('button', { name: 'Back to portfolios' })).toBeVisible({
        timeout: 120_000,
      });
      const enrolledId = new URL(page.url()).searchParams.get('portfolio');
      expect(enrolledId, 'the enrolled portfolio must write its id into the URL').toBeTruthy();

      const screens: Array<[string, string]> = [
        ['overview', '/scale?tab=performance&optimizerView=overview'],
        ['portfolio', `/scale?tab=performance&portfolio=${enrolledId}`],
        ['automations', '/scale?tab=performance&optimizerView=automations'],
        ['actions', '/scale?tab=performance&optimizerView=actions'],
        ['activity', '/scale?tab=performance&optimizerView=logs'],
      ];

      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        for (const [screen, url] of screens) {
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await pinAdAccount(page, PORTFOLIO_ACCOUNT_ID);
          if (screen === 'portfolio') {
            await expect(page.getByRole('button', { name: 'Back to portfolios' })).toBeVisible({
              timeout: 120_000,
            });
          }
          await check(screen, width);
        }
      }
    } finally {
      await context.close();
    }
  });

  test('money safety — no ad-account write was made by this run', async () => {
    const after = await totalMoneyEvents();
    console.log(`[optimizer-bench] money-family actions AFTER (watched brands): ${after}`);
    expect(
      after,
      `money-family actions changed during a read/browse bench: ${moneyEventsBefore} → ${after}`,
    ).toBe(moneyEventsBefore);
  });
});
