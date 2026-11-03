import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  HOME_MODULE_LABELS,
  type HomeBrandReading,
  readBrand,
} from '../packages/contracts/src/home/brandReading';
import {
  HOME_OBJECTIVE_METRICS,
  type HomeObjective,
  type HomeObjectiveMetric,
  homeProfileRowSchema,
  inferHomeObjectives,
} from '../packages/contracts/src/home/objectives';
import { formatCount, formatMoney } from '../src/components/dashboard/overview/format';
import {
  type AccountBuckets,
  accountCountsFrom,
  businessFrom,
  portfolioSignalsFrom,
  savedGoalFrom,
} from '../src/lib/home/brandSignals';
import { lastCompleteDays } from '../src/lib/paid-media/reportingWindow';
import {
  type MintedSession,
  mintSessionBundleForEmail,
  type PlaywrightStorageState,
  pinSessionBrand,
  revokeBenchSession,
} from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// home:overview:e2e:bench — the Home overview, end to end, on two real brands.
//
// A real Chrome drives the real Frontend as a real member of each brand (magic link → verifyOtp
// → the @supabase/ssr cookie the app writes), against production Supabase and the deployed
// paid-media-reporting edge. Every assertion is on RENDERED DOM, checked against figures this
// bench reads independently from the same edge, as the same member.
//
//   · Easy Fit — eighteen Meta ad accounts and a Google Ads customer.
//   · Pink Elephant — Google Ads only (PP-DT-E-home-google-results-absent: its Home said "Connect
//     a Meta ad account to see paid results and goals here").
//
// What it proves, per brand:
//   1. /dashboard opens on the Overview.
//   2. The goal tiles are the ones the profile names, or the ones inferred from the brand's
//      results, and each prints the figure the edge returns for the seven complete days ending
//      yesterday — summed over every ad account the Home reads, Meta and Google. Google counts one
//      business result per read (`resultBucket`), so each Google customer is read once for leads
//      and once for purchases.
//   3. Performance +, Organic + and Creative + render without an error state.
//   4. The reading strip says how the Home reads the brand, and the modules follow its order.
// And for the Google-only brand: no line asks for a Meta ad account, Performance + ranks the
// Google campaigns the edge ranks for the main goal, and Creative + says why it ranks no Google ad.
//
// It reads only. The writes are bench plumbing, each put back: Easy Fit's member's active-brand
// preference (restored), Pink's session brand pin (deleted with its session), and both sessions
// (revoked, proven by a refused refresh). It never saves a goal; the save path is reported as
// un-exercised by name.
// ---------------------------------------------------------------------------

const { serviceRoleKey, publishableKey } = loadProdSupabaseEnv();
const MEMBER_EMAIL = 'mercadotecniavivo@gmail.com';
const EASYFIT_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
/** Pink Elephant's members are the client, two agency operators and Ramiro's fallback bench
 *  identity (scripts/_bench/pausedWrites.ts BENCH_FALLBACK_EMAIL). */
const PINK_MEMBER_EMAIL = 'ramibuisel@gmail.com';
const PINK_BRAND_ID = '8e5b7185-e43f-4150-b763-b86c4f5297a0';

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const notes: string[] = [];
const recorder = createBenchRecorder('home:overview:e2e:bench', notes);

let storageState: PlaywrightStorageState;
let memberToken: string;
let memberId: string;
let originalBrand: string | null = null;

