import { writeFileSync } from 'node:fs';
import {
  type AccountCandidate,
  type AccountPlatformMetrics,
  AccountPlatformMetricsSchema,
  type AdAccount,
  type AdAccountMode,
  type AdAccountReading,
  type AdAccountSignals,
  accountCandidateSchema,
  type PortfolioListItem,
  PortfolioListItemSchema,
  readAdAccount,
} from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import {
  type AdAccountReads,
  adAccountSignalsFrom,
  P8_FACT_LABELS,
  portfoliosOfAccount,
} from '../src/lib/optimizer/adAccountSignals';
import { isAdsManagerAccount } from '../src/lib/paid-media/adsManager';
import { createBenchRecorder } from './support/benchRecorder';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// optimizer:reading:bench — the Optimizer's reading of EVERY connected ad account in production.
//
// Reads each Meta and Google Ads account a brand has assigned, with what the Optimizer already
// keeps about it (optimizer_list_portfolios, the Google tab's pending cards through
// optimizer_get_platform_cards, Meta's account read through optimizer_get_account_read, the
// producer's spend and results through optimizer_get_account_platform_metrics, the brand's
// approval chain), builds the signals with the same mappers the board's hook uses
// (src/lib/optimizer/adAccountSignals.ts) and reads them with the same `readAdAccount`. Then it
// holds every reading to what the board promises:
//   1. Setup exactly when the account has no portfolio.
//   2. Fix first exactly when a problem touches half or more of what the account moves, or the
//      account does not deliver (Ramiro's decision 2, 2026-11-02) — re-derived here from the raw
//      rows, not from the mapped signals.
//   3. The spine (result, decisions, portfolios) is always on the board.
//   4. Every slot's reason names a figure present in the reading's inputs.
//   5. The five accounts the design was read on land where it says: Vivo 47 Google fix, Easy Fit
//      Google fix while Google suspends it, Pink Elephant recommend, Tangassi setup, Easy Fit
//      Meta Autopilot. When live data moved one of them, the bench says what moved.
//
// It reads only, through the service role; nothing is written, no session is minted.
// Un-exercised by design: the platforms' live campaign reads (Google's top_campaigns and Meta's
// ad-set snapshots through paid-media-metrics) need a member session with the brand's Google or
// Meta grant and call the ad platforms live, so the campaign-driven views (Google mix and PMax
// share, Meta branches, headroom and one-ad-set structure) read "not read" here; their mappers
// are covered by src/lib/optimizer/adAccountSignals.test.ts on recorded production reads.
// Set OPTIMIZER_READING_OUT=<file> to keep every reading as JSON.
// ---------------------------------------------------------------------------

const CONCURRENCY = 6;
const FIX_MIN_SHARE = 0.5;

const { serviceRoleKey } = loadProdSupabaseEnv();
const admin = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const notes: string[] = [];
const recorder = createBenchRecorder('optimizer:reading:bench', notes);

const AD_ACCOUNT_TYPES = new Set([
  'meta_ad_account',
  'ads_customer',
  'google_ad_account',
  'google_ads_account',
  'google_ads_customer',
]);

const CAMPAIGNS_NOT_READ =
  'No se leyeron las campañas: este bench lee lo que guarda el Optimizer, no la lectura en vivo de la plataforma.';

type BrandRow = { id: string; brand_name: string | null; approval_chain_required: boolean | null };
type AssetRow = {
  brand_profile_id: string;
  integration_accounts_assets: {
    type: string | null;
    status: string | null;
    external_account_id: string | null;
    name: string | null;
    raw_payload: Record<string, unknown> | null;
  } | null;
};

type Platform = 'meta' | 'google_ads';

type Read = {
  brandId: string;
  brand: string;
  platform: Platform;
  accountId: string;
  account: string | null;
  raw: {
    portfolios: PortfolioListItem[];
    cards: AccountCandidate[];
    metaCandidates: AccountCandidate[];
    metaGuards: AccountCandidate[];
    metrics: AccountPlatformMetrics | null;
  };
  signals: AdAccountSignals;
  reading: AdAccountReading;
};

