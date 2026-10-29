import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type BrowserContext, expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { lastCompleteDays } from '../src/lib/paid-media/reportingWindow';
import { type MintedSession, mintSessionBundleForEmail, revokeBenchSession } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { benchBrowserChannel, loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// paid-widget-google:e2e:bench — the dashboard's Paid Media Performance widget on a Google
// account whose result basis is ambiguous, on the real page, on real data.
//
// A real Chrome drives this Frontend's dev server as a REAL member (magic link → verifyOtp → the
// @supabase/ssr cookie the app writes) against production Supabase and the deployed
// paid-media-reporting edge. The Google edge answers an account whose goals name no single
// result (leads AND purchases, or neither) with `metrics.cpa: null`, `comparison.cpa: null`,
// null trend cpa/conversions and `result_basis.unambiguous: false`; /api/paid-metrics used to
// 502 that as "Invalid response format from backend".
//
//   1. Premise, discovered at run time (never hard-coded): each known Google account
//      (Vivo 47 3710693645, Easy Fit 2026 5251780631, plus any on the member's active brand) is
//      read through /api/paid-metrics at account scope. Every read must be 200; an ambiguous
//      one must carry cpa null and keep result_basis.
//   2. The widget reads campaign scope, and the basis is per campaign, so the ambiguous
//      account's campaigns are read the same way until one is ambiguous.
//   3. That campaign is picked in the rendered widget (platform → account → campaign). The
//      widget's own /api/paid-metrics call is captured off the wire (200, cpa null, basis
//      kept), and the RENDERED DOM must show the CPA tile as "—" with "No single result
//      defined", spend in the account's currency, and no error state.
//
// ── READ-ONLY ON PRODUCTION ──
//   No brand switch is written: the widget is rendered on the brand the member's session
//   already resolves to. When the ambiguous account lives on another brand only, the rendered
//   hop is recorded SKIP by name. The only controls clicked are the widget's read selectors.
//   The member's brand preference is read before and after and must be unchanged. The minted
//   session is revoked at the end (auth.sessions row + the pin the app writes on first render).
//
// Usage: cd Continuum-Frontend && bunx playwright test --config playwright.paid-widget-google.config.ts
// ---------------------------------------------------------------------------

test.use(benchBrowserChannel());

const { serviceRoleKey, publishableKey } = loadProdSupabaseEnv();

const BENCH = 'paid-widget-google:e2e:bench';
const notes: string[] = [];
const recorder = createBenchRecorder(BENCH, notes);
const OUT_DIR = resolve(
  process.env.PAID_WIDGET_E2E_OUT_DIR ?? resolve(__dirname, '../test-results/paid-widget-google'),
);

const MEMBER_EMAIL = 'mercadotecniavivo@gmail.com';
/** Vivo 47 holds Google 3710693645; the member's active brand is read at run time. */
const VIVO47_BRAND_ID = '61b80f51-709a-4408-9f11-04142a286baa';
const NO_SINGLE_RESULT = 'No single result defined';
/** Campaign-scope probes per account: each is one live Google read through the edge. */
const CAMPAIGN_PROBE_CAP = 18;
/** Probes in flight at once — the Scale loader's own per-campaign concurrency. */
const PROBE_CONCURRENCY = 6;
/** A live Google read (six GAQL queries behind the edge) can outrun Playwright's 30s default. */
const ROUTE_TIMEOUT_MS = 150_000;

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ResultBasis = { rule?: string; bucket?: string | null; unambiguous?: boolean };
type MetricsBody = {
  error?: string;
  currency?: string | null;
  metrics?: { spend?: number; cpa?: number | null };
  result_basis?: ResultBasis;
};
type GoogleAccount = { brandId: string; accountId: string; name: string };
type Campaign = { id: string; name: string; status?: string };

let session: MintedSession;
let preferenceBefore: string | null = null;
const failedSteps: string[] = [];
const evidence: Record<string, unknown> = {};

function check(step: string, ok: boolean, detail: string): void {
  recorder.record(step, ok ? 'PASS' : 'FAIL', detail);
  if (!ok) failedSteps.push(`${step}: ${detail}`);
}

/** Production PostgREST under parallel benches answers "upstream request timeout" now and then;
 *  a read is retried on that, never a write (the bench makes none). */
async function retryRead<T extends { error: { message: string } | null }>(
  run: () => PromiseLike<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    const result = await run();
    if (
      !result.error ||
      attempt === 3 ||
      !/timeout|gateway|fetch failed/i.test(result.error.message)
    ) {
      return result;
    }
    notes.push(`transient read error (attempt ${attempt}): ${result.error.message}`);
  }
}

