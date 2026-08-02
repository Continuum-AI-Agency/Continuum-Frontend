import { describe, expect, it } from 'bun:test';

import {
  deltaTone,
  formatCompactNumber,
  formatDateRangeLabel,
  formatNumber,
  formatPercentChange,
  formatRate,
  formatShortDate,
  NO_DATA,
  percentChangeFrom,
  trendDirection,
} from './organic-format';

describe('NO_DATA', () => {
  it('is the single token every organic formatter falls back to', () => {
    expect(formatNumber(undefined)).toBe(NO_DATA);
    expect(formatCompactNumber(undefined)).toBe(NO_DATA);
    expect(formatRate(undefined)).toBe(NO_DATA);
    expect(formatPercentChange(undefined)).toBe(NO_DATA);
    expect(formatShortDate(undefined)).toBe(NO_DATA);
  });
});

describe('formatNumber', () => {
  it('groups full numbers and falls back when absent', () => {
    expect(formatNumber(12431)).toBe('12,431');
    expect(formatNumber(undefined)).toBe(NO_DATA);
    expect(formatNumber(Number.NaN)).toBe(NO_DATA);
  });
});

describe('formatCompactNumber', () => {
  it('renders compact notation', () => {
    expect(formatCompactNumber(12400)).toBe('12.4K');
    expect(formatCompactNumber(undefined)).toBe(NO_DATA);
  });
});

describe('formatRate', () => {
  it('renders a 0-100 rate as a percent', () => {
    expect(formatRate(68)).toBe('68%');
    expect(formatRate(undefined)).toBe(NO_DATA);
  });
});

describe('formatPercentChange', () => {
  it('signs the change without a hardcoded window suffix', () => {
    expect(formatPercentChange(12.34)).toBe('+12.3%');
    expect(formatPercentChange(-4)).toBe('-4.0%');
  });

  it('does not sign an exact zero — "+0.0%" reads as a measured gain', () => {
    expect(formatPercentChange(0)).toBe('0.0%');
  });

  it('falls back to the no-data token when there is no comparison', () => {
    expect(formatPercentChange(undefined)).toBe(NO_DATA);
    expect(formatPercentChange(Number.NaN)).toBe(NO_DATA);
  });
});

describe('trendDirection', () => {
  it('classifies a real change by sign', () => {
    expect(trendDirection(5)).toBe('up');
    expect(trendDirection(-5)).toBe('down');
  });

  it('reports an exact zero as flat — the comparison ran and found no change', () => {
    expect(trendDirection(0)).toBe('flat');
  });

  it('reports a missing comparison as unknown, never as flat', () => {
    expect(trendDirection(undefined)).toBe('unknown');
    expect(trendDirection(Number.NaN)).toBe('unknown');
  });
});

describe('deltaTone', () => {
  it('maps direction to a chart tone, treating unknown as neutral', () => {
    expect(deltaTone(5)).toBe('positive');
    expect(deltaTone(-5)).toBe('negative');
    expect(deltaTone(0)).toBe('flat');
    expect(deltaTone(undefined)).toBe('flat');
  });
});

describe('percentChangeFrom', () => {
  it('computes a signed percentage against the prior value', () => {
    expect(percentChangeFrom(120, 100)).toBe(20);
    expect(percentChangeFrom(80, 100)).toBe(-20);
    expect(percentChangeFrom(100, 100)).toBe(0);
  });

  it('has no answer when the baseline is zero — 0 to 10 is not "+100%"', () => {
    expect(percentChangeFrom(10, 0)).toBeUndefined();
    expect(percentChangeFrom(0, 0)).toBeUndefined();
  });

  it('has no answer for non-finite inputs', () => {
    expect(percentChangeFrom(Number.NaN, 10)).toBeUndefined();
    expect(percentChangeFrom(10, Number.NaN)).toBeUndefined();
  });
});

describe('formatShortDate', () => {
  it('names the calendar day the backend reported, independent of timezone', () => {
    expect(formatShortDate('2026-07-03')).toBe('Jul 3');
    expect(formatShortDate('2026-01-01')).toBe('Jan 1');
  });

  it('passes through an unparseable value rather than inventing a date', () => {
    expect(formatShortDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDateRangeLabel', () => {
  it('states a window in absolute dates', () => {
    expect(formatDateRangeLabel({ from: '2026-06-10', to: '2026-07-02' })).toBe('Jun 10 to Jul 2');
  });

  it('collapses a single-day window to one date', () => {
    expect(formatDateRangeLabel({ from: '2026-07-02', to: '2026-07-02' })).toBe('Jul 2');
  });

  it('falls back to the no-data token when there is no window', () => {
    expect(formatDateRangeLabel(null)).toBe(NO_DATA);
    expect(formatDateRangeLabel(undefined)).toBe(NO_DATA);
  });
});
