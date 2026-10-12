import { describe, expect, test } from 'bun:test';
import { MetricTotalsSchema, metricRatio, PortfolioMetricsSchema } from './portfolio-metrics';

const totals = {
  spend: 3569,
  impressions: 120_000,
  clicks: 2_400,
  results: 79,
  cost_per_result: 45.18,
  conversions: 79,
  conversion_value: null,
  roas: null,
  delivering_entities: 5,
  entities: 6,
};

const window = { since: '2026-09-24', until: '2026-09-30', label: 'd7', ends_yesterday: false };

const metrics = {
  portfolio_id: '0d9b296a-0000-4000-8000-000000000001',
  objective: 'lead',
  result_kind: 'leads',
  currency: 'MXN',
  window,
  prior_window: null,
  attribution: { configured: 'platform', used: 'platform', fallback_reason: 'none' },
  totals,
  prior_totals: null,
  target: { cpa: 35, metric: 'cpl' },
  by_platform: [
    {
      ...totals,
      platform: 'google_ads',
      spend: 1408,
      results: 23,
      conversions: 23,
      cost_per_result: 61.22,
    },
    {
      ...totals,
      platform: 'meta',
      spend: 2161,
      results: 56,
      conversions: 56,
      cost_per_result: 38.59,
    },
  ],
  conversions_by_source: [],
  read_at: '2026-10-01T12:00:00.000Z',
};

describe('metricRatio', () => {
  test('null when the denominator is zero or either side is missing — never 0, never Infinity', () => {
    expect(metricRatio(100, 0)).toBeNull();
    expect(metricRatio(null, 10)).toBeNull();
    expect(metricRatio(10, null)).toBeNull();
    expect(metricRatio(100, 4)).toBe(25);
  });
});

describe('MetricTotalsSchema', () => {
  test('a slice with no results has no cost per result', () => {
    expect(
      MetricTotalsSchema.safeParse({ ...totals, results: 0, cost_per_result: null }).success,
    ).toBe(true);
    expect(
      MetricTotalsSchema.safeParse({ ...totals, results: 0, cost_per_result: 0 }).success,
    ).toBe(false);
    expect(
      MetricTotalsSchema.safeParse({ ...totals, results: 0, cost_per_result: 45 }).success,
    ).toBe(false);
  });

  test('roas is null without spend or without a reported value', () => {
    const google = { ...totals, conversion_value: 9_000, roas: 2.52 };
    expect(MetricTotalsSchema.safeParse(google).success).toBe(true);
    expect(MetricTotalsSchema.safeParse({ ...google, spend: 0, roas: 2.52 }).success).toBe(false);
    expect(MetricTotalsSchema.safeParse({ ...google, conversion_value: null }).success).toBe(false);
    expect(
      MetricTotalsSchema.safeParse({
        ...google,
        spend: 0,
        roas: null,
        cost_per_result: null,
        results: 0,
      }).success,
    ).toBe(true);
  });

  test('more delivering entities than entities is impossible', () => {
    expect(MetricTotalsSchema.safeParse({ ...totals, delivering_entities: 7 }).success).toBe(false);
  });
});

describe('PortfolioMetricsSchema', () => {
  test('parses a two-platform portfolio with canonical platform ids', () => {
    const parsed = PortfolioMetricsSchema.parse(metrics);
    expect(parsed.by_platform.map((row) => row.platform)).toEqual(['google_ads', 'meta']);
  });

  test('refuses the legacy hyphenated platform literal', () => {
    const legacy = {
      ...metrics,
      by_platform: [{ ...metrics.by_platform[0], platform: 'google-ads' }],
    };
    expect(PortfolioMetricsSchema.safeParse(legacy).success).toBe(false);
  });

  test('a fallback must say why; no fallback means the configured source was used', () => {
    const degraded = {
      ...metrics,
      attribution: { configured: 'ga4', used: 'platform', fallback_reason: 'coverage' },
    };
    expect(PortfolioMetricsSchema.safeParse(degraded).success).toBe(true);
    const silent = {
      ...metrics,
      attribution: { configured: 'ga4', used: 'platform', fallback_reason: 'none' },
    };
    expect(PortfolioMetricsSchema.safeParse(silent).success).toBe(false);
  });

  test('currency is an ISO code or null', () => {
    expect(PortfolioMetricsSchema.safeParse({ ...metrics, currency: null }).success).toBe(true);
    expect(PortfolioMetricsSchema.safeParse({ ...metrics, currency: '$' }).success).toBe(false);
  });

  test('a GA4 source row carries its coverage and freshness', () => {
    const ga4 = {
      kind: 'ga4',
      source_id: '0d9b296a-0000-4000-8000-000000000002',
      label: 'GA4 · vivo47.mx',
      conversions: 70,
      conversion_value: null,
      coverage_pct: 0.92,
      refreshed_at: '2026-10-01T06:00:00.000Z',
      error: null,
    };
    expect(
      PortfolioMetricsSchema.safeParse({ ...metrics, conversions_by_source: [ga4] }).success,
    ).toBe(true);
    expect(
      PortfolioMetricsSchema.safeParse({
        ...metrics,
        conversions_by_source: [{ ...ga4, coverage_pct: 1.2 }],
      }).success,
    ).toBe(false);
  });
});
