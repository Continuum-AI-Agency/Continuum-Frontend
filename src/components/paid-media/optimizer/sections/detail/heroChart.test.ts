import { describe, expect, it } from 'bun:test';
import { boughtAnything, costOf, measureOf } from './heroChart';

// The FORMULARIOS pause that bought 8 leads at 75.65 each once drew "no results to divide by":
// every brief candidate carries `results_per_day: null`, and null was read as zero. These are
// the two readers every card visual now asks before it draws a zero.

describe('costOf — a day that bought nothing has no cost per result', () => {
  it('divides spend by results, to the cent', () => {
    expect(costOf({ date: '2026-09-01', spend: 100, results: 3 })).toBe(33.33);
  });

  it('is null, never zero, on a day with no results', () => {
    expect(costOf({ date: '2026-09-01', spend: 40, results: 0 })).toBeNull();
  });
});

describe('measureOf — the engine interval without its sentinels', () => {
  it('passes a bounded interval through', () => {
    expect(measureOf({ cpa: 75.65, lo: 38.39, hi: 175.24, events: 8 })).toEqual({
      results: 8,
      costPerResult: 75.65,
      low: 38.39,
      high: 175.24,
    });
  });

  it('reads the zero-event row as a measured zero with no cost to report', () => {
    expect(measureOf({ cpa: 0, lo: 0, hi: null, events: 0 })).toEqual({
      results: 0,
      costPerResult: null,
      low: null,
      high: null,
    });
  });

  it('is null when the cycle measured nothing', () => {
    expect(measureOf(null)).toBeNull();
    expect(measureOf(undefined)).toBeNull();
  });

  it('keeps an unknown event count unknown', () => {
    expect(measureOf({ cpa: 40, lo: 20, hi: 90 })?.results).toBeNull();
  });
});

describe('boughtAnything — null results mean unknown, never zero', () => {
  const measured = { results: 8, costPerResult: 75.65, low: 38.39, high: 175.24 };

  it('is unknown when the candidate is null and nothing was measured', () => {
    expect(boughtAnything({ results_per_day: null }, null)).toBeNull();
  });

  it('answers from the measure when the candidate is null', () => {
    expect(boughtAnything({ results_per_day: null }, measured)).toBe(true);
    expect(
      boughtAnything(
        { results_per_day: null },
        { results: 0, costPerResult: null, low: null, high: null },
      ),
    ).toBe(false);
  });

  it('takes a priced cost as proof of a denominator', () => {
    expect(
      boughtAnything(
        { results_per_day: null },
        { results: null, costPerResult: 40, low: null, high: null },
      ),
    ).toBe(true);
  });

  it('refuses to choose when the candidate and the measure disagree', () => {
    expect(boughtAnything({ results_per_day: 0 }, measured)).toBeNull();
  });
});
