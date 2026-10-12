// Two ways the solver used to bend a guardrail and say so only in prose.
//
//   PP-L2-velocity-cap-relaxed-without-flag — under underflow the velocity down-cap is
//     dropped, and an ad set cut past it kept capBreached=false: the field the applier and
//     the Frontend read said nothing.
//   PP-L2-negative-pool-claims-conserved — frozen ad sets holding more than the portfolio
//     total left a negative pool, floors "scaled by -Infinity", and conserved=true over an
//     allocation above the total.
import { expect, test } from 'bun:test';
import type { AdSetSnapshot, SolverItem, WindowMetrics } from '../src/index';
import { DEFAULT_CONFIG, reallocate, solve } from '../src/index';

const P = (purchases: number, spend: number): WindowMetrics => ({
  spend,
  purchases,
  addToCarts: 0,
  clicks: 0,
  impressions: 0,
});

const mk = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id: 'x',
  status: 'active',
  currentBudget: 100,
  ageDays: 40,
  windows: { d3: P(3, 60), d7: P(6, 120), d14: P(12, 240) },
  ...over,
});

test('an item the underflow relaxation cuts past its velocity down-cap is capBreached', () => {
  // velocityDown 80 each, floors 10: sum(lo)=160 > pool 120, so the down-cap is dropped and
  // at least one item lands below 80.
  const items: SolverItem[] = [
    { id: 'a', score: 3, current: 100, floor: 10, velocityDown: 80, velocityUp: 130 },
    { id: 'b', score: 1, current: 100, floor: 10, velocityDown: 80, velocityUp: 130 },
  ];
  const out = solve(items, 120, DEFAULT_CONFIG);
  expect(out.underflow).toBe(true);
  for (const a of out.allocations) {
    const item = items.find((i) => i.id === a.id)!;
    expect(a.capBreached).toBe(a.amount < item.velocityDown - 1e-6);
  }
  expect(out.allocations.some((a) => a.capBreached)).toBe(true);
});

test('an item the relaxation leaves inside its box is NOT flagged', () => {
  const items: SolverItem[] = [
    { id: 'a', score: 1, current: 100, floor: 10, velocityDown: 80, velocityUp: 130 },
  ];
  const out = solve(items, 100, DEFAULT_CONFIG);
  expect(out.allocations[0]!.capBreached).toBe(false);
});

test('frozen ad sets above the total: a named refusal, never a conserved allocation', () => {
  const snaps = [
    mk({ id: 'f1', status: 'frozen', currentBudget: 480 }),
    mk({ id: 'f2', status: 'frozen', currentBudget: 480 }),
    mk({ id: 'e1', currentBudget: 100 }),
  ];
  const r = reallocate(snaps, 750);
  expect(r.refusal).toEqual({ reason: 'frozen_above_total', frozenBudget: 960, totalBudget: 750 });
  expect(r.conserved).toBe(false);
  // Nothing is reallocated: every budget holds, and no -Infinity reaches the notes.
  for (const it of r.items) expect(it.finalBudget).toBe(it.currentBudget);
  expect(r.notes.join(' ')).not.toContain('Infinity');
  expect(r.notes.join(' ')).toContain('frozen ad sets hold 960.00');
});

test('frozen ad sets at or under the total still reallocate the pool and conserve', () => {
  const r = reallocate(
    [mk({ id: 'f1', status: 'frozen', currentBudget: 300 }), mk({ id: 'e1', currentBudget: 100 })],
    450,
  );
  expect(r.refusal).toBeUndefined();
  expect(r.conserved).toBe(true);
});
