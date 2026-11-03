import { describe, expect, it } from 'bun:test';
import { type HomeObjective, homeGoalTargetUpsertRequestSchema } from '@continuum/contracts';
import { BRAND_ID, goalTarget, MTD_NOW } from './__fixtures__/monthToDate';
import type { GoalAmount } from './goalModel';
import {
  goalPaceWords,
  goalTargetComparison,
  goalTargetFor,
  goalTargetPeriod,
  goalTargetRequest,
} from './goalTargetModel';

const LEADS: HomeObjective = { id: 'leads', label: 'Leads', metric: 'leads', role: 'primary' };
const at = (iso: string) => new Date(`${iso}T15:00:00Z`);
const amount = (currency: string | null, value: number): GoalAmount => ({
  currency,
  value,
  series: [],
  accountCount: 1,
});

describe('goalTargetPeriod', () => {
  it('reads a week from its Monday through yesterday, counting complete days only', () => {
    // Nov 3 2026 is a Tuesday: only Monday is complete.
    expect(goalTargetPeriod(goalTarget({ period: 'week' }), MTD_NOW, 'UTC')).toEqual({
      since: '2026-11-02',
      until: '2026-11-08',
      days: 7,
      elapsedDays: 1,
      readWindow: { since: '2026-11-02', until: '2026-11-02' },
      phase: 'running',
    });
  });

  it('reads a month from the 1st through yesterday', () => {
    expect(goalTargetPeriod(goalTarget({ period: 'month' }), MTD_NOW, 'UTC')).toMatchObject({
      since: '2026-11-01',
      until: '2026-11-30',
      days: 30,
      elapsedDays: 2,
      readWindow: { since: '2026-11-01', until: '2026-11-02' },
    });
  });

  it('reads a quarter from its first day, past the start of the month', () => {
    expect(goalTargetPeriod(goalTarget({ period: 'quarter' }), MTD_NOW, 'UTC')).toMatchObject({
      since: '2026-10-01',
      until: '2026-12-31',
      days: 92,
      elapsedDays: 33,
      readWindow: { since: '2026-10-01', until: '2026-11-02' },
    });
  });

  it('stays in the period today is in on its first day: no complete day, never last month', () => {
    expect(goalTargetPeriod(goalTarget({ period: 'month' }), at('2026-11-01'), 'UTC')).toEqual({
      since: '2026-11-01',
      until: '2026-11-30',
      days: 30,
      elapsedDays: 0,
      readWindow: null,
      phase: 'started-today',
    });
    expect(goalTargetPeriod(goalTarget({ period: 'week' }), at('2026-11-02'), 'UTC').phase).toBe(
      'started-today',
    );
  });

  it('a quarter already running on the 1st of a month has complete days', () => {
    expect(
      goalTargetPeriod(goalTarget({ period: 'quarter' }), at('2026-11-01'), 'UTC'),
    ).toMatchObject({
      elapsedDays: 31,
      readWindow: { since: '2026-10-01', until: '2026-10-31' },
      phase: 'running',
    });
  });

  const custom = (periodStart: string, periodEnd: string) =>
    goalTarget({ period: 'custom', periodStart, periodEnd });

  it('has not started before a custom period opens', () => {
    expect(goalTargetPeriod(custom('2026-12-01', '2026-12-31'), MTD_NOW, 'UTC')).toMatchObject({
      elapsedDays: 0,
      readWindow: null,
      phase: 'upcoming',
    });
  });

  it('clips a running custom period at yesterday', () => {
    expect(goalTargetPeriod(custom('2026-10-20', '2026-11-20'), MTD_NOW, 'UTC')).toMatchObject({
      days: 32,
      elapsedDays: 14,
      readWindow: { since: '2026-10-20', until: '2026-11-02' },
      phase: 'running',
    });
  });

  it('reads an ended custom period whole', () => {
    expect(goalTargetPeriod(custom('2026-10-01', '2026-10-31'), MTD_NOW, 'UTC')).toMatchObject({
      days: 31,
      elapsedDays: 31,
      readWindow: { since: '2026-10-01', until: '2026-10-31' },
      phase: 'ended',
    });
  });

  it('counts a period ending yesterday as ended', () => {
    expect(goalTargetPeriod(custom('2026-10-20', '2026-11-02'), MTD_NOW, 'UTC').phase).toBe(
      'ended',
    );
  });
});

describe('goalTargetFor', () => {
  it('matches the objective by id and metric at brand scope', () => {
    const target = goalTarget();
    expect(goalTargetFor([target], LEADS)).toBe(target);
  });

  it('ignores another metric under the same id, and another scope', () => {
    expect(goalTargetFor([goalTarget({ metric: 'clicks' })], LEADS)).toBeNull();
    expect(goalTargetFor([goalTarget({ scope: 'act_1001' })], LEADS)).toBeNull();
    expect(goalTargetFor([goalTarget({ objectiveId: 'other' })], LEADS)).toBeNull();
  });
});

