// Scale mode's growth plan and the pacing state the cycle now carries.
//
// Before this, 'scale' only grew when the caller set a CEILING (maxBudget) — a growth
// step alone did nothing, the scheduler passed neither, and the persisted pacing row kept
// the verdict but dropped the flight state it was computed from. These pin the contract
// the scheduler and the dashboard now rely on.
import { describe, expect, test } from 'bun:test';
import type { AdSetSnapshot, WindowMetrics } from '../src/index';
import { computePacing, runCycle } from '../src/index';

const win = (spend: number, purchases: number): WindowMetrics => ({
  spend,
  purchases,
  addToCarts: 0,
  clicks: 0,
  impressions: 0,
});

/** Two healthy ad sets buying purchases at $10 each — well under any sane target. */
function fleet(): AdSetSnapshot[] {
  return [
    {
      id: 'a',
      status: 'active',
      currentBudget: 100,
      ageDays: 40,
      windows: { d3: win(30, 3), d7: win(70, 7), d14: win(140, 14) },
    },
    {
      id: 'b',
      status: 'active',
      currentBudget: 100,
      ageDays: 40,
      windows: { d3: win(30, 3), d7: win(70, 7), d14: win(140, 14) },
    },
  ];
}

const TOTAL = 200;

describe('runCycle — scale mode growth plan', () => {
  test('a growth step alone grows the total (no ceiling required)', () => {
    const r = runCycle(fleet(), {
      mode: 'scale',
      total: TOTAL,
      weeklyGrowthPct: 0.1,
      config: { cpaTarget: 50 },
    });
    expect(r.scale?.stepped).toBe(true);
    expect(r.scale?.from).toBe(TOTAL);
    expect(r.scale?.to).toBeCloseTo(TOTAL * 1.1, 6);
    expect(r.scale?.ceiling).toBeNull();
    expect(r.reallocation.totalBudget).toBeCloseTo(TOTAL * 1.1, 6);
    expect(r.scale?.reason).toMatch(/grown 10%/);
  });

  test('the ceiling clamps the step and the reason says so', () => {
    const r = runCycle(fleet(), {
      mode: 'scale',
      total: TOTAL,
      weeklyGrowthPct: 0.5,
      maxBudget: 250,
      config: { cpaTarget: 50 },
    });
    expect(r.scale?.stepped).toBe(true);
    expect(r.scale?.to).toBe(250);
    expect(r.scale?.ceiling).toBe(250);
    expect(r.scale?.reason).toMatch(/capped at the ceiling/);
  });

  test('a ceiling alone keeps the historical 5% default step', () => {
    const r = runCycle(fleet(), {
      mode: 'scale',
      total: TOTAL,
      maxBudget: 1000,
      config: { cpaTarget: 50 },
    });
    expect(r.scale?.stepped).toBe(true);
    expect(r.scale?.to).toBeCloseTo(TOTAL * 1.05, 6);
  });

  test('scaleStepDue: false holds the total on target and explains the wait', () => {
    const r = runCycle(fleet(), {
      mode: 'scale',
      total: TOTAL,
      weeklyGrowthPct: 0.1,
      scaleStepDue: false,
      config: { cpaTarget: 50 },
    });
    expect(r.scale?.stepped).toBe(false);
    expect(r.scale?.to).toBe(TOTAL);
    expect(r.reallocation.totalBudget).toBeCloseTo(TOTAL, 6);
    expect(r.scale?.reason).toMatch(/not due yet/);
  });

  test('above target: no growth, and the reason carries the numbers', () => {
    const r = runCycle(fleet(), {
      mode: 'scale',
      total: TOTAL,
      weeklyGrowthPct: 0.1,
      config: { cpaTarget: 5 }, // fleet buys at $10
    });
    expect(r.scale?.stepped).toBe(false);
    expect(r.reallocation.totalBudget).toBeCloseTo(TOTAL, 6);
    expect(r.scale?.reason).toMatch(/above the target 5/);
  });

  test('scale mode with no plan at all grows nothing and says why', () => {
    const r = runCycle(fleet(), { mode: 'scale', total: TOTAL, config: { cpaTarget: 50 } });
    expect(r.scale?.stepped).toBe(false);
    expect(r.scale?.reason).toMatch(/no growth plan/);
    expect(r.reallocation.totalBudget).toBeCloseTo(TOTAL, 6);
  });

  test('already at the ceiling: not stepped, ceiling reported', () => {
    const r = runCycle(fleet(), {
      mode: 'scale',
      total: TOTAL,
      weeklyGrowthPct: 0.1,
      maxBudget: TOTAL,
      config: { cpaTarget: 50 },
    });
    expect(r.scale?.stepped).toBe(false);
    expect(r.scale?.reason).toMatch(/already at the ceiling/);
  });

  test('balanced and efficiency carry no scale verdict', () => {
    expect(runCycle(fleet(), { mode: 'balanced', total: TOTAL }).scale).toBeUndefined();
    expect(runCycle(fleet(), { mode: 'efficiency', total: TOTAL }).scale).toBeUndefined();
  });
});

describe('pacing state on the result', () => {
  test('computePacing carries the flight state it was computed from', () => {
    const p = computePacing({
      periodBudget: 3000,
      periodDays: 30,
      dayIndex: 11,
      actualSpendToDate: 800,
    });
    expect(p.source).toBe('pacing');
    expect(p.periodBudget).toBe(3000);
    expect(p.periodDays).toBe(30);
    expect(p.dayIndex).toBe(11);
    expect(p.actualSpendToDate).toBe(800);
    // ideal cumulative before day 11 = 100/day × 10 days
    expect(p.idealCumulative).toBe(1000);
    expect(p.status).toBe('underpacing');
  });

  test('a cycle with a flight window persists a self-describing pacing row', () => {
    const r = runCycle(fleet(), {
      mode: 'balanced',
      pacing: { periodBudget: 6000, periodDays: 30, dayIndex: 2, actualSpendToDate: 200 },
    });
    expect(r.pacing.source).toBe('pacing');
    expect(r.pacing.periodBudget).toBe(6000);
    expect(r.pacing.actualSpendToDate).toBe(200);
  });

  test('a cycle without a flight window is marked observed, never a real verdict', () => {
    const r = runCycle(fleet(), { mode: 'balanced', total: TOTAL });
    expect(r.pacing.source).toBe('observed');
    expect(r.pacing.periodBudget).toBeUndefined();
  });
});