function memberClient(): SupabaseClient {
  return createClient(PROD_SUPABASE_URL, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
  });
}

async function readPreference(): Promise<string | null> {
  const { data, error } = await retryRead(() =>
    admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', session.userId)
      .maybeSingle(),
  );
  if (error) throw new Error(`preference read failed: ${error.message}`);
  return (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
}

async function googleAccountsOf(brandId: string): Promise<GoogleAccount[]> {
  const { data, error } = await retryRead(() =>
    memberClient().schema('plugin_mcp').rpc('list_brand_ad_accounts', { p_brand_id: brandId }),
  );
  if (error) throw new Error(`list_brand_ad_accounts(${brandId}): ${error.message}`);
  return ((data ?? []) as Array<{ platform: string; account_id: string; name: string | null }>)
    .filter((row) => row.platform === 'google_ads')
    .map((row) => ({ brandId, accountId: row.account_id, name: row.name ?? row.account_id }));
}

/** One read through the Frontend route, so its response-schema parse is in the loop. */
async function routeRead(
  context: BrowserContext,
  body: Record<string, unknown>,
): Promise<{ status: number; json: MetricsBody | null }> {
  const response = await context.request.post('/api/paid-metrics', {
    data: body,
    timeout: ROUTE_TIMEOUT_MS,
  });
  return {
    status: response.status(),
    json: (await response.json().catch(() => null)) as MetricsBody | null,
  };
}

const ambiguous = (json: MetricsBody | null) => json?.result_basis?.unambiguous === false;

test.describe('paid widget — Google ambiguous result basis, live', () => {
  test.beforeAll(async () => {
    mkdirSync(OUT_DIR, { recursive: true });
    session = await mintSessionBundleForEmail(MEMBER_EMAIL);
    preferenceBefore = await readPreference();
    notes.push(`${MEMBER_EMAIL}: user ${session.userId}, preference before ${preferenceBefore}`);
  });

  test.afterAll(async () => {
    try {
      if (!session) return;
      // The bench writes no preference. Other sessions of this shared member (parallel benches)
      // do, so a moved preference is reported, not attributed to this run.
      const after = await readPreference();
      recorder.record(
        'safety.preference-unchanged',
        after === preferenceBefore ? 'PASS' : 'WARN',
        after === preferenceBefore
          ? `before ${preferenceBefore}, after ${after}`
          : `before ${preferenceBefore}, after ${after} — moved by a concurrent session; this bench has no write path to it`,
      );
      const revoke = await revokeBenchSession(session.state, session.accessToken);
      check(
        'safety.session-revoked',
        revoke.revoked && revoke.pinsLeft === 0,
        `session ${revoke.sessionId} revoked=${revoke.revoked} pinsLeft=${revoke.pinsLeft} (${revoke.detail})`,
      );
    } finally {
      writeFileSync(
        resolve(OUT_DIR, 'evidence.json'),
        JSON.stringify({ notes, evidence }, null, 2),
      );
      recorder.print();
    }
    expect(failedSteps, 'graded assertions that failed (including safety)').toEqual([]);
  });

  test('reporting widget reads an ambiguous Google account without a 502', async ({ browser }) => {
    const context = await browser.newContext({ storageState: session.state });
    const page = await context.newPage();
    const range = lastCompleteDays(7);
    try {
      // First render: the app pins THIS session to the brand it resolves, so the brand read
      // below stays the page's even while other sessions of the member move their preference.
      await page.goto('/dashboard?view=paid', { waitUntil: 'domcontentloaded' });
      const widget = page.locator('[data-tour-id="dashboard-paid-metrics"]');
      await expect(widget).toBeVisible({ timeout: 180_000 });

      // The brand the page renders, as the page resolves it — never switched by the bench.
      const { data: activeBrand, error: activeError } = await retryRead(() =>
        memberClient().schema('brand_profiles').rpc('resolve_active_brand_for_session'),
      );
      if (activeError) throw new Error(`active brand read failed: ${activeError.message}`);
      notes.push(`session renders brand ${activeBrand}`);

      const accounts: GoogleAccount[] = [];
      for (const brandId of new Set([activeBrand as string, VIVO47_BRAND_ID])) {
        for (const account of await googleAccountsOf(brandId)) {
          if (!accounts.some((known) => known.accountId === account.accountId)) {
            accounts.push(account);
          }
        }
      }
      check(
        'premise.google-accounts',
        accounts.length > 0,
        accounts.map((a) => `${a.name} ${a.accountId} on ${a.brandId.slice(0, 8)}`).join('; '),
      );

      // 1 · every Google account, account scope, through the route.
      const verdicts: Array<GoogleAccount & { ambiguous: boolean }> = [];
      for (const account of accounts) {
        const read = await routeRead(context, {
          brandId: account.brandId,
          platform: 'google-ads',
          accountId: account.accountId,
          scope: 'account_overview',
          range,
        });
        const isAmbiguous = ambiguous(read.json);
        verdicts.push({ ...account, ambiguous: isAmbiguous });
        evidence[`account_overview.${account.accountId}`] = {
          status: read.status,
          result_basis: read.json?.result_basis ?? null,
          cpa: read.json?.metrics?.cpa,
          currency: read.json?.currency ?? null,
          error: read.json?.error,
        };
        check(
          `route.${account.accountId}.account-overview-200`,
          read.status === 200,
          `HTTP ${read.status} ${read.status === 200 ? '' : JSON.stringify(read.json)}`.trim(),
        );
        if (isAmbiguous) {
          check(
            `route.${account.accountId}.cpa-null`,
            read.json?.metrics?.cpa === null,
            `ambiguous basis ${JSON.stringify(read.json?.result_basis)}; metrics.cpa ${JSON.stringify(read.json?.metrics?.cpa)}`,
          );
        } else {
          notes.push(
            `${account.name} ${account.accountId}: account basis ${JSON.stringify(read.json?.result_basis ?? null)}, cpa ${read.json?.metrics?.cpa}`,
          );
        }
      }

      // 2 · the widget reads per campaign: find an ambiguous campaign on an account the page
      //     can render (the active brand's).
      let target: { account: GoogleAccount; campaign: Campaign } | null = null;
      const renderable = verdicts.filter((v) => v.brandId === activeBrand);
      for (const account of [...renderable.filter((v) => v.ambiguous), ...renderable]) {
        if (target) break;
        const listed = await context.request.get(
          `/api/campaigns?brandId=${encodeURIComponent(account.brandId)}&adAccountId=${encodeURIComponent(account.accountId)}&platform=google-ads`,
          {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            timeout: ROUTE_TIMEOUT_MS,
          },
        );
        const campaigns = (((await listed.json().catch(() => null)) as { campaigns?: Campaign[] })
          ?.campaigns ?? []) as Campaign[];
        notes.push(
          `${account.name}: /api/campaigns HTTP ${listed.status()}, ${campaigns.length} campaigns`,
        );
        const probes = campaigns.slice(0, CAMPAIGN_PROBE_CAP);
        for (let start = 0; start < probes.length && !target; start += PROBE_CONCURRENCY) {
          const batch = probes.slice(start, start + PROBE_CONCURRENCY);
          const reads = await Promise.all(
            batch.map((campaign) =>
              routeRead(context, {
                brandId: account.brandId,
                platform: 'google-ads',
                accountId: account.accountId,
                campaignId: campaign.id,
                range,
              }),
            ),
          );
          for (const [index, campaign] of batch.entries()) {
            const read = reads[index];
            if (read.status === 502) {
              // The shape-check failure this bench exists for.
              check(
                `route.${account.accountId}.campaign-${campaign.id}-not-502`,
                false,
                `HTTP 502 ${JSON.stringify(read.json)}`,
              );
            } else if (read.status !== 200) {
              // The edge itself answered non-2xx (the route's 500 branch): an edge/Google read
              // failure, not the response-shape check. Reported, not graded as this fix.
              recorder.record(
                `route.${account.accountId}.campaign-${campaign.id}-edge-error`,
                'WARN',
                `HTTP ${read.status} ${JSON.stringify(read.json)}`,
              );
            } else if (!target && ambiguous(read.json)) {
              target = { account, campaign };
            }
          }
          notes.push(
            `${account.name}: campaigns ${batch.map((c, i) => `${c.id}=${reads[i].status}/${ambiguous(reads[i].json) ? 'ambiguous' : (reads[i].json?.result_basis?.bucket ?? 'no-basis')}`).join(', ')}`,
          );
        }
      }

      if (!target) {
        const elsewhere = verdicts.filter((v) => v.ambiguous && v.brandId !== activeBrand);
        recorder.record(
          'widget.renders-dash-with-reason',
          'SKIP',
          elsewhere.length > 0
            ? `the ambiguous account(s) ${elsewhere.map((v) => v.accountId).join(', ')} live on a brand the session does not render, and the bench writes no brand switch`
            : 'no ambiguous Google campaign on the rendered brand in this window — the branch did not occur',
        );
        return;
      }
      const { account, campaign } = target;
      notes.push(
        `rendering ${account.name} ${account.accountId} campaign "${campaign.name}" ${campaign.id}`,
      );

      // 3 · the rendered widget, its own wire read, its DOM.
      const wire: Array<{ status: number; body: MetricsBody | null }> = [];
      page.on('response', async (response) => {
        if (!response.url().endsWith('/api/paid-metrics')) return;
        const sent = response.request().postDataJSON() as {
          platform?: string;
          accountId?: string;
          campaignId?: string;
        } | null;
        if (
          sent?.platform !== 'google-ads' ||
          sent.accountId !== account.accountId ||
          sent.campaignId !== campaign.id
        ) {
          return;
        }
        wire.push({
          status: response.status(),
          body: (await response.json().catch(() => null)) as MetricsBody | null,
        });
      });

      const triggers = widget.locator('[data-slot="select-trigger"]');
      await expect(triggers.nth(0)).toBeEnabled({ timeout: 120_000 });

      await triggers.nth(0).click();
      await page.getByRole('option', { name: 'Google Ads', exact: true }).click();
      // The trigger prints the raw value ("google-ads"): the widget's SelectValue has no items.
      await expect(triggers.nth(0)).toContainText(/Google Ads|google-ads/);

      const googleCampaigns = page.waitForResponse(
        (response) =>
          response.url().includes('/api/campaigns?') &&
          response.url().includes(`adAccountId=${encodeURIComponent(account.accountId)}`) &&
          response.url().includes('platform=google-ads'),
        { timeout: ROUTE_TIMEOUT_MS },
      );
      await expect(triggers.nth(2)).toBeEnabled({ timeout: 60_000 });
      await triggers.nth(2).click();
      const accountOptions = page.getByRole('option');
      const byName = accountOptions.filter({ hasText: account.name });
      await ((await byName.count()) > 0 ? byName.first() : accountOptions.first()).click();
      check(
        'widget.google-campaigns-listed',
        (await googleCampaigns).status() === 200,
        `widget /api/campaigns for ${account.accountId}`,
      );

      await expect(triggers.nth(3)).toBeEnabled({ timeout: 60_000 });
      await triggers.nth(3).click();
      await page.getByRole('option', { name: campaign.name, exact: true }).click();

      await expect.poll(() => wire.length, { timeout: 180_000 }).toBeGreaterThan(0);
      const read = wire[wire.length - 1];
      evidence.widget_wire = {
        account: account.accountId,
        campaign: campaign.id,
        status: read.status,
        cpa: read.body?.metrics?.cpa,
        result_basis: read.body?.result_basis ?? null,
        currency: read.body?.currency ?? null,
      };
      check(
        'widget.wire-200-not-502',
        read.status === 200,
        `widget /api/paid-metrics HTTP ${read.status}${read.status === 200 ? '' : ` ${JSON.stringify(read.body)}`}`,
      );
      check(
        'widget.wire-cpa-null-basis-kept',
        read.body?.metrics?.cpa === null && read.body?.result_basis?.unambiguous === false,
        `metrics.cpa ${JSON.stringify(read.body?.metrics?.cpa)}, result_basis ${JSON.stringify(read.body?.result_basis)}`,
      );

      const tile = widget.locator('[data-testid="paid-widget-cpa"]');
      await expect(tile).toBeVisible({ timeout: 60_000 });
      const tileText = ((await tile.innerText()) ?? '').replace(/\s+/g, ' ').trim();
      check(
        'widget.renders-dash-with-reason',
        tileText.includes('—') && tileText.includes(NO_SINGLE_RESULT) && !/\d/.test(tileText),
        `CPA tile reads "${tileText}" (title "${await tile.getAttribute('title')}")`,
      );
      const errors = await widget
        .getByText(/Failed to fetch metrics|Invalid response format/)
        .count();
      check('widget.no-error-state', errors === 0, `${errors} error line(s) in the widget`);
      const spend = widget.locator('[data-figure="home.widget.spend"]');
      const spendText = (await spend.innerText()).trim();
      const currency = read.body?.currency ?? null;
      check(
        'widget.spend-in-account-currency',
        currency ? spendText.endsWith(` ${currency}`) : !spendText.includes('$'),
        `spend reads "${spendText}" for payload currency ${currency}`,
      );
      await page.screenshot({ path: resolve(OUT_DIR, 'paid-widget-google.png'), fullPage: true });
      await widget.screenshot({ path: resolve(OUT_DIR, 'paid-widget-google-widget.png') });
    } finally {
      await context.close();
    }
    expect(failedSteps, 'graded assertions that failed').toEqual([]);
  });
});