describe('goalTargetComparison', () => {
  const weekly = goalTarget();
  const period = goalTargetPeriod(weekly, MTD_NOW, 'UTC');

  it('owes only the complete days: one of seven', () => {
    const compared = goalTargetComparison({ target: weekly, period }, [amount(null, 8)]);
    expect(compared).toMatchObject({
      kind: 'compared',
      actual: 8,
      progress: 8 / 70,
      expectedToDate: 10,
      paceRatio: 0.8,
    });
  });

  it('carries no projection', () => {
    const compared = goalTargetComparison({ target: weekly, period }, [amount(null, 8)]);
    expect(compared).not.toHaveProperty('projected');
  });

  it('compares money only in the target’s own currency', () => {
    const money = goalTarget({
      metric: 'spend',
      objectiveId: 'spend',
      currency: 'USD',
      target: 700,
    });
    const active = { target: money, period };
    expect(goalTargetComparison(active, [amount('MXN', 5000)])).toEqual({
      kind: 'mismatch',
      target: money,
      period,
      figureCurrencies: ['MXN'],
    });
    expect(goalTargetComparison(active, [amount('MXN', 5000), amount('USD', 100)])).toMatchObject({
      kind: 'compared',
      actual: 100,
      amount: { currency: 'USD' },
    });
  });

  it('never compares money against a figure of unknown currency', () => {
    const money = goalTarget({
      metric: 'spend',
      objectiveId: 'spend',
      currency: 'USD',
      target: 700,
    });
    expect(goalTargetComparison({ target: money, period }, [amount(null, 5000)]).kind).toBe(
      'mismatch',
    );
  });
});

describe('goalPaceWords', () => {
  it('says ahead from 3%, below from 6%, on pace between', () => {
    expect(goalPaceWords(1.03)).toBe('3% ahead of pace');
    expect(goalPaceWords(1.02)).toBe('On pace');
    expect(goalPaceWords(0.95)).toBe('On pace');
    expect(goalPaceWords(0.94)).toBe('6% below pace');
    expect(goalPaceWords(0.8)).toBe('20% below pace');
  });
});

describe('goalTargetRequest', () => {
  const fields = {
    brandId: BRAND_ID,
    objective: LEADS,
    target: '70',
    period: 'week' as const,
    periodStart: '',
    periodEnd: '',
    currency: '',
  };
  const REVENUE: HomeObjective = {
    id: 'purchase_value',
    label: 'Revenue',
    metric: 'purchase_value',
    role: 'primary',
  };

  it('builds a count target the upsert schema accepts, with no currency or dates', () => {
    const built = goalTargetRequest(fields);
    if (!built.ok) throw new Error(built.message);
    expect(homeGoalTargetUpsertRequestSchema.safeParse(built.request).success).toBe(true);
    expect(built.request).toEqual({
      brandId: BRAND_ID,
      scope: 'brand',
      objectiveId: 'leads',
      metric: 'leads',
      target: 70,
      period: 'week',
      periodStart: null,
      periodEnd: null,
      currency: null,
    });
  });

  it('names the currency of a money target, in capitals', () => {
    const built = goalTargetRequest({ ...fields, objective: REVENUE, currency: 'mxn' });
    expect(built.ok && built.request.currency).toBe('MXN');
  });

  it('keeps the dates of a custom period', () => {
    const built = goalTargetRequest({
      ...fields,
      period: 'custom',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-15',
    });
    expect(built.ok && [built.request.periodStart, built.request.periodEnd]).toEqual([
      '2026-11-01',
      '2026-11-15',
    ]);
  });

  it('drops stale dates when the period is no longer custom', () => {
    const built = goalTargetRequest({
      ...fields,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-15',
    });
    expect(built.ok && built.request.periodStart).toBeNull();
  });

  it('refuses what the Backend would refuse, in the contract’s words', () => {
    const refused = (overrides: Partial<typeof fields>) => {
      const built = goalTargetRequest({ ...fields, ...overrides });
      return built.ok ? null : built.message;
    };
    expect(refused({ target: '' })).toBe('Enter a target above zero.');
    expect(refused({ target: '0' })).toBe('Enter a target above zero.');
    expect(refused({ target: 'abc' })).toBe('Enter a target above zero.');
    expect(refused({ period: 'custom' })).toBe('A custom period needs a start and an end date.');
    expect(refused({ period: 'custom', periodStart: '2026-11-15', periodEnd: '2026-11-01' })).toBe(
      'The period ends before it starts.',
    );
    expect(refused({ objective: REVENUE })).toBe('A money target names its currency.');
  });
});