/** Every row of a table, 1,000 at a time. */
async function all<T>(schema: string, table: string, columns: string, active = false) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    let query = admin.schema(schema).from(table).select(columns);
    if (active) query = query.eq('active', true);
    const { data, error } = await query.range(from, from + 999);
    if (error) throw new Error(`${schema}.${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return rows;
  }
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`${name}(${JSON.stringify(args)}): ${error.message}`);
  return data;
}

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const results: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index] as T);
      }
    }),
  );
  return results;
}

/** The brand's ad accounts as plugin_mcp.list_brand_ad_accounts returns them (its body:
 *  the platform by asset type, status falling back to account_status, the payload's currency),
 *  with the Google Ads managers the Frontend drops, and each account once. */
function adAccountsOf(assets: AssetRow[]): AdAccount[] {
  const seen = new Set<string>();
  const accounts: AdAccount[] = [];
  for (const row of assets) {
    const asset = row.integration_accounts_assets;
    if (!asset?.type || !AD_ACCOUNT_TYPES.has(asset.type) || !asset.external_account_id) continue;
    const payload = asset.raw_payload ?? {};
    const account: AdAccount = {
      platform: asset.type === 'meta_ad_account' ? 'meta_ads' : 'google_ads',
      account_id: asset.external_account_id,
      name: asset.name ?? (typeof payload.name === 'string' ? payload.name : null),
      status:
        asset.status ??
        (typeof payload.account_status === 'string' ? payload.account_status : null),
      currency: typeof payload.currency === 'string' ? payload.currency : null,
    };
    if (isAdsManagerAccount(account)) continue;
    const key = `${account.platform}:${account.account_id.replace(/^act_/, '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    accounts.push(account);
  }
  return accounts;
}

const candidates = (rows: unknown): AccountCandidate[] =>
  (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const parsed = accountCandidateSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });

// ── The promises, re-derived from the raw rows ────────────────────────────────

type PlatformCardBody = Record<string, unknown>;
const cardOf = (candidate: AccountCandidate): PlatformCardBody =>
  (candidate.platform_card ?? {}) as PlatformCardBody;

/** What the rows say about Fix first, without the mappers: the account does not deliver, or a
 *  problem touches half or more of what it moves a day. */
function oracleFix(read: Read): { fix: boolean; why: string } {
  const { raw, platform, accountId } = read;
  const ids = new Set(raw.portfolios.map((portfolio) => portfolio.id));
  const mine = raw.cards.filter((card) => !card.portfolio_ids[0] || ids.has(card.portfolio_ids[0]));
  const totals = raw.metrics?.totals_by_platform.find((row) => row.platform === platform);
  const ingested = totals?.accounts.filter((account) => account.ingested) ?? [];
  const own =
    totals?.connected &&
    totals.spend != null &&
    ingested.length === 1 &&
    ingested[0]?.account_id.replace(/^act_/, '') === accountId.replace(/^act_/, '');
  const days = raw.metrics
    ? Math.round(
        (Date.parse(`${raw.metrics.window.until}T00:00:00Z`) -
          Date.parse(`${raw.metrics.window.since}T00:00:00Z`)) /
          86_400_000,
      ) + 1
    : 0;
  const spendPerDay = own && totals?.spend != null && days > 0 ? totals.spend / days : null;
  const plans = new Map(
    raw.portfolios.map((portfolio) => {
      const observed = (portfolio.budget_source ?? 'observed') === 'observed';
      const plan =
        observed && portfolio.conserved_daily_total != null
          ? portfolio.conserved_daily_total
          : (portfolio.daily_total ?? 0);
      return [portfolio.id, plan];
    }),
  );
  const planTotal = [...plans.values()].reduce((sum, plan) => sum + plan, 0);
  const share = (perDay: number, ownPlan: number) =>
    perDay <= 0
      ? 0
      : spendPerDay != null
        ? perDay / (perDay + spendPerDay)
        : perDay / (perDay + Math.max(0, planTotal - ownPlan));

  if (
    mine.some(
      (card) =>
        cardOf(card).variant === 'google_delivery_issue' && cardOf(card).account_wide === true,
    )
  )
    return { fix: true, why: 'G12 account-wide' };
  const stillDark = mine.some(
    (card) =>
      cardOf(card).idea === 'continuity_calendar' &&
      Array.isArray(cardOf(card).facts) &&
      (cardOf(card).facts as { label: string }[]).some((fact) =>
        (P8_FACT_LABELS.stillDark as readonly string[]).includes(fact.label),
      ),
  );
  if (stillDark) return { fix: true, why: 'E1 still dark' };
  if (mine.some((card) => cardOf(card).idea === 'inflated_primary_conversion'))
    return { fix: true, why: 'V1 inflated conversion' };
  const darkBudget = mine
    .filter((card) => {
      const body = cardOf(card);
      return (
        body.variant === 'google_delivery_issue' &&
        (Number(body.dark_days ?? 0) > 0 ||
          (Array.isArray(body.reasons) && body.reasons.includes('SERVING_STATUS_SUSPENDED')))
      );
    })
    .reduce((sum, card) => sum + Number(cardOf(card).budget_per_day ?? 0), 0);
  const shares: [string, number][] = [['G12 campaigns', share(darkBudget, 0)]];
  for (const candidate of [...raw.metaCandidates, ...raw.metaGuards]) {
    if (candidate.detector === 'delivery_collapse') {
      const planned = Number(candidate.evidence.planned_per_day ?? 0);
      const delivered = Number(candidate.evidence.delivered_per_day ?? 0);
      shares.push([
        'Meta delivery collapse',
        share(planned - delivered, plans.get(candidate.portfolio_ids[0] ?? '') ?? 0),
      ]);
    }
    if (candidate.detector === 'measurement_integrity') {
      const touched = candidate.portfolio_ids.reduce((sum, id) => sum + (plans.get(id) ?? 0), 0);
      shares.push([
        'Meta measurement',
        candidate.portfolio_ids.length === 0 ? 1 : planTotal > 0 ? touched / planTotal : 0,
      ]);
    }
  }
  for (const portfolio of raw.portfolios) {
    if (portfolio.roster_state === 'absent' && portfolio.status === 'active') {
      const plan = plans.get(portfolio.id) ?? 0;
      shares.push([`roster of ${portfolio.name}`, share(plan, plan)]);
    }
  }
  const worst = shares.sort((a, b) => b[1] - a[1])[0];
  return worst && worst[1] >= FIX_MIN_SHARE
    ? { fix: true, why: `${worst[0]} ${Math.round(worst[1] * 100)}%` }
    : { fix: false, why: worst ? `largest ${worst[0]} ${Math.round(worst[1] * 100)}%` : 'none' };
}

