import { describe, expect, test } from 'bun:test';
import {
  flightOf,
  pacingPlanFreshness,
  pacingPlanVersion,
  pacingPlanVersionOf,
} from './pacing-plan';
import { CycleRunPacingSchema } from './service';

// The figures of ledger PP-L3-pacing-period-budget-two-sources-disagree, MENSAJES // TODOS
// on 2026-10-09: the run paced the original October plan, the row held the 10-08 rebase.
const ORIGINAL_PLAN = {
  period_start: '2026-10-01',
  period_end: '2026-10-31',
  period_budget: 45000,
};
const REBASED_PLAN = { period_start: '2026-10-08', period_end: '2026-10-31', period_budget: 26101 };

describe('pacingPlanVersion — one derivation for the run stamp and the row', () => {
  test('a complete flight is spelled as start..end@budget', () => {
    expect(pacingPlanVersionOf(ORIGINAL_PLAN)).toBe('2026-10-01..2026-10-31@45000');
    expect(pacingPlanVersion(flightOf(REBASED_PLAN) as never)).toBe('2026-10-08..2026-10-31@26101');
  });

  test('a row without a complete flight has no plan, exactly where the scheduler would not pace', () => {
    expect(pacingPlanVersionOf({ ...ORIGINAL_PLAN, period_budget: null })).toBeNull();
    expect(pacingPlanVersionOf({ ...ORIGINAL_PLAN, period_budget: 0 })).toBeNull();
    expect(pacingPlanVersionOf({ ...ORIGINAL_PLAN, period_end: null })).toBeNull();
    expect(pacingPlanVersionOf({ ...ORIGINAL_PLAN, period_start: '2026-10' })).toBeNull();
    expect(pacingPlanVersionOf({})).toBeNull();
    expect(flightOf({})).toBeNull();
  });
});

describe('pacingPlanFreshness — the run block against the row it is read beside', () => {
  const run = (planVersion?: string, source = 'pacing') => ({ source, planVersion });

  test('the ledger case: a run on the original plan read beside the rebased row is stale', () => {
    expect(pacingPlanFreshness(run('2026-10-01..2026-10-31@45000'), REBASED_PLAN)).toEqual({
      freshness: 'stale',
      runPlan: '2026-10-01..2026-10-31@45000',
      currentPlan: '2026-10-08..2026-10-31@26101',
    });
  });

  test('the same plan on both sides is current', () => {
    expect(pacingPlanFreshness(run('2026-10-08..2026-10-31@26101'), REBASED_PLAN).freshness).toBe(
      'current',
    );
  });

  test('a flight cleared from the row leaves the run stale, not current', () => {
    const reading = pacingPlanFreshness(run('2026-10-01..2026-10-31@45000'), {});
    expect(reading.freshness).toBe('stale');
    expect(reading.currentPlan).toBeNull();
  });

  test('a run from before the stamp is unversioned: nothing can say either way', () => {
    expect(pacingPlanFreshness(run(undefined), REBASED_PLAN).freshness).toBe('unversioned');
  });

  test('a flat total never pretends to pace', () => {
    expect(pacingPlanFreshness(run(undefined, 'observed'), REBASED_PLAN).freshness).toBe(
      'not_pacing',
    );
    expect(pacingPlanFreshness(run('x', 'fixed'), REBASED_PLAN).freshness).toBe('not_pacing');
    expect(pacingPlanFreshness(null, REBASED_PLAN).freshness).toBe('not_pacing');
  });
});

describe('CycleRunPacingSchema keeps the stamp', () => {
  test('periodStart, periodEnd and planVersion survive the parse (declare-or-be-stripped)', () => {
    const parsed = CycleRunPacingSchema.parse({
      dailyTotal: 1087.5,
      idealCumulative: 10161,
      pacingRatio: 1.72,
      status: 'overpacing',
      note: 'Overpacing (172%)',
      source: 'pacing',
      periodBudget: 45000,
      periodDays: 31,
      dayIndex: 8,
      actualSpendToDate: 17480,
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      planVersion: '2026-10-01..2026-10-31@45000',
    });
    expect(parsed.planVersion).toBe('2026-10-01..2026-10-31@45000');
    expect(parsed.periodStart).toBe('2026-10-01');
    expect(parsed.periodEnd).toBe('2026-10-31');
    expect(pacingPlanFreshness(parsed, REBASED_PLAN).freshness).toBe('stale');
  });
});
