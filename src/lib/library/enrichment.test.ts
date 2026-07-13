import { describe, expect, test } from 'bun:test';
import { MAX_ENRICH_PER_CALL, needsEnrichment, selectAssetsNeedingEnrichment } from './enrichment';

describe('needsEnrichment', () => {
  test("a 'stored' asset has never been analysed — enrich it", () => {
    expect(needsEnrichment({ status: 'stored' })).toBe(true);
  });

  test('an asset already analysing is left alone — enqueuing twice burns tokens twice', () => {
    expect(needsEnrichment({ status: 'analyzing' })).toBe(false);
  });

  test('a ready asset already has its metadata', () => {
    expect(needsEnrichment({ status: 'ready' })).toBe(false);
  });

  test('an errored asset is NOT re-driven from every page view — analyze_media owns its own retries', () => {
    expect(needsEnrichment({ status: 'error' })).toBe(false);
  });

  test("'skipped_free' is a billing decision, and it is honoured", () => {
    expect(needsEnrichment({ status: 'skipped_free' })).toBe(false);
  });
});

describe('selectAssetsNeedingEnrichment', () => {
  test('picks only the un-analysed ones', () => {
    const picked = selectAssetsNeedingEnrichment(
      [
        { id: 'a', status: 'stored' },
        { id: 'b', status: 'ready' },
        { id: 'c', status: 'stored' },
        { id: 'd', status: 'analyzing' },
      ],
      10,
    );
    expect(picked.map((a) => a.id)).toEqual(['a', 'c']);
  });

  test('caps the fan-out — a careless caller cannot turn one click into a bill', () => {
    const many = Array.from({ length: 100 }, (_unused, index) => ({
      id: `a${index}`,
      status: 'stored',
    }));
    expect(selectAssetsNeedingEnrichment(many, MAX_ENRICH_PER_CALL)).toHaveLength(
      MAX_ENRICH_PER_CALL,
    );
  });

  test('an already-enriched library enqueues nothing at all', () => {
    const picked = selectAssetsNeedingEnrichment(
      [
        { id: 'a', status: 'ready' },
        { id: 'b', status: 'ready' },
      ],
      10,
    );
    expect(picked).toEqual([]);
  });
});
