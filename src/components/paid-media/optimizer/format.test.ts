import { describe, expect, it } from 'bun:test';

import {
  currencySymbol,
  deriveCpa,
  deriveEfficiency,
  formatCpa,
  formatCurrency,
  formatHeadline,
  formatPercent,
  formatPerPeriod,
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

describe('the impact vocabulary', () => {
  it('says a daily figure in the two periods a person thinks in', () => {
    expect(formatPerPeriod(96)).toBe('$96/day · $2,880/mo');
  });

  it('honours the ad account\u2019s own currency on both halves', () => {
    expect(formatPerPeriod(100, 'EUR')).toContain('/day');
    expect(formatPerPeriod(100, 'EUR')).toContain('/mo');
  });

  it('returns a dash rather than inventing a month for a figure it does not have', () => {
    expect(formatPerPeriod(null)).toBe('—');
    expect(formatPerPeriod(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('prints a percentage that is ALREADY a percentage, and never multiplies', () => {
    // 33 is 33%. A formatter that multiplies is one that eventually doubles.
    expect(formatPercent(33)).toBe('33%');
    expect(formatPercent(33.4, { fractionDigits: 1 })).toBe('33.4%');
    expect(formatPercent(18, { signed: true })).toBe('+18%');
    expect(formatPercent(null)).toBe('—');
  });

  it('formats a headline by its unit and leaves the detector\u2019s words alone', () => {
    expect(
      formatHeadline({
        kind: 'efficiency',
        value: 33,
        unit: 'percent',
        label: 'cheaper per result',
        from: 90,
        to: 60,
      }),
    ).toEqual({ figure: '33%', label: 'cheaper per result' });

    expect(
      formatHeadline({
        kind: 'avoided',
        value: 96,
        unit: 'currency_per_day',
        label: 'a day buying nothing',
        from: null,
        to: null,
      }),
    ).toEqual({ figure: '$96', label: 'a day buying nothing' });

    expect(
      formatHeadline({
        kind: 'count',
        value: 1200,
        unit: 'count',
        label: 'results a week, combined',
        from: null,
        to: 50,
      }),
    ).toEqual({ figure: '1,200', label: 'results a week, combined' });
  });
});
