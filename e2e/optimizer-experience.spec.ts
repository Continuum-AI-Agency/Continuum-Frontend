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
//   * Money-family log events (apply_* / convert_*) are counted for BOTH brands before
//     and after, through the `optimizer_list_logs` RPC. NOT through
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
// Production carries TWO duplicate "Easy Fit" brand rows. The AGENCY row below is the one
// that owns the live portfolios; the client row (6f597f42…, mkt@easyfit.mx) surfaces the
// same ad account but owns none, and is deliberately not used.
const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
const AGENCY_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
const VIVO47_BRAND_ID = '61b80f51-709a-4408-9f11-04142a286baa';

/** Owns both live portfolios and 64 live ad sets. */
const PORTFOLIO_ACCOUNT_ID = '521903353286118';
const PORTFOLIO_ACCOUNT_LABEL = 'Easyfit';
/** Assigned to the same brand, owns NO portfolios — the cross-account notice's trigger. */
const EMPTY_ACCOUNT_ID = '1296885445611472';
/** All CBO: 4 campaigns, every ad set held `unsupported_budget`, nothing optimizable. */
const CBO_ACCOUNT_ID = '1164707387246066';

const ENROLLED_PORTFOLIO_NAME = 'Mensajes Julio 2026';
const EMPTY_PORTFOLIO_NAME = 'Leads test';

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

/** Money-family optimizer log events for a brand. Every budget write logs `apply_executed`
 *  and every convert logs its own `convert_*` event, so a money move cannot happen without
 *  a row appearing here. */
async function moneyEventCount(brandId: string): Promise<number> {
  const { data, error } = await admin.rpc('optimizer_list_logs', {
    p_brand_id: brandId,
    p_limit: 500,
  });
  if (error) throw new Error(`[optimizer-bench] optimizer_list_logs unreachable: ${error.message}`);
  const rows = Array.isArray(data) ? (data as Array<{ event?: unknown }>) : [];
  return rows.filter((row) => typeof row.event === 'string' && /^(apply_|convert_)/.test(row.event))
    .length;
}

async function totalMoneyEvents(): Promise<number> {
  const counts = await Promise.all(
    [AGENCY_BRAND_ID, VIVO47_BRAND_ID].map((brandId) => moneyEventCount(brandId)),
  );
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

/** Loads the Scale page's Optimization tab and pins the ad account through the real
 *  account picker, then waits for the optimizer surface to settle out of its skeleton. */
async function openOptimizationTab(page: Page, accountId: string): Promise<void> {
  await page.goto('/scale?tab=performance', { waitUntil: 'domcontentloaded' });

  const accountPicker = page.getByRole('combobox').first();
  await expect(accountPicker).toBeEnabled({ timeout: 180_000 });
  await accountPicker.click();
  await page.getByPlaceholder('Search ad accounts...').fill(accountId);
  await page.getByRole('option').filter({ hasText: accountId }).first().click();

  await expect(page.getByRole('status').filter({ hasText: 'Loading optimizer' })).toHaveCount(0, {
    timeout: 120_000,
  });
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
      `[optimizer-bench] money-family log events BEFORE (both brands): ${moneyEventsBefore}`,
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
      await expect(
        page.getByText(/This brand has 2 portfolios on\s+another ad account/),
      ).toBeVisible();
      // …and it names the account that owns them, with the one-click switch.
      await expect(page.getByText(PORTFOLIO_ACCOUNT_LABEL, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Switch' })).toBeVisible();
      await shoot(page, '03-other-account-notice');

      // The browse control must actually reach the portfolios.
      await page.getByRole('button', { name: /Browse all 2 portfolios/ }).click();
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

      // This brand owns no portfolios, so onboarding IS the correct surface here.
      await expect(page.getByRole('heading', { name: 'Set up the Optimizer' })).toBeVisible({
        timeout: 120_000,
      });

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

  test('money safety — no money-family event was logged by this run', async () => {
    const after = await totalMoneyEvents();
    console.log(`[optimizer-bench] money-family log events AFTER (both brands): ${after}`);
    expect(
      after,
      `money-family (apply_*/convert_*) events changed during a read/browse bench: ${moneyEventsBefore} → ${after}`,
    ).toBe(moneyEventsBefore);
  });
});
