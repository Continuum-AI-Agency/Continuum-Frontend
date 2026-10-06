import { describe, expect, it } from 'bun:test';
import {
  buildMetrics,
  EASY_FIT_MP1,
  GOOGLE_TOTALS,
  META_ONLY,
  META_TOTALS,
  TIKTOK_TOTALS,
} from './__fixtures__/accountPlatformMetrics';
import {
  buildPlatformComparison,
  cheapestSentence,
  type PlatformComparison,
} from './platformComparisonModel';

function comparison(frame = EASY_FIT_MP1): PlatformComparison {
  const built = buildPlatformComparison(frame);
  if (!built) throw new Error('no comparison');
  return built;
}

describe('buildPlatformComparison', () => {
  it('compares the result most platforms buy, one column per connected platform in order', () => {
    const row = comparison();
    expect(row.kind).toBe('leads');
    expect(row.columns.map((column) => column.platform)).toEqual([
      'meta',
      'google_ads',
      'tiktok_ads',
    ]);
  });

  it('gives every column the same four figures: spend, results, cost per result, share of results', () => {
    const [meta, google, tiktok] = comparison().columns;
    expect(meta).toMatchObject({
      currency: 'MXN',
      spend: 23911,
      results: 78,
      costPerResult: 41.3,
      shareOfResults: 78 / 214,
    });
    expect(google).toMatchObject({ spend: 11200, results: 118, costPerResult: 31.4 });
    expect(tiktok).toMatchObject({ spend: 3300, results: 18, costPerResult: 53 });
    expect(google?.shareOfResults).toBeCloseTo(118 / 214, 6);
  });

  it('names the cheapest platform, and marks only its column', () => {
    const row = comparison();
    expect(row.cheapest?.platform).toBe('google_ads');
    expect(row.columns.filter((column) => column.cheapest).map((c) => c.platform)).toEqual([
      'google_ads',
    ]);
    expect(cheapestSentence(row)).toBe(
      'Google buys leads cheapest: 31.40 MXN per lead, against 41.30 MXN on Meta and 53.00 MXN on TikTok.',
    );
  });

  it('totals the account in its one currency', () => {
    expect(comparison().totals).toEqual({
      currency: 'MXN',
      spend: 38411,
      results: 214,
      costPerResult: (3221.4 + 3705.2 + 954) / 214,
    });
  });

  it('shows only the connected platforms', () => {
    const row = comparison(buildMetrics([META_TOTALS, GOOGLE_TOTALS]));
    expect(row.columns.map((column) => column.platform)).toEqual(['meta', 'google_ads']);
  });

  it('is absent with fewer than two connected platforms — nothing to compare', () => {
    expect(buildPlatformComparison(META_ONLY)).toBeNull();
  });

  it('keeps a platform that bought none of the result as a column with no results and no cost', () => {
    const row = comparison(
      buildMetrics([
        META_TOTALS,
        GOOGLE_TOTALS,
        { ...TIKTOK_TOTALS, results_by_kind: [], unclassified_spend: 3300 },
      ]),
    );
    const tiktok = row.columns.find((column) => column.platform === 'tiktok_ads');
    expect(tiktok).toMatchObject({ results: null, costPerResult: null, shareOfResults: 0 });
  });

  it('never sums across currencies: no totals, no share, no cheapest, and it says so', () => {
    const row = comparison(
      buildMetrics([
        { ...META_TOTALS, share_of_spend: null },
        {
          ...GOOGLE_TOTALS,
          currency: 'USD',
          share_of_spend: null,
          accounts: [{ account_id: 'g', currency: 'USD', ingested: true }],
        },
      ]),
    );
    expect(row.currencies).toEqual(['MXN', 'USD']);
    expect(row.totals).toBeNull();
    expect(row.cheapest).toBeNull();
    expect(row.columns.map((column) => column.shareOfResults)).toEqual([null, null]);
    expect(row.columns.map((column) => column.currency)).toEqual(['MXN', 'USD']);
    expect(cheapestSentence(row)).toBe(
      'Meta bills in MXN and Google in USD, so their costs are not compared and nothing is added up.',
    );
  });

  it('says when only one platform bought the result at a cost', () => {
    const row = comparison(
      buildMetrics([
        META_TOTALS,
        {
          ...GOOGLE_TOTALS,
          results_by_kind: [],
          unclassified_spend: 11200,
        },
      ]),
    );
    expect(row.cheapest).toBeNull();
    expect(cheapestSentence(row)).toBe('Only Meta bought conversations at a cost in the window.');
  });
});