const FIGURE = /\d[\d,]*(?:\.\d+)?/g;

/** Every figure the reading's inputs hold: numbers, the figures inside the producer's worded
 *  values and names, list lengths, and the sums the reading states (pending, plans). */
function inputFigures(signals: AdAccountSignals): number[] {
  const figures: number[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) figures.push(value);
    else if (typeof value === 'string')
      for (const match of value.matchAll(FIGURE)) figures.push(Number(match[0].replace(/,/g, '')));
    else if (Array.isArray(value)) {
      figures.push(value.length);
      for (const item of value) walk(item);
    } else if (value && typeof value === 'object')
      for (const item of Object.values(value)) walk(item);
  };
  walk(signals);
  figures.push(
    signals.portfolios.reduce(
      (sum, portfolio) =>
        sum + portfolio.pendingRecommendations + (portfolio.pendingBudgetMoves ?? 0),
      0,
    ),
  );
  return figures;
}

/** A figure in a sentence is an input figure as printed: exact to the cent, rounded to a whole,
 *  or a share printed as a percentage. */
function namesInputFigure(reason: string, figures: readonly number[]): boolean {
  const tokens = [...reason.matchAll(FIGURE)].map((match) => Number(match[0].replace(/,/g, '')));
  return tokens.some((token) =>
    figures.some(
      (figure) =>
        Math.abs(token - figure) < 0.006 ||
        token === Math.round(figure) ||
        (Math.abs(figure) <= 1 && token === Math.round(figure * 100)),
    ),
  );
}

