import { describe, expect, it } from 'bun:test';

import {
  currencySymbol,
  deriveCpa,
  deriveEfficiency,
  formatCpa,
  formatCurrency,
  humanize,
  nextCycleLabel,
  soonestNextCycle,
} from './format';

describe('formatCurrency', () => {
  it('formats whole-dollar USD', () => {
    expect(formatCurrency(4200)).toBe('$4,200');
  });
  it('returns a dash for null/NaN', () => {
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(Number.NaN)).toBe('—');
  });
  it('labels the account currency (a JPY account never reads as USD)', () => {
    expect(formatCurrency(4200, 'JPY')).toBe('¥4,200');
  });
  it('falls back to USD for a null/blank/malformed currency code', () => {
    expect(formatCurrency(4200, null)).toBe('$4,200');
    expect(formatCurrency(4200, '')).toBe('$4,200');
    expect(formatCurrency(4200, 'not-a-code')).toBe('$4,200');
  });
});

describe('currencySymbol', () => {
  it('returns the currency prefix for an input adornment', () => {
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('JPY')).toBe('¥');
  });
  it('falls back to the USD symbol for a missing code', () => {
    expect(currencySymbol(null)).toBe('$');
  });
});

describe('formatCpa', () => {
  it('rounds and formats', () => {
    expect(formatCpa(28.6)).toBe('$29');
  });
  it('guards non-finite', () => {
    expect(formatCpa(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatCpa(null)).toBe('—');
  });
});

describe('deriveCpa', () => {
  it('divides spend by conversions', () => {
    expect(deriveCpa(1000, 25)).toBe(40);
  });
  it('returns null when conversions are zero', () => {
    expect(deriveCpa(1000, 0)).toBeNull();
  });
});

describe('deriveEfficiency', () => {
  it('uses the denominator multiplier for CPM while preserving zero-result safety', () => {
    expect(deriveEfficiency(120, 10_000, 1_000)).toBe(12);
    expect(deriveEfficiency(120, 0, 1_000)).toBeNull();
  });
});

describe('humanize', () => {
  it('title-cases and de-underscores', () => {
    expect(humanize('app_install')).toBe('App install');
  });
  it('returns a dash for empty', () => {
    expect(humanize(null)).toBe('—');
  });
  it('labels apply-mode tiers with product copy', () => {
    expect(humanize('observe')).toBe('Observe · no writes');
    expect(humanize('recommend')).toBe('Recommend');
    expect(humanize('autopilot')).toBe('Autopilot');
  });
});

// "New actions appear here after the next optimization cycle" told a user nothing
// they could plan around, while next_realloc_at was already on the portfolio row.
describe('nextCycleLabel', () => {
  const now = new Date('2026-07-20T12:00:00.000Z');

  it('scales the unit to the distance', () => {
    expect(nextCycleLabel('2026-07-20T12:25:00.000Z', now)).toBe('in 25 minutes');
    expect(nextCycleLabel('2026-07-20T18:00:00.000Z', now)).toBe('in about 6 hours');
    expect(nextCycleLabel('2026-07-23T12:00:00.000Z', now)).toBe('in about 3 days');
  });

  it('singularises a one-unit distance', () => {
    expect(nextCycleLabel('2026-07-20T13:00:00.000Z', now)).toBe('in about 1 hour');
    expect(nextCycleLabel('2026-07-21T12:00:00.000Z', now)).toBe('in about 1 day');
  });

  it('says shortly rather than a negative or zero countdown', () => {
    expect(nextCycleLabel('2026-07-20T12:00:00.000Z', now)).toBe('shortly');
    expect(nextCycleLabel('2026-07-20T09:00:00.000Z', now)).toBe('shortly');
  });

  // The caller must be able to fall back to copy that promises nothing. Inventing
  // a schedule for a portfolio that has none is worse than staying vague.
  it('returns null when there is no usable schedule', () => {
    expect(nextCycleLabel(null, now)).toBeNull();
    expect(nextCycleLabel(undefined, now)).toBeNull();
    expect(nextCycleLabel('not-a-date', now)).toBeNull();
  });
});

describe('soonestNextCycle', () => {
  it('picks the earliest schedule across the portfolios', () => {
    expect(
      soonestNextCycle([
        { next_realloc_at: '2026-07-22T03:00:00.000Z' },
        { next_realloc_at: '2026-07-21T03:00:00.000Z' },
        { next_realloc_at: '2026-07-23T03:00:00.000Z' },
      ]),
    ).toBe('2026-07-21T03:00:00.000Z');
  });

  it('ignores portfolios with no schedule, and unparseable ones', () => {
    expect(
      soonestNextCycle([
        { next_realloc_at: null },
        { next_realloc_at: 'whenever' },
        { next_realloc_at: '2026-07-21T03:00:00.000Z' },
      ]),
    ).toBe('2026-07-21T03:00:00.000Z');
  });

  it('returns null when nothing is scheduled', () => {
    expect(soonestNextCycle([])).toBeNull();
    expect(soonestNextCycle([{ next_realloc_at: null }])).toBeNull();
  });
});
