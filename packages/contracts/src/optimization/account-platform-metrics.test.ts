import { describe, expect, test } from 'bun:test';
import {
  type AccountPlatformMetrics,
  AccountPlatformMetricsSchema,
  cheapestPlatformByKind,
} from './account-platform-metrics';

const window = { since: '2026-09-24', until: '2026-09-30', label: 'd7', ends_yesterday: false };
const priorWindow = { ...window, since: '2026-09-17', until: '2026-09-23' };

const meta = {
  platform: 'meta',
  connected: true,
  coverage: 'portfolios',
  currency: 'MXN',
  accounts: [{ account_id: '521903353286118', currency: 'MXN', ingested: true }],
  spend: 23911,
  share_of_spend: 0.6809,
  prior_spend: 22000,
  spend_delta_pct: (23911 - 22000) / 22000,
  unclassified_spend: 0,
  results_by_kind: [
    {
      kind: 'conversations',
      results: 516,
      spend: 20612,
      cost_per_result: 20612 / 516,
      prior_results: 480,
      prior_cost_per_result: 41.34,
    },
    {
      kind: 'leads',
      results: 80,
      spend: 3299,
      cost_per_result: 3299 / 80,
      prior_results: null,
      prior_cost_per_result: null,
    },
  ],
};

const google = {
  platform: 'google_ads',
  connected: true,
  coverage: 'account',
  currency: 'MXN',
  accounts: [{ account_id: '3710693645', currency: 'MXN', ingested: true }],
  spend: 11200,
  share_of_spend: 0.3191,
  prior_spend: null,
  spend_delta_pct: null,
  unclassified_spend: 2000,
  results_by_kind: [
    {
      kind: 'leads',
      results: 293,
      spend: 9200,
      cost_per_result: 9200 / 293,
      prior_results: null,
      prior_cost_per_result: null,
    },
  ],
};

const tiktok = {
  platform: 'tiktok_ads',
  connected: false,
  coverage: 'account',
  currency: null,
  accounts: [],
  spend: null,
  share_of_spend: null,
  prior_spend: null,
  spend_delta_pct: null,
  unclassified_spend: null,
  results_by_kind: [],
};

const metrics: AccountPlatformMetrics = {
  brand_id: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
  window,
  prior_window: priorWindow,
  spend_by_currency: [{ currency: 'MXN', spend: 35111 }],
  totals_by_platform: [meta, google, tiktok],
  results_by_kind: [
    {
      kind: 'conversations',
      currency: 'MXN',
      results: 516,
      spend: 20612,
      cost_per_result: 20612 / 516,
      platforms: [{ platform: 'meta', results: 516, spend: 20612, cost_per_result: 20612 / 516 }],
    },
    {
      kind: 'leads',
      currency: 'MXN',
      results: 373,
      spend: 12499,
      cost_per_result: 12499 / 373,
      platforms: [
        { platform: 'meta', results: 80, spend: 3299, cost_per_result: 3299 / 80 },
        { platform: 'google_ads', results: 293, spend: 9200, cost_per_result: 9200 / 293 },
      ],
    },
  ],
  decisions_waiting: 6,
  autopilot: { on: 4, total: 5 },
  headline_facts: {
    top_spend: { platform: 'meta', share_of_spend: 0.6809 },
    cheapest: [
      {
        kind: 'leads',
        currency: 'MXN',
        platform: 'google_ads',
        cost_per_result: 9200 / 293,
        compared: [{ platform: 'meta', cost_per_result: 3299 / 80 }],
      },
    ],
  },
  portfolios: { counted: 5, excluded: [] },
  read_at: '2026-10-01T12:00:00.000000Z',
} as AccountPlatformMetrics;

function clone(): AccountPlatformMetrics {
  return structuredClone(metrics);
}