const EXPECTED: {
  label: string;
  brand: string;
  platform: Platform;
  account: string;
  mode: AdAccountMode;
  /** Whether the inputs still say what made the design expect that mode. */
  still: (read: Read) => { holds: boolean; said: string };
}[] = [
  {
    label: 'Vivo 47 Google',
    brand: '61b80f51-709a-4408-9f11-04142a286baa',
    platform: 'google_ads',
    account: '3710693645',
    mode: 'fix',
    still: (read) => {
      const v1 = read.signals.findings?.inflated;
      return {
        holds: v1 != null,
        said: v1
          ? `V1: ${Math.round(v1.attentionShare * 100)}% of ${v1.reported} reported are attention events, ${v1.real} real`
          : 'V1 is no longer pending',
      };
    },
  },
  {
    label: 'Easy Fit Google (5251780631)',
    brand: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
    platform: 'google_ads',
    account: '5251780631',
    mode: 'fix',
    still: (read) => {
      const suspended = read.signals.findings?.delivery.filter((card) => card.suspended) ?? [];
      return {
        holds: suspended.length > 0,
        said: suspended.length
          ? `suspended: ${suspended.map((card) => `${card.campaign} ${card.darkDays} days, ${card.budgetPerDay}/day`).join('; ')}`
          : 'no G12 card says SERVING_STATUS_SUSPENDED any more',
      };
    },
  },
  {
    label: 'Pink Elephant Google',
    brand: '8e5b7185-e43f-4150-b763-b86c4f5297a0',
    platform: 'google_ads',
    account: '6619636193',
    mode: 'recommend',
    still: (read) => {
      const writable = read.signals.portfolios.filter((portfolio) => portfolio.canWrite);
      return {
        holds: writable.length === 0,
        said: `${writable.length} of ${read.signals.portfolios.length} portfolios writable`,
      };
    },
  },
  {
    label: 'Tangassi Google',
    brand: '9f7e830f-6445-4bba-b199-a2db07fa184a',
    platform: 'google_ads',
    account: '9343596627',
    mode: 'setup',
    still: (read) => ({
      holds: read.signals.portfolios.length === 0,
      said: `${read.signals.portfolios.length} portfolios`,
    }),
  },
  {
    label: 'Easy Fit Meta (act_521903353286118)',
    brand: '148583e0-5538-462b-8d3a-acd25b80344e',
    platform: 'meta',
    account: 'act_521903353286118',
    mode: 'operate',
    still: (read) => {
      const autopilot = read.signals.portfolios.filter(
        (portfolio) =>
          portfolio.applyMode === 'autopilot' &&
          !portfolio.autopilotPaused &&
          !portfolio.rosterAbsent &&
          portfolio.cycleCurrent !== false,
      );
      return {
        holds: autopilot.length > 0,
        said: `${autopilot.map((portfolio) => portfolio.name).join(', ') || 'no portfolio'} on autopilot`,
      };
    },
  },
];

