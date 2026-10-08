// The MP1 frame for Easy Fit, week of 21–27 September, as frontend.html §2 quotes it: Meta's
// figures are the real ones, Google's and TikTok's the illustrative ones. Built through the
// contract's own schema, so a fixture the producer could never emit fails here first.

import {
  type AccountPlatformMetrics,
  AccountPlatformMetricsSchema,
  cheapestPlatformByKind,
  type KindAcrossPlatforms,
  type PlatformTotals,
} from '@continuum/contracts';

const BRAND = '7b1f8a52-2c7c-4f0e-9a3e-5d2b6c1e9f10';

const WINDOW = { since: '2026-09-21', until: '2026-09-27', label: 'd7', ends_yesterday: true };

function disconnected(platform: PlatformTotals['platform']): PlatformTotals {
  return {
    platform,
    connected: false,
    coverage: platform === 'meta' ? 'portfolios' : 'account',
    currency: null,
    accounts: [],
    spend: null,
    share_of_spend: null,
    prior_spend: null,
    spend_delta_pct: null,
    unclassified_spend: null,
    results_by_kind: [],
  };
}

export const META_TOTALS: PlatformTotals = {
  platform: 'meta',
  connected: true,
  coverage: 'portfolios',
  currency: 'MXN',
  accounts: [{ account_id: 'act_521903353286118', currency: 'MXN', ingested: true }],
  spend: 23911,
  share_of_spend: 0.6225,
  prior_spend: 22000,
  spend_delta_pct: 0.0869,
  unclassified_spend: 0,
  results_by_kind: [
    {
      kind: 'conversations',
      results: 516,
      spend: 20614,
      cost_per_result: 39.95,
      prior_results: 500,
      prior_cost_per_result: 41.34,
    },
    {
      kind: 'leads',
      results: 78,
      spend: 3221.4,
      cost_per_result: 41.3,
      prior_results: null,
      prior_cost_per_result: null,
    },
    {
      kind: 'purchases',
      results: 0,
      spend: 75.6,
      cost_per_result: null,
      prior_results: null,
      prior_cost_per_result: null,
    },
  ],
};

export const GOOGLE_TOTALS: PlatformTotals = {
  platform: 'google_ads',
  connected: true,
  coverage: 'account',
  currency: 'MXN',
  accounts: [{ account_id: '5251780631', currency: 'MXN', ingested: true }],
  spend: 11200,
  share_of_spend: 0.2916,
  prior_spend: null,
  spend_delta_pct: null,
  unclassified_spend: 7494.8,
  results_by_kind: [
    {
      kind: 'leads',
      results: 118,
      spend: 3705.2,
      cost_per_result: 31.4,
      prior_results: 100,
      prior_cost_per_result: 33.1,
    },
  ],
};

export const TIKTOK_TOTALS: PlatformTotals = {
  platform: 'tiktok_ads',
  connected: true,
  coverage: 'account',
  currency: 'MXN',
  accounts: [{ account_id: '7000000000000000001', currency: 'MXN', ingested: true }],
  spend: 3300,
  share_of_spend: 0.0859,
  prior_spend: 3000,
  spend_delta_pct: 0.1,
  unclassified_spend: 2346,
  results_by_kind: [
    {
      kind: 'leads',
      results: 18,
      spend: 954,
      cost_per_result: 53,
      prior_results: 20,
      prior_cost_per_result: 44.2,
    },
  ],
};

function kindsOf(totals: PlatformTotals[], currency: string | null): KindAcrossPlatforms[] {
  const byKind = new Map<string, KindAcrossPlatforms>();
  for (const row of totals) {
    for (const kind of row.results_by_kind) {
      const entry = byKind.get(kind.kind) ?? {
        kind: kind.kind,
        currency,
        results: 0,
        spend: 0,
        cost_per_result: null,
        platforms: [],
      };
      entry.results += kind.results;
      entry.spend = Math.round((entry.spend + kind.spend) * 100) / 100;
      entry.platforms.push({
        platform: row.platform,
        results: kind.results,
        spend: kind.spend,
        cost_per_result: kind.cost_per_result,
      });
      byKind.set(kind.kind, entry);
    }
  }
  return [...byKind.values()].map((kind) => ({
    ...kind,
    cost_per_result:
      kind.results === 0 || kind.spend === 0
        ? null
        : Math.round((kind.spend / kind.results) * 100) / 100,
  }));
}

/** Builds a frame the contract accepts: kinds, cheapest facts and spend derived from totals. */
export function buildMetrics(
  totals: PlatformTotals[],
  overrides: Partial<AccountPlatformMetrics> = {},
): AccountPlatformMetrics {
  const all: PlatformTotals[] = (['meta', 'google_ads', 'tiktok_ads'] as const).map(
    (platform) => totals.find((row) => row.platform === platform) ?? disconnected(platform),
  );
  const currencies = [...new Set(all.filter((row) => row.connected).map((row) => row.currency))];
  const oneCurrency = currencies.length === 1 ? (currencies[0] ?? null) : null;
  const results_by_kind = oneCurrency != null ? kindsOf(all, oneCurrency) : [];
  const spend_by_currency = currencies.map((currency) => ({
    currency,
    spend:
      Math.round(
        all
          .filter((row) => row.connected && row.currency === currency)
          .reduce((sum, row) => sum + (row.spend ?? 0), 0) * 100,
      ) / 100,
  }));
  const top = [...all]
    .filter((row) => row.share_of_spend != null)
    .sort((a, b) => (b.share_of_spend ?? 0) - (a.share_of_spend ?? 0))[0];
  const frame = {
    brand_id: BRAND,
    window: WINDOW,
    prior_window: { since: '2026-09-14', until: '2026-09-20', label: 'd7', ends_yesterday: true },
    spend_by_currency,
    totals_by_platform: all,
    results_by_kind,
    decisions_waiting: 6,
    autopilot: { on: 4, total: 5 },
    headline_facts: {
      top_spend:
        oneCurrency != null && top
          ? { platform: top.platform, share_of_spend: top.share_of_spend as number }
          : null,
      cheapest: cheapestPlatformByKind(results_by_kind),
    },
    portfolios: { counted: 5, excluded: [] },
    read_at: '2026-09-28T06:00:00Z',
    ...overrides,
  };
  return AccountPlatformMetricsSchema.parse(frame);
}

export const EASY_FIT_MP1 = buildMetrics([META_TOTALS, GOOGLE_TOTALS, TIKTOK_TOTALS]);

/** Meta alone: Google and TikTok not connected, still in the frame with null figures. */
export const META_ONLY = buildMetrics([{ ...META_TOTALS, share_of_spend: 1 }]);
