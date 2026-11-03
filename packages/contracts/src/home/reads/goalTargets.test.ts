import { describe, expect, it } from 'bun:test';
import {
  homeGoalPace,
  homeGoalPeriodWindow,
  homeGoalTargetSchema,
  homeGoalTargetUpsertRequestSchema,
} from './goalTargets';

const BRAND = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';

describe('homeGoalPeriodWindow', () => {
  it('a month runs from the first to the last calendar day of the month holding today', () => {
    expect(
      homeGoalPeriodWindow({ period: 'month', periodStart: null, periodEnd: null }, '2026-11-03'),
    ).toEqual({
      since: '2026-11-01',
      until: '2026-11-30',
      days: 30,
      elapsedDays: 3,
    });
  });

  it('a February month in a leap year has 29 days', () => {
    expect(
      homeGoalPeriodWindow({ period: 'month', periodStart: null, periodEnd: null }, '2028-02-10')
        .days,
    ).toBe(29);
  });

  it('a week is Monday to Sunday', () => {
    // 2026-11-03 is a Tuesday.
    expect(
      homeGoalPeriodWindow({ period: 'week', periodStart: null, periodEnd: null }, '2026-11-03'),
    ).toEqual({
      since: '2026-11-02',
      until: '2026-11-08',
      days: 7,
      elapsedDays: 2,
    });
  });

  it('a quarter is the calendar quarter holding today', () => {
    const w = homeGoalPeriodWindow(
      { period: 'quarter', periodStart: null, periodEnd: null },
      '2026-11-03',
    );
    expect([w.since, w.until, w.days]).toEqual(['2026-10-01', '2026-12-31', 92]);
  });

  it('a custom period uses its own dates and clamps elapsed days to the period', () => {
    const w = homeGoalPeriodWindow(
      { period: 'custom', periodStart: '2026-10-15', periodEnd: '2026-11-14' },
      '2026-12-01',
    );
    expect(w).toEqual({ since: '2026-10-15', until: '2026-11-14', days: 31, elapsedDays: 31 });
  });

  it('elapsed days are 0 before a custom period starts', () => {
    const w = homeGoalPeriodWindow(
      { period: 'custom', periodStart: '2026-12-01', periodEnd: '2026-12-31' },
      '2026-11-03',
    );
    expect(w.elapsedDays).toBe(0);
  });
});

describe('homeGoalPace', () => {
  it('compares the actual with the share of the target the elapsed days owe, and projects linearly', () => {
    const pace = homeGoalPace({ target: 300, actual: 26, days: 30, elapsedDays: 3 });
    expect(pace.expectedToDate).toBe(30);
    expect(pace.paceRatio).toBeCloseTo(26 / 30, 6);
    expect(pace.projected).toBeCloseTo(260, 6);
    expect(pace.progress).toBeCloseTo(26 / 300, 6);
  });

  it('has no pace and no projection before the period starts', () => {
    const pace = homeGoalPace({ target: 300, actual: 0, days: 30, elapsedDays: 0 });
    expect(pace.paceRatio).toBeNull();
    expect(pace.projected).toBeNull();
  });
});

describe('homeGoalTargetUpsertRequestSchema', () => {
  const base = {
    brandId: BRAND,
    objectiveId: 'tours',
    metric: 'purchases',
    target: 120,
    period: 'month',
  };

  it('defaults the scope to the brand', () => {
    expect(homeGoalTargetUpsertRequestSchema.parse(base).scope).toBe('brand');
  });

  it('refuses a target that is not positive', () => {
    expect(homeGoalTargetUpsertRequestSchema.safeParse({ ...base, target: 0 }).success).toBe(false);
  });

  it('a custom period needs both dates, in order', () => {
    expect(homeGoalTargetUpsertRequestSchema.safeParse({ ...base, period: 'custom' }).success).toBe(
      false,
    );
    expect(
      homeGoalTargetUpsertRequestSchema.safeParse({
        ...base,
        period: 'custom',
        periodStart: '2026-11-30',
        periodEnd: '2026-11-01',
      }).success,
    ).toBe(false);
    expect(
      homeGoalTargetUpsertRequestSchema.safeParse({
        ...base,
        period: 'custom',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
      }).success,
    ).toBe(true);
  });

  it('a calendar period carries no dates of its own', () => {
    expect(
      homeGoalTargetUpsertRequestSchema.safeParse({
        ...base,
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
      }).success,
    ).toBe(false);
  });

  it('a currency metric names its currency, a count metric does not', () => {
    expect(
      homeGoalTargetUpsertRequestSchema.safeParse({
        ...base,
        metric: 'purchase_value',
        currency: null,
      }).success,
    ).toBe(false);
    expect(
      homeGoalTargetUpsertRequestSchema.safeParse({
        ...base,
        metric: 'purchase_value',
        currency: 'MXN',
      }).success,
    ).toBe(true);
    expect(homeGoalTargetUpsertRequestSchema.safeParse({ ...base, currency: 'MXN' }).success).toBe(
      false,
    );
  });
});

describe('homeGoalTargetSchema', () => {
  it('parses a stored target', () => {
    expect(
      homeGoalTargetSchema.parse({
        scope: 'brand',
        objectiveId: 'tours',
        metric: 'purchases',
        target: 120,
        period: 'month',
        periodStart: null,
        periodEnd: null,
        currency: null,
        updatedAt: '2026-11-03T12:00:00Z',
        updatedBy: null,
      }).target,
    ).toBe(120);
  });
});
