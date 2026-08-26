import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  mintAccessTokenForEmail,
  mintSessionForEmail,
  type PlaywrightStorageState,
} from './support/auth';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

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

test.use({ channel: 'chrome' });

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
  const newPortfolio = page.getByRole('button', { name: 'New portfolio' });
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
      // Its cycle data, rendered: the portfolio metric strip and the reallocation panel.
      await expect(page.getByText('Daily budget').first()).toBeVisible();
      await expect(page.getByText('Reallocation').first()).toBeVisible({ timeout: 120_000 });
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

  test('create view — the New portfolio action opens the create page state, and Back returns to Portfolios', async ({
    browser,
  }) => {
    await selectBrand(AGENCY_BRAND_ID);
    const { context } = await benchContext(browser);
    const page = await context.newPage();

    try {
      await openOptimizationTab(page, PORTFOLIO_ACCOUNT_ID);

      // The Overview carries the primary "New portfolio" action → the dedicated create page
      // state (NOT a sheet overlay). Render-only: the Create/Preview controls are never clicked.
      await page.getByRole('button', { name: 'New portfolio' }).click();
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
      // Performance is the default inner section — its Reallocation panel is showing.
      await expect(page.getByText('Reallocation').first()).toBeVisible({ timeout: 120_000 });

      await page.getByRole('tab', { name: 'Manage' }).click();
      await expect(page).toHaveURL(/section=manage/);
      // Manage controls render. Save/Archive are NEVER clicked.
      await expect(page.getByText('Autonomy tier')).toBeVisible();
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

      // Performance restores the reallocation instrument (and the section param drops).
      await page.getByRole('tab', { name: 'Performance' }).click();
      await expect(page.getByText('Reallocation').first()).toBeVisible();
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
      await expect(page.getByText('Autonomy tier')).toBeVisible({ timeout: 120_000 });
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
      console.log(`[optimizer-bench] action feed footer after Load more: "${await page.getByText(/\d+ actions /).first().innerText()}"`);

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

  test('money safety — no ad-account write was made by this run', async () => {
    const after = await totalMoneyEvents();
    console.log(`[optimizer-bench] money-family actions AFTER (watched brands): ${after}`);
    expect(
      after,
      `money-family actions changed during a read/browse bench: ${moneyEventsBefore} → ${after}`,
    ).toBe(moneyEventsBefore);
  });
});
