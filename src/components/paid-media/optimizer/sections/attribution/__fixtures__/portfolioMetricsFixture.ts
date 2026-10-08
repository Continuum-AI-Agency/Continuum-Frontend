// A PortfolioMetrics slice shaped like the frontend.html §3/§4 example (Leads // All platforms,
// 7 days, MXN), parsed through PortfolioMetricsSchema so a test can never render a slice the
// RPC could not have produced.

import {
  type AttributionKind,
  type ConversionsBySource,
  type PlatformMetricTotals,
  type PortfolioMetrics,
  PortfolioMetricsSchema,
} from '@continuum/contracts';

export const FIXTURE_READ_AT = '2026-09-28T09:00:00Z';
export const FIXTURE_NOW = new Date('2026-09-28T12:00:00Z');

function platformTotals(
  platform: PlatformMetricTotals['platform'],
  spend: number,
  results: number,
  conversions: number,
  entities: number,
): PlatformMetricTotals {
  return {
    platform,
    spend,
    impressions: 10_000,
    clicks: 200,
    results,
    cost_per_result: results > 0 ? spend / results : null,
    conversions,
    conversion_value: null,
    roas: null,
    delivering_entities: entities,
    entities,
  };
}

const PLATFORM_ROWS: PlatformMetricTotals[] = [
  platformTotals('meta', 3455, 78, 52, 9),
  platformTotals('google_ads', 4062, 118, 121, 3),
  platformTotals('tiktok_ads', 1300, 18, 14, 2),
];

function sourceRow(
  kind: AttributionKind,
  conversions: number,
  coverage: number,
): ConversionsBySource {
  return {
    kind,
    source_id: kind === 'platform' ? null : '7a1c6f0e-3b0f-4a55-9b1e-2a5f3b9e0c11',
    label: kind === 'platform' ? 'Each platform' : 'Client sheet',
    conversions,
    conversion_value: null,
    coverage_pct: coverage,
    refreshed_at: kind === 'platform' ? FIXTURE_READ_AT : '2026-09-28T09:00:00Z',
    error: null,
  };
}

type FixtureOptions = {
  used?: AttributionKind;
  configured?: AttributionKind;
  fallback?: 'none' | 'coverage' | 'error';
  platforms?: PlatformMetricTotals['platform'][];
  targetCpa?: number | null;
};

export function portfolioMetricsFixture(options: FixtureOptions = {}): PortfolioMetrics {
  const used = options.used ?? 'platform';
  const configured = options.configured ?? used;
  const platforms = options.platforms ?? ['meta', 'google_ads', 'tiktok_ads'];
  const rows = PLATFORM_ROWS.filter((row) => platforms.includes(row.platform));
  const sum = (pick: (row: PlatformMetricTotals) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const results = sum((row) => row.results);
  const conversions = used === 'platform' ? results : sum((row) => row.conversions);
  const byPlatform = rows.map((row) =>
    used === 'platform' ? { ...row, conversions: row.results } : row,
  );
  const sources = [sourceRow('platform', results, 1)];
  if (configured !== 'platform')
    sources.push(
      sourceRow(
        configured,
        sum((r) => r.conversions),
        0.92,
      ),
    );
  return PortfolioMetricsSchema.parse({
    portfolio_id: '0b8f0c55-1d2e-4c3b-8a9f-6e5d4c3b2a10',
    objective: 'lead',
    result_kind: 'leads',
    currency: 'MXN',
    window: {
      since: '2026-09-21',
      until: '2026-09-27',
      label: 'd7',
      ends_yesterday: used !== 'platform',
    },
    prior_window: null,
    attribution: { configured, used, fallback_reason: options.fallback ?? 'none' },
    totals: {
      spend: sum((row) => row.spend),
      impressions: sum((row) => row.impressions),
      clicks: sum((row) => row.clicks),
      results,
      cost_per_result: results > 0 ? sum((row) => row.spend) / results : null,
      conversions,
      conversion_value: null,
      roas: null,
      delivering_entities: sum((row) => row.delivering_entities),
      entities: sum((row) => row.entities),
    },
    prior_totals: null,
    target: { cpa: options.targetCpa === undefined ? 35 : options.targetCpa, metric: 'leads' },
    by_platform: byPlatform,
    conversions_by_source: sources,
    read_at: FIXTURE_READ_AT,
  });
}
