import { describe, expect, it } from 'bun:test';

import { paidRankedEntitySchema, paidRankingResponseSchema } from './ranking';

const sampleRow = {
  id: '123',
  name: 'Summer Sale',
  labels: { campaign: 'Q3 Promo' },
  metrics: {
    spend: 1200.5,
    roas: 3.12,
    impressions: 90000,
    clicks: 1500,
    conversions: 40,
    conversionValue: 3744,
    cpa: 30,
    costPerConversion: 30,
    ctr: 1.67,
    cpc: 0.8,
    cpm: 13.3,
  },
  rank: 1,
  kpi: 'roas',
  kpi_value: 3.12,
  kpi_unit: 'multiplier',
};

describe('paidRankedEntitySchema', () => {
  it('parses a representative ranked entity row', () => {
    const parsed = paidRankedEntitySchema.parse(sampleRow);
    expect(parsed.kpi).toBe('roas');
    expect(parsed.metrics.roas).toBe(3.12);
    expect(parsed.labels?.campaign).toBe('Q3 Promo');
  });

  it('rejects a row missing the ranking fields', () => {
    const result = paidRankedEntitySchema.safeParse({ id: '1', name: 'x', metrics: {} });
    expect(result.success).toBe(false);
  });

  it('tolerates extra numeric metrics via catchall', () => {
    const row = { ...sampleRow, metrics: { ...sampleRow.metrics, frequency: 1.4 } };
    expect(paidRankedEntitySchema.safeParse(row).success).toBe(true);
  });

  it('accepts an explicit level, hierarchy, path_label and parsed_name', () => {
    const parsed = paidRankedEntitySchema.parse({
      ...sampleRow,
      level: 'ad',
      hierarchy: {
        campaign: { id: '7', name: 'Spring Sale' },
        adset: { id: '45', name: 'LAL 1%' },
        ad: { id: '123', name: 'PROSP|Video|LAL1%' },
      },
      path_label: 'Spring Sale › LAL 1% › PROSP|Video|LAL1%',
      parsed_name: {
        schema_id: '11111111-1111-4111-8111-111111111111',
        schema_version: 1,
        delimiter: '|',
        matched: true,
        segments: ['PROSP', 'Video', 'LAL1%'],
        fields: { funnel: 'PROSP', format: 'Video', audience: 'LAL1%' },
      },
    });
    expect(parsed.level).toBe('ad');
    expect(parsed.hierarchy?.adset?.name).toBe('LAL 1%');
    expect(parsed.parsed_name?.fields.funnel).toBe('PROSP');
  });

  it('still parses a legacy row without the new identity fields', () => {
    expect(paidRankedEntitySchema.safeParse(sampleRow).success).toBe(true);
  });
});

describe('paidRankingResponseSchema', () => {
  it('parses the full ranking envelope', () => {
    const parsed = paidRankingResponseSchema.parse({
      scope: 'top_campaigns',
      kpi: 'roas',
      direction: 'top',
      limit: 5,
      rows: [sampleRow],
      total_rows_considered: 12,
      range: { preset: 'last_7d' },
    });
    expect(parsed.rows.length).toBe(1);
    expect(parsed.scope).toBe('top_campaigns');
  });

  it('parses a bare { rows } payload', () => {
    expect(paidRankingResponseSchema.safeParse({ rows: [] }).success).toBe(true);
  });
});

// PP-DT-E-home-google-results-absent (deep test 2026-10-31): the contract says it mirrors BOTH
// producers, but every real Google ranked row failed it — `metrics.byResult` is an object, and
// an ambiguous basis nulls conversions and their costs — so a Google ranking parsed to no rows.
// The deployed edge's real top_campaigns rows for Pink Elephant (6619636193, 2026-10-24..10-30,
// recorded 2026-10-31); the campaign names are replaced.
describe('paidRankedEntitySchema on Google rows', () => {
  const googleRow = {
    id: '22550284746',
    name: 'Courses 2025',
    level: 'campaign',
    hierarchy: { campaign: { id: '22550284746', name: 'Courses 2025' } },
    path_label: 'Courses 2025',
    labels: { channel_type: 'SEARCH' },
    metrics: {
      spend: 1204.7624,
      impressions: 1963,
      clicks: 106,
      conversions: 2,
      conversionValue: 0,
      roas: 0,
      cpa: 602.3812,
      costPerConversion: 602.3812,
      ctr: 5.3999,
      cpc: 11.3657,
      cpm: 613.7353,
      byResult: { leads: 2, purchases: 0, signups: 0 },
    },
    google: { status: 'ENABLED', budget_per_day: 200 },
    result_basis: { rule: 'google_conversion_rule_v1', bucket: 'leads', unambiguous: true },
    rank: 1,
    kpi: 'conversions',
    kpi_value: 2,
    kpi_unit: 'number',
  };

  it('parses a row that counted one business result, and keeps every result apart', () => {
    const parsed = paidRankedEntitySchema.parse(googleRow);
    expect(parsed.kpi_value).toBe(2);
    expect(parsed.metrics.byResult).toEqual({ leads: 2, purchases: 0, signups: 0 });
  });

  it('parses a row on an ambiguous basis: its null counts stay null, never zero', () => {
    const parsed = paidRankedEntitySchema.parse({
      ...googleRow,
      metrics: {
        ...googleRow.metrics,
        conversions: null,
        cpa: null,
        costPerConversion: null,
        byResult: { leads: 0, purchases: 0, signups: 0 },
      },
      result_basis: { rule: 'google_conversion_rule_v1', bucket: null, unambiguous: false },
      kpi: 'clicks',
      kpi_value: 106,
    });
    expect(parsed.metrics.conversions).toBeNull();
    expect(parsed.metrics.costPerConversion).toBeNull();
  });

  it('still refuses a metric that is neither a number nor a known shape', () => {
    const row = { ...googleRow, metrics: { ...googleRow.metrics, frequency: 'high' } };
    expect(paidRankedEntitySchema.safeParse(row).success).toBe(false);
  });
});
