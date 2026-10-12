// A frozen ad set still follows the monthly plan.
//
// Freezing an ad set means the engine will not JUDGE it: it is too young to score (the
// first NEW_ITEM_LOCK_DAYS), it has no conversion signal, or an operator holds it. It never
// meant the plan stops applying to it. Before this, a frozen ad set kept its whole budget on
// a pacing cycle and the plan's cut fell entirely on the others; a portfolio of new ad sets
// (VIVO Center, 2026-10-08: three copies at 250/250/100 against a plan of 281/day) could
// not be paced at all until the lock ran out. Now a frozen ad set moves by exactly the plan's
// portfolio-wide step, and nothing more. Without a plan the portfolio redistributes the live
// sum of its daily budgets, and a frozen ad set keeps its budget as before.
import { describe, expect, test } from 'bun:test';
import type { AdSetSnapshot, PacingState, WindowMetrics } from '../src/index';
import { runCycle } from '../src/index';

const win = (spend: number, purchases: number): WindowMetrics => ({
  spend,
  purchases,
  addToCarts: 0,
  clicks: 0,
  impressions: 0,
});

function adset(id: string, currentBudget: number, ageDays: number): AdSetSnapshot {
  return {
    id,
    status: 'active',
    currentBudget,
    ageDays,
    windows: { d3: win(30, 3), d7: win(70, 7), d14: win(140, 14) },
  };
}

/** Day 1 of a 2-day flight with nothing spent: the plan's daily total is budget ÷ 2. */
const flight = (periodBudget: number): PacingState => ({
  periodBudget,
  periodDays: 2,
  dayIndex: 1,
  actualSpendToDate: 0,
});

const finals = (r: ReturnType<typeof runCycle>) =>
  Object.fromEntries(r.reallocation.items.map((i) => [i.id, i.finalBudget]));

describe('runCycle — a frozen ad set follows the plan', () => {
  test('a portfolio of brand-new ad sets is paced from day 1', () => {
    const r = runCycle([adset('broad', 250, 1), adset('geo', 250, 1), adset('lkl', 100, 1)], {
      mode: 'balanced',
      pacing: flight(562),
      config: { cpaTarget: 50 },
    });
    const scale = 281 / 600;
    expect(r.reallocation.items.every((i) => i.status === 'frozen')).toBe(true);
    expect(finals(r).broad).toBeCloseTo(250 * scale, 6);
    expect(finals(r).geo).toBeCloseTo(250 * scale, 6);
    expect(finals(r).lkl).toBeCloseTo(100 * scale, 6);
    expect(r.reallocation.allocatedTotal).toBeCloseTo(281, 6);
    expect(r.reallocation.refusal).toBeUndefined();
  });

  test('a new ad set takes the plan step and the rest of the cut falls on the others', () => {
    const r = runCycle([adset('new', 200, 1), adset('a', 200, 40), adset('b', 200, 40)], {
      mode: 'balanced',
      pacing: flight(600),
      config: { cpaTarget: 50 },
    });
    expect(finals(r).new).toBeCloseTo(100, 6);
    expect(r.reallocation.allocatedTotal).toBeCloseTo(300, 6);
  });

  test('an operator hold moves with the plan too: held means unjudged, not unplanned', () => {
    const held: AdSetSnapshot = { ...adset('held', 200, 40), freeze: true };
    const r = runCycle([held, adset('a', 200, 40), adset('b', 200, 40)], {
      mode: 'balanced',
      pacing: flight(900),
      config: { cpaTarget: 50 },
    });
    expect(finals(r).held).toBeCloseTo(150, 6);
    expect(r.reallocation.allocatedTotal).toBeCloseTo(450, 6);
  });

  test('without a plan a frozen ad set keeps its budget and the live sum is redistributed', () => {
    const r = runCycle([adset('new', 200, 1), adset('a', 200, 40), adset('b', 200, 40)], {
      mode: 'balanced',
      config: { cpaTarget: 50 },
    });
    expect(finals(r).new).toBe(200);
    expect(r.reallocation.allocatedTotal).toBeCloseTo(600, 6);
  });

  test('without a plan, frozen budgets above a fixed total are still a named refusal', () => {
    const r = runCycle([adset('new', 500, 1), adset('a', 200, 40)], {
      mode: 'balanced',
      total: 400,
      config: { cpaTarget: 50 },
    });
    expect(r.reallocation.refusal?.reason).toBe('frozen_above_total');
    expect(finals(r).new).toBe(500);
    expect(finals(r).a).toBe(200);
  });
});
