import { describe, expect, it } from 'bun:test';

import {
  currencyFieldSuffix,
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
  it('formats a USD figure at or above 100 whole', () => {
    expect(formatCurrency(4200, 'USD')).toBe('$4,200');
  });
  it('returns a dash for null/NaN/non-finite', () => {
    expect(formatCurrency(null, 'USD')).toBe('—');
    expect(formatCurrency(Number.NaN, 'USD')).toBe('—');
    expect(formatCurrency(Number.POSITIVE_INFINITY, 'USD')).toBe('—');
  });

  // The whole point. Four live production accounts are Mexican and carry no currency code;
  // printing "$324" beside a peso figure tells a client they spent twenty dollars a day when
  // they spent twenty pesos. A bare figure is the same answer the compiled card gives.
  describe('an unknown currency is never asserted as dollars', () => {
    it('prints the bare figure for a null, blank or malformed code', () => {
      expect(formatCurrency(4200, null)).toBe('4,200');
      expect(formatCurrency(4200, undefined)).toBe('4,200');
      expect(formatCurrency(4200, '')).toBe('4,200');
      expect(formatCurrency(4200, 'not-a-code')).toBe('4,200');
    });
    it('appends the ISO code for a currency that is not dollars', () => {
      expect(formatCurrency(324, 'MXN')).toBe('324 MXN');
      expect(formatCurrency(4200, 'jpy')).toBe('4,200 JPY');
    });
  });

  // `money()` in @continuum/contracts — the compiled card of the same finding — uses 2
  // decimals under 100 and 0 at or above it. Same rule here, or the screen prints "$26/day"
  // beside the card's "$25.54/day" for one number.
  describe('the digit rule is the compiled card\u2019s', () => {
    it('keeps cents under 100 and drops them at 100 and above', () => {
      expect(formatCurrency(25.540000000000003, 'USD')).toBe('$25.54');
      expect(formatCurrency(99.999, 'USD')).toBe('$100.00');
      expect(formatCurrency(100, 'USD')).toBe('$100');
      expect(formatCurrency(766.2, 'USD')).toBe('$766');
    });
    it('carries the rule through to a bare and a coded figure', () => {
      expect(formatCurrency(25.54, null)).toBe('25.54');
      expect(formatCurrency(25.54, 'MXN')).toBe('25.54 MXN');
    });
    it('keeps the sign outside the unit', () => {
      expect(formatCurrency(-25.54, 'USD')).toBe('-$25.54');
      expect(formatCurrency(-4200, 'MXN')).toBe('-4,200 MXN');
      expect(formatCurrency(-4200, null)).toBe('-4,200');
    });
  });
});

describe('currencySymbol', () => {
  it('returns the currency prefix for an input adornment', () => {
    expect(currencySymbol('USD')).toBe('$');
  });
  it('uses the ISO code for a non-dollar account, the spelling the figures use', () => {
    expect(currencySymbol('MXN')).toBe('MXN');
  });
  it('returns nothing at all for a missing code', () => {
    expect(currencySymbol(null)).toBe('');
    expect(currencySymbol('not-a-code')).toBe('');
  });
});

describe('currencyFieldSuffix', () => {
  it('parenthesises a known unit', () => {
    expect(currencyFieldSuffix('USD')).toBe(' ($)');
    expect(currencyFieldSuffix('MXN')).toBe(' (MXN)');
  });
  it('leaves a label alone when the account carries no code', () => {
    expect(currencyFieldSuffix(null)).toBe('');
  });
});

describe('formatCpa', () => {
  it('prints a sub-100 cost to the cent rather than rounding it away', () => {
    expect(formatCpa(28.6, 'USD')).toBe('$28.60');
  });
  it('honours an unknown currency', () => {
    expect(formatCpa(28.6, null)).toBe('28.60');
  });
  it('guards non-finite', () => {
    expect(formatCpa(Number.POSITIVE_INFINITY, 'USD')).toBe('—');
    expect(formatCpa(null, 'USD')).toBe('—');
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
    expect(formatPerPeriod(96, 'USD')).toBe('$96.00/day · $2,880/mo');
  });

  it('honours the ad account\u2019s own currency on both halves', () => {
    expect(formatPerPeriod(100, 'EUR')).toBe('100 EUR/day · 3,000 EUR/mo');
  });

  // The pair used to read "$26/day · $766/mo": `perPeriod` passes the day through unrounded
  // and cent-rounds the month, and a formatter fixed at 0 decimals rounded 25.54 to 26. A
  // reader who multiplied got 780. The day is not rounded to fix it — six render sites share
  // `perPeriod` with the compiled card, which prints $25.54 correctly.
  it('states a day and a month that multiply', () => {
    expect(formatPerPeriod(25.54, 'USD')).toBe('$25.54/day · $766/mo');
    expect(formatPerPeriod(25.54, null)).toBe('25.54/day · 766/mo');
  });

  it('returns a dash rather than inventing a month for a figure it does not have', () => {
    expect(formatPerPeriod(null, 'USD')).toBe('—');
    expect(formatPerPeriod(Number.POSITIVE_INFINITY, 'USD')).toBe('—');
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
      formatHeadline(
        {
          kind: 'efficiency',
          value: 33,
          unit: 'percent',
          label: 'cheaper per result',
          from: 90,
          to: 60,
        },
        'USD',
      ),
    ).toEqual({ figure: '33%', label: 'cheaper per result' });

    expect(
      formatHeadline(
        {
          kind: 'avoided',
          value: 96,
          unit: 'currency_per_day',
          label: 'a day buying nothing',
          from: null,
          to: null,
        },
        'USD',
      ),
    ).toEqual({ figure: '$96.00', label: 'a day buying nothing' });

    expect(
      formatHeadline(
        {
          kind: 'avoided',
          value: 96,
          unit: 'currency_per_day',
          label: 'a day buying nothing',
          from: null,
          to: null,
        },
        null,
      ),
    ).toEqual({ figure: '96.00', label: 'a day buying nothing' });

    expect(
      formatHeadline(
        {
          kind: 'count',
          value: 1200,
          unit: 'count',
          label: 'results a week, combined',
          from: null,
          to: 50,
        },
        null,
      ),
    ).toEqual({ figure: '1,200', label: 'results a week, combined' });
  });
});