function clientFor(token: string): SupabaseClient {
  return createClient(PROD_SUPABASE_URL, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function memberClient(): SupabaseClient {
  return clientFor(memberToken);
}

function subjectOf(token: string): string {
  const payload = token.split('.')[1] ?? '';
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
  };
  if (!decoded.sub) throw new Error('[home-bench] access token carries no sub claim');
  return decoded.sub;
}

async function selectBrand(brandId: string): Promise<void> {
  const client = memberClient();
  const { error } = await client
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert(
      { user_id: memberId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[home-bench] brand switch failed: ${error.message}`);
  const { data } = await client.schema('brand_profiles').rpc('resolve_active_brand_for_session');
  expect(data, `the bench session must render brand ${brandId}`).toBe(brandId);
}

type HomeAccount = { id: string; platform: 'meta' | 'google_ads' };

/** The ad accounts the Home reads for a brand, from the member's own summary read: its Meta ad
 *  accounts and Google Ads customers — never a Google Ads manager (MCC) — each once. */
async function readHomeAccounts(client: SupabaseClient, brandId: string): Promise<HomeAccount[]> {
  const { data, error } = await client
    .schema('brand_profiles')
    .rpc('get_brand_integration_summary', { p_brand_profile_id: brandId });
  if (error) throw new Error(`[home-bench] integration summary failed: ${error.message}`);
  const accounts: HomeAccount[] = [];
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const id = (row.external_account_id as string | null) ?? null;
    if (!id || accounts.some((account) => account.id === id)) continue;
    if (row.platform_key === 'facebook' && row.account_type === 'meta_ad_account') {
      accounts.push({ id, platform: 'meta' });
    } else if (row.platform_key === 'googleAds' && row.account_status !== 'manager') {
      accounts.push({ id, platform: 'google_ads' });
    }
  }
  return accounts;
}

type EdgeRead = {
  currency?: string | null;
  metrics?: Record<string, number | null | undefined>;
  comparison?: Record<string, { previous?: number | null } | null>;
  trends?: { conversions?: number | null }[];
};

async function readOverview(
  client: SupabaseClient,
  brandId: string,
  account: HomeAccount,
  resultBucket?: 'leads' | 'purchases',
): Promise<EdgeRead> {
  const { data, error } = await client.functions.invoke('paid-media-reporting/metrics', {
    method: 'POST',
    body: {
      platform: account.platform === 'meta' ? 'meta' : 'google-ads',
      brandId,
      adAccountId: account.id,
      scope: 'account_overview',
      // The window the Home asks for (useHomeOverviewData's homeRange): the seven complete days
      // ending yesterday. The edge's own last_7d also counts today's half-written day.
      range: lastCompleteDays(7),
      ...(resultBucket ? { resultBucket } : {}),
    },
  });
  if (error)
    throw new Error(`[home-bench] ${account.id} account_overview failed: ${error.message}`);
  return (data ?? {}) as EdgeRead;
}

const sumOf = (values: (number | null | undefined)[]): number =>
  values.reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);

type Figures = Partial<Record<HomeObjectiveMetric, number>>;
type AccountFigures = { currency: string | null; spent: boolean; figures: Figures };

/** Whether the account spent in the window or the one before: an account that spent in neither
 *  has nothing for the Home to show. */
const spentIn = (read: EdgeRead): boolean =>
  Number(read.metrics?.spend ?? 0) > 0 || Number(read.comparison?.spend?.previous ?? 0) > 0;

/** One account's figures in the Home's words. Meta names its results; a Google read counts the
 *  one business result it was asked for, day by day, as `conversions`. */
async function readAccountFigures(
  client: SupabaseClient,
  brandId: string,
  account: HomeAccount,
): Promise<AccountFigures> {
  if (account.platform === 'meta') {
    const read = await readOverview(client, brandId, account);
    const metrics = read.metrics ?? {};
    const figures: Figures = {};
    for (const metric of Object.keys(HOME_OBJECTIVE_METRICS) as HomeObjectiveMetric[]) {
      const value = metrics[metric];
      if (typeof value === 'number') figures[metric] = value;
    }
    return { currency: read.currency ?? null, spent: spentIn(read), figures };
  }
  const [leads, purchases] = await Promise.all([
    readOverview(client, brandId, account, 'leads'),
    readOverview(client, brandId, account, 'purchases'),
  ]);
  const metrics = leads.metrics ?? {};
  return {
    currency: leads.currency ?? null,
    spent: spentIn(leads),
    figures: {
      spend: Number(metrics.spend ?? 0),
      clicks: Number(metrics.clicks ?? 0),
      impressions: Number(metrics.impressions ?? 0),
      leads: sumOf((leads.trends ?? []).map((day) => day.conversions)),
      purchases: sumOf((purchases.trends ?? []).map((day) => day.conversions)),
      purchase_value: Number(purchases.metrics?.roas ?? 0) * Number(purchases.metrics?.spend ?? 0),
    },
  };
}

type CurrencyFigures = {
  currency: string | null;
  accounts: number;
  spending: number;
  totals: Figures;
};

/** Sums a metric only over the accounts that report it, as the Home sums it. */
function sumFigures(list: Figures[]): Figures {
  const totals: Figures = {};
  for (const metric of Object.keys(HOME_OBJECTIVE_METRICS) as HomeObjectiveMetric[]) {
    const values = list.map((figures) => figures[metric]).filter((v) => v !== undefined);
    if (values.length > 0) totals[metric] = sumOf(values);
  }
  return totals;
}

/**
 * What the Home should print, from every account it reads, read as the member. Money is never
 * added across currencies, so the accounts are grouped by currency and the Home leads with the
 * currency its spending accounts report in (then the one most accounts do; then the first). A
 * currency where no account spent in either week has no strip of its own. Results are counted
 * across currencies for the goal inference; money comes from the lead currency only. An account
 * whose read fails is left out, as the Home leaves it out, and named in the notes.
 */
async function readEdgeTotals(
  client: SupabaseClient,
  brandId: string,
): Promise<{
  lead: CurrencyFigures;
  idle: CurrencyFigures[];
  results: Figures;
  accounts: HomeAccount[];
}> {
  const accounts = await readHomeAccounts(client, brandId);
  const settled = await Promise.allSettled(
    accounts.map((account) => readAccountFigures(client, brandId, account)),
  );
  const perAccount = settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const failed = accounts.filter((_, index) => settled[index]?.status === 'rejected');
  if (failed.length > 0) {
    notes.push(
      `${brandId}: ${failed.length} account(s) did not answer and are left out, as the Home leaves them out: ${failed.map((account) => account.id).join(', ')}`,
    );
  }
  expect(perAccount.length, 'at least one account answered').toBeGreaterThan(0);
  const byCurrency = new Map<string | null, AccountFigures[]>();
  for (const account of perAccount) {
    byCurrency.set(account.currency, [...(byCurrency.get(account.currency) ?? []), account]);
  }
  const groups = [...byCurrency.entries()]
    .map(([currency, list], order) => ({
      order,
      currency,
      accounts: list.length,
      spending: list.filter((account) => account.spent).length,
      totals: sumFigures(list.map((account) => account.figures)),
    }))
    .sort((a, b) => b.spending - a.spending || b.accounts - a.accounts || a.order - b.order);
  const [lead, ...rest] = groups;
  if (!lead) throw new Error('[home-bench] no currency group');
  const results: Figures = {};
  for (const metric of Object.keys(HOME_OBJECTIVE_METRICS) as HomeObjectiveMetric[]) {
    if (HOME_OBJECTIVE_METRICS[metric].unit === 'currency') {
      if (lead.totals[metric] !== undefined) results[metric] = lead.totals[metric];
      continue;
    }
    const values = groups.map((group) => group.totals[metric]).filter((v) => v !== undefined);
    if (values.length > 0) results[metric] = sumOf(values);
  }
  return {
    lead,
    idle: rest.filter((group) => group.spending === 0),
    results,
    accounts,
  };
}

async function readSavedObjectives(brandId: string): Promise<{
  tableLive: boolean;
  objectives: HomeObjective[] | null;
}> {
  const { data, error } = await admin
    .schema('brand_profiles')
    .from('home_profiles')
    .select('brand_id, scope, objectives, source, updated_at')
    .eq('brand_id', brandId)
    .eq('scope', 'brand')
    .maybeSingle();
  if (error) return { tableLive: false, objectives: null };
  const parsed = data ? homeProfileRowSchema.safeParse(data) : null;
  return { tableLive: true, objectives: parsed?.success ? parsed.data.objectives : null };
}

/** The brand's reading, from reads this bench makes itself as the member. */
async function readExpectedReading(
  client: SupabaseClient,
  brandId: string,
): Promise<HomeBrandReading> {
  const [summary, portfolios, book, brand, profiles] = await Promise.all([
    client
      .schema('brand_profiles')
      .rpc('get_brand_integration_summary', { p_brand_profile_id: brandId }),
    client.rpc('optimizer_list_portfolios', { p_brand_id: brandId }),
    client
      .schema('brand_profiles')
      .from('brand_book')
      .select(
        'business:assembled->report->composite->structured->business, headline:assembled->report->composite->first_impression->headline',
      )
      .eq('brand_id', brandId)
      .maybeSingle(),
    client
      .schema('brand_profiles')
      .from('brand_profiles')
      .select('description, approval_chain_required')
      .eq('id', brandId)
      .maybeSingle(),
    readSavedObjectives(brandId),
  ]);
  for (const read of [summary, portfolios, book, brand]) {
    if (read.error) throw new Error(`[home-bench] reading input failed: ${read.error.message}`);
  }
  const buckets: AccountBuckets = {};
  for (const row of (summary.data ?? []) as Record<string, unknown>[]) {
    const key = row.platform_key as keyof AccountBuckets | null;
    if (!key) continue;
    const bucket = buckets[key] ?? { accounts: [] };
    buckets[key] = bucket;
    bucket.accounts.push({
      type: (row.account_type as string | null) ?? null,
      status: (row.account_status as string | null) ?? null,
    });
  }
  const bookRow = (book.data ?? {}) as { business?: unknown; headline?: unknown };
  const brandRow = (brand.data ?? {}) as {
    description?: unknown;
    approval_chain_required?: unknown;
  };
  return readBrand({
    accounts: accountCountsFrom(buckets),
    savedGoal: savedGoalFrom(
      profiles.objectives
        ? [{ brand_id: brandId, scope: 'brand', objectives: profiles.objectives, source: 'user' }]
        : [],
    ),
    business: businessFrom({
      structuredBusiness: bookRow.business ?? null,
      headline: bookRow.headline ?? null,
      brandDescription: brandRow.description ?? null,
    }),
    portfolios: portfolioSignalsFrom(portfolios.data),
    approvalRequired: brandRow.approval_chain_required === true,
  });
}

/** The goals the Home should show: the saved row, else the ones its results suggest. */
function expectedObjectives(saved: HomeObjective[] | null, results: Figures): HomeObjective[] {
  return saved && saved.length > 0
    ? saved
    : inferHomeObjectives({
        purchases: results.purchases,
        purchase_value: results.purchase_value,
        leads: results.leads,
        conversations: results.conversations,
        clicks: results.clicks,
      });
}

async function openHome(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(page.locator('[data-home-overview]')).toBeVisible({ timeout: 120_000 });
}

async function expectReadingStrip(page: Page, reading: HomeBrandReading): Promise<void> {
  const strip = page.locator('[data-home-reading]');
  await expect(strip).toHaveAttribute('data-home-reading', reading.mode);
  await expect(strip.locator('[data-home-mode]')).toHaveText(reading.modeLabel);
  await expect(strip).toContainText(reading.goal.label);
  const first = reading.modules[0];
  if (first) await expect(strip).toContainText(HOME_MODULE_LABELS[first.id]);
  const top = reading.opportunities[0];
  if (top) await expect(strip).toContainText(top.title);
}

async function expectModuleOrder(page: Page, reading: HomeBrandReading): Promise<void> {
  const rendered = await page
    .locator('[data-home-slot]')
    .evaluateAll((slots) => slots.map((slot) => slot.getAttribute('data-home-slot')));
  expect(rendered).toEqual(
    reading.modules.map((module) => module.id).filter((id) => id !== 'setup'),
  );
  for (const issue of reading.issues) {
    await expect(page.locator('[data-home-slot="health"]')).toContainText(issue.title);
  }
}

async function expectTiles(
  page: Page,
  objectives: HomeObjective[],
  lead: CurrencyFigures,
): Promise<void> {
  for (const objective of objectives) {
    const tile = page.locator(`[data-home-objective="${objective.metric}"]`).first();
    await expect(tile).toBeVisible();
    await expect(tile).toContainText(objective.label);
    const value = lead.totals[objective.metric];
    if (typeof value === 'number' && HOME_OBJECTIVE_METRICS[objective.metric].unit === 'count') {
      await expect(tile.locator('[data-home-value]')).toHaveText(formatCount(value));
    } else if (typeof value === 'number') {
      await expect(tile.locator('[data-home-value]')).toHaveText(formatMoney(value, lead.currency));
    } else {
      await expect(tile).toContainText('Not counted for this account yet');
    }
  }
}

/** A currency where no account spent in either week gets no strip; the Home names it instead. */
async function expectIdleCurrencies(page: Page, idle: CurrencyFigures[]): Promise<void> {
  for (const group of idle) {
    await expect(page.locator('[data-home-overview]')).toContainText(
      `${group.accounts} ad account${group.accounts === 1 ? '' : 's'} in ${group.currency ?? 'an unknown currency'}`,
    );
  }
}

async function expectModulesWithoutError(page: Page): Promise<void> {
  for (const module of ['perf', 'org', 'cre']) {
    const block = page.locator(`[data-home-module="${module}"]`);
    await expect(block).toBeVisible();
    await expect(block.getByText(/could not be loaded/)).toHaveCount(0, { timeout: 90_000 });
  }
  await expect(
    page.locator('[data-home-module="perf"] li, [data-home-module="perf"] p').first(),
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page
      .locator(
        '[data-home-module="cre"] img, [data-home-module="cre"] p, [data-home-module="cre"] svg',
      )
      .first(),
  ).toBeVisible({ timeout: 90_000 });
}

/** Ends a minted session from the browser's latest cookies and records the proof. */
async function revokeAndRecord(
  label: string,
  session: MintedSession,
  latest: PlaywrightStorageState | null,
): Promise<void> {
  const proof = await revokeBenchSession(latest ?? session.state, session.accessToken);
  recorder.record(
    `${label} session revoked`,
    proof.revoked && proof.pinsLeft === 0 ? 'PASS' : 'FAIL',
    `${proof.sessionId}: ${proof.detail}; pins left ${proof.pinsLeft}`,
  );
}

async function closeKeepingState(context: BrowserContext): Promise<PlaywrightStorageState> {
  const state = (await context.storageState()) as PlaywrightStorageState;
  await context.close();
  return state;
}

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  recorder.print();
});

test.describe('Home overview — Easy Fit, live', () => {
  let session: MintedSession;
  let latestState: PlaywrightStorageState | null = null;

  test.beforeAll(async () => {
    session = await mintSessionBundleForEmail(MEMBER_EMAIL);
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
    await selectBrand(EASYFIT_BRAND_ID);
  });

  test.afterAll(async () => {
    if (originalBrand && originalBrand !== EASYFIT_BRAND_ID) await selectBrand(originalBrand);
    await revokeAndRecord('Easy Fit member', session, latestState);
  });

  test('goal tiles print the account’s own results', async ({ browser }) => {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    const { lead, idle, results, accounts } = await recorder.step(
      'edge totals read independently',
      () => readEdgeTotals(memberClient(), EASYFIT_BRAND_ID),
    );
    const totals = lead.totals;
    const saved = await readSavedObjectives(EASYFIT_BRAND_ID);
    const conversationsCounted = typeof totals.conversations === 'number';
    notes.push(
      `Easy Fit: ${accounts.filter((a) => a.platform === 'meta').length} Meta + ${accounts.filter((a) => a.platform === 'google_ads').length} Google account(s); edge purchases=${totals.purchases ?? 'missing'} leads=${totals.leads ?? 'missing'} conversations=${totals.conversations ?? 'missing'} spend=${totals.spend ?? 'missing'}`,
    );

    notes.push(
      `Easy Fit leads in ${lead.currency} (${lead.spending} of ${lead.accounts} accounts spent); idle: ${idle.map((group) => `${group.accounts} in ${group.currency}`).join(', ') || 'none'}`,
    );
    const expected = expectedObjectives(saved.objectives, results);
    notes.push(
      saved.tableLive
        ? `home_profiles live; goals ${saved.objectives ? 'from the saved row' : 'inferred (no row)'}`
        : 'COVERAGE: brand_profiles.home_profiles is not in production yet — goals are the inferred ones, and the saved "Tours booked" row could not be exercised',
    );
    if (!conversationsCounted) {
      notes.push(
        'COVERAGE: the deployed paid-media-metrics edge does not count conversations yet — the "Conversations started" tile is expected to say it is not counted',
      );
    }

    await recorder.step('dashboard opens on the Overview', async () => {
      await openHome(page);
      await expect(page.getByRole('button', { name: 'Overview' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    const reading = await recorder.step('reading built from the bench’s own reads', () =>
      readExpectedReading(memberClient(), EASYFIT_BRAND_ID),
    );
    notes.push(
      `Easy Fit reads as ${reading.mode}; opens with ${reading.modules[0]?.id}; ${reading.issues.length} issue(s), ${reading.opportunities.length} opportunity(ies)`,
    );

    await recorder.step('the reading strip says how the Home reads Easy Fit', () =>
      expectReadingStrip(page, reading),
    );
    await recorder.step('the modules follow the reading’s order', () =>
      expectModuleOrder(page, reading),
    );
    await recorder.step('each goal tile shows the edge figure', () =>
      expectTiles(page, expected, lead),
    );
    await recorder.step('money is never added across currencies: idle ones are named', () =>
      expectIdleCurrencies(page, idle),
    );
    await recorder.step('three module blocks render without an error state', () =>
      expectModulesWithoutError(page),
    );

    await page.screenshot({
      path: 'e2e/__screenshots__/home-overview-easyfit.png',
      fullPage: true,
    });

    await recorder.step('a goal tile opens its edit control', async () => {
      const first = page.locator('[data-home-objective]').first();
      await first.hover();
      await first.getByRole('button', { name: /^Edit goal / }).click();
      await expect(page.getByLabel('Name')).toBeVisible();
      await page.keyboard.press('Escape');
    });
    recorder.record(
      'goal save path',
      'SKIP',
      'not exercised: saving would overwrite Easy Fit’s real goals',
    );

    latestState = await closeKeepingState(context);
  });
});

test.describe('Home overview — Pink Elephant, Google Ads only, live', () => {
  let session: MintedSession;
  let latestState: PlaywrightStorageState | null = null;

  test.beforeAll(async () => {
    session = await mintSessionBundleForEmail(PINK_MEMBER_EMAIL);
    // The session's own brand, never the member's account preference: nothing outlives the run.
    await pinSessionBrand(session.accessToken, PINK_BRAND_ID);
  });

  test.afterAll(async () => {
    if (session) await revokeAndRecord('Pink member', session, latestState);
  });

  test('the Home reads its Google Ads account', async ({ browser }) => {
    const context = await browser.newContext({ storageState: session.state });
    const page = await context.newPage();
    const client = clientFor(session.accessToken);

    const { lead, results, accounts } = await recorder.step(
      'Pink: edge totals read independently',
      () => readEdgeTotals(client, PINK_BRAND_ID),
    );
    const totals = lead.totals;
    expect(accounts.map((account) => account.platform)).toEqual(['google_ads']);
    const saved = await readSavedObjectives(PINK_BRAND_ID);
    const expected = expectedObjectives(saved.objectives, results);
    const primary = expected.find((objective) => objective.role === 'primary') ?? expected[0];
    notes.push(
      `Pink: Google ${accounts[0]?.id}; edge spend=${totals.spend} ${lead.currency} leads=${totals.leads} purchases=${totals.purchases} clicks=${totals.clicks}; goals ${expected.map((o) => o.metric).join(', ')}`,
    );

    await recorder.step('Pink: the dashboard opens on the Overview', () => openHome(page));

    const reading = await recorder.step('Pink: reading built from the bench’s own reads', () =>
      readExpectedReading(client, PINK_BRAND_ID),
    );
    await recorder.step('Pink: the reading strip says how the Home reads Pink', () =>
      expectReadingStrip(page, reading),
    );
    await recorder.step('Pink: the modules follow the reading’s order', () =>
      expectModuleOrder(page, reading),
    );

    await recorder.step('Pink: no line asks for a Meta ad account', async () => {
      await expect(page.locator('[data-home-objective]').first()).toBeVisible({ timeout: 90_000 });
      await expect(page.locator('[data-home-overview]')).not.toContainText(
        'Connect a Meta ad account',
      );
    });

    await recorder.step('Pink: each goal tile shows the Google figure', () =>
      expectTiles(page, expected, lead),
    );

    await recorder.step('Pink: the spend tile prints Google’s spend in its currency', async () => {
      if (expected.some((objective) => objective.metric === 'spend') || expected.length >= 3) {
        return;
      }
      const tile = page.locator('[data-home-objective="spend"]').first();
      await expect(tile.locator('[data-home-value]')).toHaveText(
        formatMoney(totals.spend ?? 0, lead.currency),
      );
    });

    await recorder.step('Pink: three module blocks render without an error state', () =>
      expectModulesWithoutError(page),
    );

    await recorder.step('Pink: Performance + ranks the campaigns Google ranks', async () => {
      const block = page.locator('[data-home-module="perf"]');
      const ranking = googleRankingFor(primary?.metric ?? 'spend');
      if (!ranking) {
        await expect(block).toContainText('Connect a Meta ad account to rank campaigns');
        return;
      }
      const { data, error } = await client.functions.invoke('paid-media-reporting/metrics', {
        method: 'POST',
        body: {
          platform: 'google-ads',
          brandId: PINK_BRAND_ID,
          adAccountId: accounts[0]?.id,
          scope: 'top_campaigns',
          kpi: ranking.kpi,
          direction: 'top',
          limit: 4,
          range: lastCompleteDays(7),
          ...(ranking.resultBucket ? { resultBucket: ranking.resultBucket } : {}),
        },
      });
      if (error) throw new Error(`[home-bench] Pink top_campaigns failed: ${error.message}`);
      const names = ((data as { rows?: { name: string }[] }).rows ?? []).map((row) => row.name);
      notes.push(`Pink: Google ranks ${names.length} campaign(s) by ${ranking.kpi}`);
      if (names.length === 0) {
        await expect(block).toContainText('No campaign brought');
        return;
      }
      await expect(block.locator('li span[title]')).toHaveText(names);
    });

    await recorder.step('Pink: Creative + says why it ranks no Google ad', async () => {
      const block = page.locator('[data-home-module="cre"]');
      await expect(block).toContainText('Google');
      await expect(block.getByRole('alert')).toHaveCount(0);
    });

    await page.screenshot({ path: 'test-results/home-overview-pink.png', fullPage: true });
    latestState = await closeKeepingState(context);
  });
});

/** Which Google ranking the Home's Performance + shows for a goal: a business result is that
 *  result's conversions; Google reports no conversations. The bench's own copy of the rule. */
function googleRankingFor(
  metric: HomeObjectiveMetric,
): { kpi: string; resultBucket?: 'leads' | 'purchases' } | null {
  switch (metric) {
    case 'leads':
      return { kpi: 'conversions', resultBucket: 'leads' };
    case 'purchases':
      return { kpi: 'conversions', resultBucket: 'purchases' };
    case 'purchase_value':
      return { kpi: 'conversions_value', resultBucket: 'purchases' };
    case 'conversations':
      return null;
    default:
      return { kpi: metric };
  }
}
