import { describe, expect, test } from 'bun:test';
import {
  allowedTargetMetrics,
  budgetFieldsFor,
  DAYS_PER_MONTH,
  deriveDailyTotal,
  derivePeriodBudget,
  flightDays,
  portfolioMetric,
} from './targetMetric';

describe('allowedTargetMetrics', () => {
  test('traffic may be priced per landing-page view (own) or per link click', () => {
    expect(allowedTargetMetrics('traffic')).toEqual(['traffic', 'link_clicks']);
  });
  test('link_clicks offers the stricter LPV as its alternative', () => {
    expect(allowedTargetMetrics('link_clicks')).toEqual(['link_clicks', 'traffic']);
  });
  test('every other objective is priced only in its own metric', () => {
    expect(allowedTargetMetrics('purchase')).toEqual(['purchase']);
    expect(allowedTargetMetrics('awareness')).toEqual(['awareness']);
    expect(allowedTargetMetrics('lead')).toEqual(['lead']);
  });
  test('the objective itself is always first (the default)', () => {
    for (const objective of ['traffic', 'link_clicks', 'purchase'] as const) {
      expect(allowedTargetMetrics(objective)[0]).toBe(objective);
    }
  });
});

describe('portfolioMetric', () => {
  test('absent target_metric reads in the objective own metric', () => {
    expect(portfolioMetric({ objective: 'traffic' }).costLabel).toBe('Cost per LPV');
  });
  test('null target_metric reads in the objective own metric', () => {
    expect(portfolioMetric({ objective: 'traffic', target_metric: null }).kpiField).toBe(
      'landingPageViews',
    );
  });
  test('a set target_metric re-keys the KPI field', () => {
    const metric = portfolioMetric({ objective: 'traffic', target_metric: 'link_clicks' });
    expect(metric.kpiField).toBe('linkClicks');
    expect(metric.costLabel).toBe('Cost per link click');
  });
});

describe('flightDays', () => {
  test('counts both ends', () => {
    expect(flightDays('2026-06-01', '2026-06-30')).toBe(30);
    expect(flightDays('2026-06-01', '2026-06-01')).toBe(1);
  });
  test('null when a date is missing, malformed, or the end precedes the start', () => {
    expect(flightDays(null, '2026-06-30')).toBeNull();
    expect(flightDays('2026-06-01', undefined)).toBeNull();
    expect(flightDays('june', '2026-06-30')).toBeNull();
    expect(flightDays('2026-06-30', '2026-06-01')).toBeNull();
  });
});

describe('derivePeriodBudget / deriveDailyTotal', () => {
  const start = '2026-06-01';
  const end = '2026-06-30'; // 30 days

  test('daily × flight days = period', () => {
    expect(derivePeriodBudget(8000, 'daily', start, end)).toBe(240_000);
    expect(deriveDailyTotal(8000, 'daily', start, end)).toBe(8000);
  });
  test('monthly is normalised on a 30-day month', () => {
    expect(DAYS_PER_MONTH).toBe(30);
    expect(derivePeriodBudget(240_000, 'monthly', start, end)).toBe(240_000);
    expect(deriveDailyTotal(240_000, 'monthly')).toBe(8000);
    // a 15-day flight on a monthly amount is half a month
    expect(derivePeriodBudget(240_000, 'monthly', '2026-06-01', '2026-06-15')).toBe(120_000);
  });
  test('total is the period itself; daily is total / flight days', () => {
    expect(derivePeriodBudget(240_000, 'total', start, end)).toBe(240_000);
    expect(deriveDailyTotal(240_000, 'total', start, end)).toBe(8000);
  });
  test('a flight-dependent derivation without a flight is null, not a guess', () => {
    expect(derivePeriodBudget(8000, 'daily')).toBeNull();
    expect(deriveDailyTotal(240_000, 'total')).toBeNull();
    // but a daily amount is a daily total regardless, and a total is a period regardless
    expect(deriveDailyTotal(8000, 'daily')).toBe(8000);
    expect(derivePeriodBudget(240_000, 'total')).toBe(240_000);
  });
  test('negative or non-finite amounts are refused', () => {
    expect(derivePeriodBudget(-1, 'total')).toBeNull();
    expect(deriveDailyTotal(Number.NaN, 'daily')).toBeNull();
  });
});

describe('budgetFieldsFor', () => {
  test('a monthly amount with a flight yields both stored fields', () => {
    expect(
      budgetFieldsFor({
        amount: 240_000,
        granularity: 'monthly',
        period_start: '2026-06-01',
        period_end: '2026-06-30',
      }),
    ).toEqual({ daily_total: 8000, period_budget: 240_000 });
  });
  test('a daily amount with no flight yields only the daily total (unpaced)', () => {
    expect(budgetFieldsFor({ amount: 8000, granularity: 'daily' })).toEqual({
      daily_total: 8000,
      period_budget: null,
    });
  });
});
