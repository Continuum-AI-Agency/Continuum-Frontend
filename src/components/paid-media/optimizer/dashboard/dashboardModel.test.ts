import { describe, expect, it } from 'bun:test';
import { configFixture } from './__fixtures__/easyfitPayload';
import {
  balanceMix,
  chipThresholds,
  costTone,
  monthState,
  percentChange,
  simulate,
  zonedDate,
} from './dashboardModel';

describe('monthState', () => {
  it('reads a month as upcoming, in progress, maturing until the 15th, then closed', () => {
    expect(monthState('2026-12', '2026-11-01')).toBe('upcoming');
    expect(monthState('2026-11', '2026-11-01')).toBe('inProgress');
    expect(monthState('2026-11', '2026-11-30')).toBe('inProgress');
    expect(monthState('2026-10', '2026-11-01')).toBe('maturing');
    expect(monthState('2026-10', '2026-11-14')).toBe('maturing');
    expect(monthState('2026-10', '2026-11-15')).toBe('closed');
  });

  it('crosses the year boundary', () => {
    expect(monthState('2026-12', '2027-01-10')).toBe('maturing');
    expect(monthState('2027-01', '2026-12-31')).toBe('upcoming');
  });
});

describe('costTone', () => {
  const thresholds = { verde_max: 1000, rojo_min: 1300 };
  it('is green at or under the good bound, red at or over the bad bound, neutral between', () => {
    expect(costTone(1000, thresholds)).toBe('good');
    expect(costTone(1001, thresholds)).toBe('neutral');
    expect(costTone(1300, thresholds)).toBe('bad');
  });
});

describe('simulate', () => {
  const rates = { dayPass: 5, annual: 8.1, cheapFirstMonth: 2 };

  it('reproduces the prototype brief: $110,000 at $61, half DayPass, gives ~63 Meta sign-ups of 115', () => {
    const result = simulate(
      {
        budgetTotal: 110_000,
        googleSpend: 0,
        costPerContact: 61,
        pctDayPass: 50,
        pctAnnual: 0,
        metaSignupGoal: 115,
      },
      rates,
    );
    expect(Math.round(result.contacts)).toBe(1803);
    expect(Math.round(result.metaSignups)).toBe(63);
    expect(result.verdict).toBe('short');
    expect(Math.round(result.shortfall)).toBe(52);
    expect(Math.floor(result.costPerContactNeeded)).toBe(33);
  });

  it('takes Google out of the Meta spend, never more than the budget', () => {
    const result = simulate(
      {
        budgetTotal: 50_000,
        googleSpend: 80_000,
        costPerContact: 50,
        pctDayPass: 0,
        pctAnnual: 0,
        metaSignupGoal: 10,
      },
      rates,
    );
    expect(result.metaSpend).toBe(0);
    expect(result.costPerMetaSignup).toBeNull();
  });

  it('says close from 80% of the goal and reaches at the goal', () => {
    const base = { budgetTotal: 100_000, googleSpend: 0, costPerContact: 50, pctAnnual: 0 };
    // 2,000 contacts × 5/100 = 100 sign-ups.
    expect(simulate({ ...base, pctDayPass: 100, metaSignupGoal: 100 }, rates).verdict).toBe(
      'reaches',
    );
    expect(simulate({ ...base, pctDayPass: 100, metaSignupGoal: 125 }, rates).verdict).toBe(
      'close',
    );
    expect(simulate({ ...base, pctDayPass: 100, metaSignupGoal: 126 }, rates).verdict).toBe(
      'short',
    );
  });
});

describe('balanceMix', () => {
  it('lets the slider that moved keep its value when the two pass 100%', () => {
    expect(balanceMix(70, 50, 'annual')).toEqual({ pctDayPass: 50, pctAnnual: 50 });
    expect(balanceMix(70, 50, 'dayPass')).toEqual({ pctDayPass: 70, pctAnnual: 30 });
    expect(balanceMix(40, 30, 'dayPass')).toEqual({ pctDayPass: 40, pctAnnual: 30 });
  });
});

describe('zonedDate', () => {
  it('cuts an instant on the Mexico City calendar and keeps a bare date as is', () => {
    expect(zonedDate('2026-11-01T03:00:00Z', 'America/Mexico_City')).toBe('2026-10-31');
    expect(zonedDate('2026-11-01T15:00:00-06:00', 'America/Mexico_City')).toBe('2026-11-01');
    expect(zonedDate('2026-11-01', 'America/Mexico_City')).toBe('2026-11-01');
  });
});

describe('percentChange', () => {
  it('is the change over a base, and nothing without one', () => {
    expect(percentChange(1100, 1000)).toBeCloseTo(10);
    expect(percentChange(5, null)).toBeNull();
    expect(percentChange(5, 0)).toBeNull();
  });
});

describe('chipThresholds', () => {
  it('reads the config thresholds and falls back to the docs/05 defaults without a config', () => {
    const fromConfig = chipThresholds(configFixture);
    const defaults = chipThresholds(null);

    expect(fromConfig.costo_alta_meta).toEqual({ verde_max: 1000, rojo_min: 1300 });
    expect(defaults.costo_alta_meta_quincena).toEqual({ verde_max: 960, rojo_min: 1500 });
    expect(defaults.costo_tour).toEqual({ verde_max: 300, rojo_min: 600 });
  });
});