describe('AccountPlatformMetricsSchema', () => {
  test('parses the MP1 frame: three platforms, TikTok not connected', () => {
    const parsed = AccountPlatformMetricsSchema.parse(metrics);
    expect(parsed.totals_by_platform.map((p) => p.platform)).toEqual([
      'meta',
      'google_ads',
      'tiktok_ads',
    ]);
    expect(parsed.totals_by_platform[2]?.connected).toBe(false);
  });

  test('every platform is present exactly once — a disconnected one never disappears', () => {
    const missing = clone();
    missing.totals_by_platform = missing.totals_by_platform.slice(0, 2);
    expect(AccountPlatformMetricsSchema.safeParse(missing).success).toBe(false);
    const twice = clone();
    twice.totals_by_platform = [...twice.totals_by_platform, structuredClone(meta)] as never;
    expect(AccountPlatformMetricsSchema.safeParse(twice).success).toBe(false);
  });

  test('a disconnected platform carries no figures (null, never 0)', () => {
    const zero = clone();
    const row = zero.totals_by_platform[2];
    if (row) row.spend = 0;
    expect(AccountPlatformMetricsSchema.safeParse(zero).success).toBe(false);
  });

  test('no results means no cost per result; a cost is never 0', () => {
    const noResults = clone();
    const kind = noResults.totals_by_platform[0]?.results_by_kind[0];
    if (kind) kind.results = 0;
    expect(AccountPlatformMetricsSchema.safeParse(noResults).success).toBe(false);
    const zeroCost = clone();
    const k2 = zeroCost.totals_by_platform[0]?.results_by_kind[0];
    if (k2) k2.cost_per_result = 0;
    expect(AccountPlatformMetricsSchema.safeParse(zeroCost).success).toBe(false);
  });

  test('a kind across platforms sums only its own platforms, in one currency', () => {
    const wrongSum = clone();
    const leads = wrongSum.results_by_kind[1];
    if (leads) leads.results = 999;
    expect(AccountPlatformMetricsSchema.safeParse(wrongSum).success).toBe(false);
  });

  test('the same (kind, currency) never appears twice; a kind in two currencies is two rows', () => {
    const dup = clone();
    dup.results_by_kind.push(structuredClone(dup.results_by_kind[0]) as never);
    expect(AccountPlatformMetricsSchema.safeParse(dup).success).toBe(false);
    const twoCurrencies = clone();
    twoCurrencies.results_by_kind.push({
      ...structuredClone(twoCurrencies.results_by_kind[0]),
      currency: 'USD',
    } as never);
    expect(AccountPlatformMetricsSchema.safeParse(twoCurrencies).success).toBe(true);
  });

  test('two currencies in the account: no share of spend anywhere, no top-spend headline', () => {
    const mixed = clone();
    mixed.spend_by_currency = [
      { currency: 'MXN', spend: 23911 },
      { currency: 'USD', spend: 11200 },
    ];
    expect(AccountPlatformMetricsSchema.safeParse(mixed).success).toBe(false);
    for (const row of mixed.totals_by_platform) row.share_of_spend = null;
    mixed.headline_facts.top_spend = null;
    expect(AccountPlatformMetricsSchema.safeParse(mixed).success).toBe(true);
  });

  test('the cheapest headline names the minimum and compares only the same kind and currency', () => {
    const wrong = clone();
    const fact = wrong.headline_facts.cheapest[0];
    if (fact) {
      fact.platform = 'meta';
      fact.cost_per_result = 3299 / 80;
      fact.compared = [{ platform: 'google_ads', cost_per_result: 9200 / 293 }];
    }
    expect(AccountPlatformMetricsSchema.safeParse(wrong).success).toBe(false);
  });
});

describe('cheapestPlatformByKind', () => {
  test('needs two platforms with a real cost; a null cost never wins', () => {
    expect(cheapestPlatformByKind(metrics.results_by_kind)).toEqual(
      metrics.headline_facts.cheapest,
    );
    const withNull = structuredClone(metrics.results_by_kind);
    const meta = withNull[1]?.platforms[0];
    if (meta) {
      meta.results = 0;
      meta.cost_per_result = null;
    }
    expect(cheapestPlatformByKind(withNull)).toEqual([]);
  });
});