async function main() {
  const [brands, assets] = await recorder.step('read every brand and its ad accounts', () =>
    Promise.all([
      all<BrandRow>(
        'brand_profiles',
        'brand_profiles',
        'id, brand_name, approval_chain_required',
        true,
      ),
      all<AssetRow>(
        'brand_profiles',
        'brand_profile_integration_accounts',
        'brand_profile_id, integration_accounts_assets:integration_account_id(type, status, external_account_id, name, raw_payload)',
      ),
    ]),
  );
  const assetsBy = Map.groupBy(assets, (row) => row.brand_profile_id);
  const connected = brands
    .map((brand) => ({ brand, accounts: adAccountsOf(assetsBy.get(brand.id) ?? []) }))
    .filter((entry) => entry.accounts.length > 0);

  const perBrand = await recorder.step('read what the Optimizer keeps for each account', () =>
    mapLimit(connected, CONCURRENCY, async ({ brand, accounts }) => {
      const hasGoogle = accounts.some((account) => account.platform === 'google_ads');
      const [portfolioRows, cardRows, metricsRow] = await Promise.all([
        rpc('optimizer_list_portfolios', { p_brand_id: brand.id }),
        hasGoogle
          ? rpc('optimizer_get_platform_cards', { p_brand_id: brand.id, p_platform: 'google_ads' })
          : Promise.resolve([]),
        rpc('optimizer_get_account_platform_metrics', { p_brand_id: brand.id, p_window: 'd7' }),
      ]);
      const portfolios = (Array.isArray(portfolioRows) ? portfolioRows : []).flatMap((row) => {
        const parsed = PortfolioListItemSchema.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      });
      const metrics = AccountPlatformMetricsSchema.safeParse(metricsRow);
      const cards = candidates(cardRows);
      const reads: Read[] = [];
      for (const account of accounts) {
        const platform: Platform = account.platform === 'meta_ads' ? 'meta' : 'google_ads';
        const scoped = portfoliosOfAccount(portfolios, platform, account.account_id);
        let metaCandidates: AccountCandidate[] = [];
        let metaGuards: AccountCandidate[] = [];
        let metaRead: AdAccountReads['metaRead'];
        if (platform === 'meta') {
          const envelope = (await rpc('optimizer_get_account_read', {
            p_brand_id: brand.id,
            p_ad_account_id: account.account_id,
          })) as { read?: { candidates?: unknown; guards?: unknown } | null } | null;
          metaCandidates = candidates(envelope?.read?.candidates);
          metaGuards = candidates(envelope?.read?.guards);
          metaRead = envelope?.read ? { candidates: metaCandidates, guards: metaGuards } : null;
        }
        const signals = adAccountSignalsFrom({
          platform,
          accountId: account.account_id,
          currency:
            account.currency ?? scoped.find((portfolio) => portfolio.currency)?.currency ?? null,
          portfolios: scoped,
          approvalRequired: brand.approval_chain_required === true,
          googleCards: platform === 'google_ads' ? cards : undefined,
          metaRead,
          metrics: metrics.success ? metrics.data : null,
          missing: [{ input: 'campaigns', reason: CAMPAIGNS_NOT_READ }],
        });
        reads.push({
          brandId: brand.id,
          brand: brand.brand_name ?? '(unnamed)',
          platform,
          accountId: account.account_id,
          account: account.name,
          raw: {
            portfolios: scoped,
            cards: platform === 'google_ads' ? cards : [],
            metaCandidates,
            metaGuards,
            metrics: metrics.success ? metrics.data : null,
          },
          signals,
          reading: readAdAccount(signals),
        });
      }
      return { metricsParsed: metrics.success, reads };
    }),
  );
  const reads = perBrand.flatMap((entry) => entry.reads);
  const meta = reads.filter((read) => read.platform === 'meta');
  const google = reads.filter((read) => read.platform === 'google_ads');

  recorder.record(
    'reads every connected Meta and Google Ads account',
    reads.length > 0 && reads.every((read) => read.reading.board.length > 0) ? 'PASS' : 'FAIL',
    `${reads.length} accounts (${meta.length} Meta, ${google.length} Google Ads) in ${connected.length} brands, of ${brands.length} active brands`,
  );
  const unparsed = perBrand.filter((entry) => !entry.metricsParsed).length;
  recorder.record(
    "the producer's metrics parse for every brand",
    unparsed === 0 ? 'PASS' : 'FAIL',
    unparsed
      ? `${unparsed} brands' optimizer_get_account_platform_metrics did not parse`
      : undefined,
  );

  const wrongSetup = reads.filter(
    (read) => (read.signals.portfolios.length === 0) !== (read.reading.mode === 'setup'),
  );
  recorder.record(
    'setup exactly when the account has no portfolio',
    wrongSetup.length === 0 ? 'PASS' : 'FAIL',
    wrongSetup.map((read) => `${read.brand} ${read.accountId}: ${read.reading.mode}`).join(', ') ||
      `${reads.filter((read) => read.reading.mode === 'setup').length} setup`,
  );

  const withPortfolios = reads.filter((read) => read.signals.portfolios.length > 0);
  const wrongFix = withPortfolios.flatMap((read) => {
    const oracle = oracleFix(read);
    return oracle.fix === (read.reading.mode === 'fix')
      ? []
      : [`${read.brand} ${read.accountId}: reads ${read.reading.mode}, rows say ${oracle.why}`];
  });
  recorder.record(
    'fix exactly when a problem touches half or more, or the account does not deliver',
    wrongFix.length === 0 ? 'PASS' : 'FAIL',
    wrongFix.join('; ') ||
      `${withPortfolios.filter((read) => read.reading.mode === 'fix').length} of ${withPortfolios.length} accounts with portfolios in fix`,
  );

  const noSpine = reads.filter(
    (read) =>
      !['result', 'decisions', 'portfolios'].every((module) =>
        read.reading.board.some((slot) => slot.module === module),
      ),
  );
  recorder.record(
    'the spine is always on the board',
    noSpine.length === 0 ? 'PASS' : 'FAIL',
    noSpine.map((read) => `${read.brand} ${read.accountId}`).join(', ') || undefined,
  );

  const unnamed = reads.flatMap((read) => {
    const figures = inputFigures(read.signals);
    return read.reading.board
      .filter((slot) => !namesInputFigure(slot.reason, figures))
      .map((slot) => `${read.brand} ${read.accountId} ${slot.module}: "${slot.reason}"`);
  });
  const slots = reads.reduce((sum, read) => sum + read.reading.board.length, 0);
  recorder.record(
    'every slot reason names a figure present in its inputs',
    unnamed.length === 0 ? 'PASS' : 'FAIL',
    unnamed.slice(0, 8).join(' | ') || `${slots} slot reasons checked`,
  );

  const badSizes = reads.filter((read) => {
    const sized = read.reading.board.filter((slot) => slot.module !== 'portfolios');
    const scores = read.reading.board.map((slot) => slot.score);
    return (
      scores.some((score, index) => index > 0 && score > (scores[index - 1] ?? 100)) ||
      sized.some((slot, index) => slot.size !== (index === 0 ? 'l' : index <= 2 ? 'm' : 's')) ||
      read.reading.board.some((slot) => slot.module === 'portfolios' && slot.size !== 'w')
    );
  });
  recorder.record(
    'the board is sorted by score and sized l, m, m, then s, with portfolios w',
    badSizes.length === 0 ? 'PASS' : 'FAIL',
    badSizes.map((read) => `${read.brand} ${read.accountId}`).join(', ') || undefined,
  );

  const noAsks = reads.filter((read) => new Set(read.reading.asks).size !== 3);
  recorder.record(
    'three questions for Jaina on every reading',
    noAsks.length === 0 ? 'PASS' : 'FAIL',
    noAsks.map((read) => `${read.brand} ${read.accountId}`).join(', ') || undefined,
  );

  for (const expected of EXPECTED) {
    const read = reads.find(
      (candidate) =>
        candidate.brandId === expected.brand &&
        candidate.platform === expected.platform &&
        candidate.accountId.replace(/^act_/, '') === expected.account.replace(/^act_/, ''),
    );
    const step = `${expected.label} reads ${expected.mode}`;
    if (!read) {
      recorder.record(step, 'FAIL', 'the account is no longer connected to that brand');
      continue;
    }
    const still = expected.still(read);
    const detail = `${read.reading.mode}: "${read.reading.modeReason}" (${still.said})`;
    if (read.reading.mode === expected.mode) recorder.record(step, 'PASS', detail);
    else if (!still.holds) recorder.record(step, 'WARN', `moved — ${detail}`);
    else recorder.record(step, 'FAIL', detail);
  }

  for (const platform of ['google_ads', 'meta'] as const) {
    const list = reads.filter((read) => read.platform === platform);
    const byMode = Map.groupBy(list, (read) => read.reading.mode);
    notes.push(
      `${platform} modes: ${[...byMode].map(([mode, rows]) => `${mode} ${rows.length}`).join(', ')}`,
    );
    const shown = new Map<string, number>();
    for (const read of list)
      for (const slot of read.reading.board)
        shown.set(slot.module, (shown.get(slot.module) ?? 0) + 1);
    notes.push(
      `${platform} modules on the board: ${[...shown].map(([module, n]) => `${module} ${n}`).join(', ')}`,
    );
  }
  const notices = reads.reduce((sum, read) => sum + (read.reading.notices?.length ?? 0), 0);
  notes.push(`${notices} problems under the Fix-first line kept as notices`);
  notes.push(
    "un-exercised: the platforms' live campaign reads (Google top_campaigns, Meta ad-set snapshots) need a member session and call Google and Meta live; the campaign-driven views read as not read here and are covered by adAccountSignals.test.ts on recorded production reads",
  );

  for (const read of withPortfolios.sort((a, b) => a.brand.localeCompare(b.brand))) {
    console.log(
      [
        read.brandId.slice(0, 8),
        read.brand.slice(0, 30).padEnd(30),
        read.platform.padEnd(10),
        read.accountId.padEnd(22),
        read.reading.mode.padEnd(9),
        read.reading.board.map((slot) => `${slot.module}:${slot.size}${slot.score}`).join(' '),
      ].join('  '),
    );
  }

  const out = process.env.OPTIMIZER_READING_OUT;
  if (out) {
    writeFileSync(
      out,
      JSON.stringify(
        reads.map(({ brandId, brand, platform, accountId, account, signals, reading }) => ({
          brandId,
          brand,
          platform,
          accountId,
          account,
          signals,
          reading,
        })),
        null,
        2,
      ),
    );
    notes.push(`readings written to ${out}`);
  }
}

try {
  await main();
} catch (error) {
  recorder.record('bench', 'FAIL', error instanceof Error ? error.message : String(error));
} finally {
  recorder.print();
}
process.exit(0);
