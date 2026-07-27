// Budget-delta money edges (bun test). Exercises the reallocation / solver boundaries where
// real dollars move: the constraint precedence, the velocity clamps, the floor formula, the
// budgetless / brand-new locks, and the conservation invariant. Thresholds come from
// DEFAULT_CONFIG and the objective profiles, never restated here.
import { expect, test } from 'bun:test';
import type { AdSetSnapshot, SolverItem, WindowMetrics } from '../src/index';
import { DEFAULT_CONFIG, NEW_ITEM_LOCK_DAYS, reallocate, runCycle, solve } from '../src/index';

const approx = (a: number, b: number, tol = 1e-6): void =>
  expect(Math.abs(a - b) <= tol).toBe(true);

// Tier-1 (1/CPP) fixture: purchases per window drive the default score.
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

// --- Precedence: Conservation > Floor > Velocity cap ----------------------------------

test('Conservation > Floor: when floors exceed the pool, floors are scaled but the sum holds', () => {
  // Both items floor at 100 (max of floor and velocity-down 80); the pool is only 120, so
  // sum(floors)=200 > 120. Velocity cap yields first, then the floor is SCALED — never the
  // conservation invariant, which stays exact.
  const items: SolverItem[] = [
    { id: 'a', score: 1, current: 100, floor: 100, velocityDown: 80, velocityUp: 130 },
    { id: 'b', score: 1, current: 100, floor: 100, velocityDown: 80, velocityUp: 130 },
  ];
  const out = solve(items, 120, DEFAULT_CONFIG);
  approx(out.allocatedTotal, 120);
  expect(out.underflow).toBe(true);
  expect(out.allocations.every((a) => a.floorRelaxed)).toBe(true);
  // Scaled 0.6x: each floor 100 -> 60, and the pool splits evenly.
  for (const a of out.allocations) approx(a.amount, 60, 1e-4);
});

test('Floor > Velocity cap: a floor above the velocity ceiling pins the box above the cap', () => {
  // Item a's floor (200) sits ABOVE its velocity-up ceiling (130). The floor wins: its box is
  // [200, 200], so it is funded to 200 even though that breaches the ±30% velocity cap.
  const items: SolverItem[] = [
    { id: 'a', score: 1, current: 100, floor: 200, velocityDown: 70, velocityUp: 130 },
    { id: 'b', score: 1, current: 100, floor: 10, velocityDown: 70, velocityUp: 130 },
  ];
  const out = solve(items, 300, DEFAULT_CONFIG);
  const a = out.allocations.find((x) => x.id === 'a')!;
  expect(a.upperBound).toBe(200); // floor pinned the ceiling above the velocity cap
  approx(a.amount, 200, 1e-4);
  approx(out.allocatedTotal, 300);
});

// --- Symmetric velocity cap clamps a big up-move AND a big down-move -------------------

test('symmetric velocityCapPct clamps a strong winner up to +30% and a loser down to -30%', () => {
  // A dominates the score and would take almost everything; B would be gutted. The default
  // ±velocityCapPct (0.3) clamps A at 130 and B at 70, and conservation fills the rest.
  const snaps: AdSetSnapshot[] = [
    mk({ id: 'A', windows: { d3: P(6, 60), d7: P(12, 120), d14: P(24, 240) } }), // CPP 10, strong
    mk({ id: 'B', windows: { d3: P(1, 100), d7: P(2, 200), d14: P(4, 400) } }), // CPP 100, weak
  ];
  const res = reallocate(snaps, 200);
  const A = res.items.find((i) => i.id === 'A')!;
  const B = res.items.find((i) => i.id === 'B')!;
  approx(A.finalBudget, 130, 1e-3); // 100 * (1 + 0.3)
  approx(B.finalBudget, 70, 1e-3); // 100 * (1 - 0.3)
  approx(res.allocatedTotal, 200);
  expect(A.upperBound).toBe(130);
  expect(B.lowerBound).toBe(70);
});

// --- Learning-phase down-cap ----------------------------------------------------------

test('learning phase limits a reduction to learningReductionCapPct (default -8%)', () => {
  // The learning item L would be cut hard, but the learning down-cap floors its box at 92
  // (100 * (1 - 0.08)) instead of 70, so it can never be reduced past -8% this cycle.
  const snaps: AdSetSnapshot[] = [
    mk({ id: 'A', windows: { d3: P(6, 60), d7: P(12, 120), d14: P(24, 240) } }), // strong
    mk({
      id: 'L',
      status: 'learning',
      learningPhase: true,
      windows: { d3: P(1, 100), d7: P(2, 200), d14: P(3, 300) }, // weak
    }),
  ];
  const res = reallocate(snaps, 200);
  const L = res.items.find((i) => i.id === 'L')!;
  expect(L.lowerBound).toBe(92); // 100 * (1 - learningReductionCapPct 0.08)
  approx(L.finalBudget, 92, 1e-3);
  approx(res.allocatedTotal, 200);
});

// --- Per-objective asymmetric caps ----------------------------------------------------

test('purchase objective applies asymmetric caps: up +30% / down -40%', () => {
  const A = (purch: number, spend: number): WindowMetrics => P(purch, spend);
  const snaps: AdSetSnapshot[] = [
    mk({ id: 'a', windows: { d3: A(3, 30), d7: A(6, 60), d14: A(10, 100) } }),
    mk({ id: 'b', windows: { d3: A(2, 30), d7: A(5, 60), d14: A(9, 100) } }),
    mk({ id: 'c', windows: { d3: A(3, 30), d7: A(5, 60), d14: A(10, 100) } }),
  ];
  const res = reallocate(snaps, 300, { objective: 'purchase' });
  approx(res.allocatedTotal, 300);
  for (const i of res.items) {
    approx(i.lowerBound, 60); // 100 * (1 - velocityDownPct 0.40)
    approx(i.upperBound, 130); // 100 * (1 + velocityUpPct 0.30)
  }
});

// --- Floor = max(floorPortfolioPct * avg eligible budget, cpaTarget*floorMinSignals/days) --

test('floor takes the portfolio-percentage term when average eligible budget is large', () => {
  // avg eligible budget 1000 -> 0.15 * 1000 = 150, which beats the 100/14 signal floor.
  const snaps: AdSetSnapshot[] = [
    mk({ id: 'a', currentBudget: 1000 }),
    mk({ id: 'b', currentBudget: 1000 }),
  ];
  const res = reallocate(snaps, 2000);
  for (const i of res.items) expect(i.floor).toBe(150);
});

test('floor takes the cpaTarget signal term when average eligible budget is small', () => {
  // avg eligible budget 20 -> 0.15 * 20 = 3, so the signal floor (100/14 ≈ 7.14) wins.
  const snaps: AdSetSnapshot[] = [
    mk({ id: 'a', currentBudget: 20 }),
    mk({ id: 'b', currentBudget: 20 }),
  ];
  const res = reallocate(snaps, 40);
  for (const i of res.items) approx(i.floor, 100 / 14, 1e-9);
});

// --- Budgetless ad set ends at 0, and never dilutes or receives a floor ----------------

test('a budgetless (no_own_budget) ad set ends at 0 — no floor is handed to it', () => {
  const snaps: AdSetSnapshot[] = [
    mk({ id: 'real', currentBudget: 100 }),
    {
      id: 'boosted',
      status: 'frozen',
      freeze: true,
      freezeReason: 'no_own_budget',
      currentBudget: 0,
      ageDays: 40,
      windows: { d3: P(0, 0), d7: P(0, 0), d14: P(0, 0) },
    },
  ];
  const res = reallocate(snaps, 100);
  const boosted = res.items.find((i) => i.id === 'boosted')!;
  expect(boosted.finalBudget).toBe(0); // stays at 0, not lifted to the floor
  expect(boosted.freezeReason).toBe('no_own_budget');
  approx(res.items.find((i) => i.id === 'real')!.finalBudget, 100, 1e-3);
  approx(res.allocatedTotal, 100);
});

// --- Brand-new item is fully locked ---------------------------------------------------

test('NEW_ITEM_LOCK_DAYS fully locks a brand-new ad set at its current budget', () => {
  const snaps: AdSetSnapshot[] = [
    {
      id: 'newbie',
      status: 'active',
      currentBudget: 50,
      ageDays: NEW_ITEM_LOCK_DAYS - 1,
      windows: { d3: P(0, 0), d7: P(0, 0), d14: P(0, 0) },
    },
    {
      id: 'veteran',
      status: 'active',
      currentBudget: 100,
      ageDays: 40,
      windows: { d3: P(6, 60), d7: P(12, 120), d14: P(24, 240) },
    },
  ];
  const res = runCycle(snaps, { total: 150 });
  const newbie = res.reallocation.items.find((i) => i.id === 'newbie')!;
  expect(newbie.status).toBe('frozen'); // locked by the new-item classifier
  expect(newbie.finalBudget).toBe(50); // budget did not move at all
  approx(res.reallocation.allocatedTotal, 150, 1e-2);
});

// --- Conservation invariant -----------------------------------------------------------

test('conservation: the final budgets sum to the input total (|residual| < 1e-6)', () => {
  const snaps: AdSetSnapshot[] = [
    mk({ id: 'a', currentBudget: 120, windows: { d3: P(6, 60), d7: P(12, 120), d14: P(24, 240) } }),
    mk({ id: 'b', currentBudget: 90, windows: { d3: P(2, 80), d7: P(4, 160), d14: P(8, 320) } }),
    mk({ id: 'c', currentBudget: 110, windows: { d3: P(3, 70), d7: P(6, 140), d14: P(12, 280) } }),
    mk({
      id: 'd',
      status: 'learning',
      learningPhase: true,
      currentBudget: 80,
      windows: { d3: P(1, 90), d7: P(2, 180), d14: P(3, 270) },
    }),
  ];
  const total = 400;
  const res = reallocate(snaps, total);
  expect(Math.abs(res.allocatedTotal - total)).toBeLessThan(1e-6);
  expect(Math.abs(res.residual)).toBeLessThan(1e-6);
  expect(res.conserved).toBe(true);
});

// --- Overflow modes: pool exceeds the sum of velocity ceilings ------------------------
// hi is pinned to velocityUp (130) since floor (10) sits below it, so sum(hi)=260 < pool=400.

test('overflow relax_uniform: caps scaled up uniformly, conservation exact, all cap-breached', () => {
  const items: SolverItem[] = [
    { id: 'a', score: 1, current: 100, floor: 10, velocityDown: 70, velocityUp: 130 },
    { id: 'b', score: 1, current: 100, floor: 10, velocityDown: 70, velocityUp: 130 },
  ];
  const out = solve(items, 400, { ...DEFAULT_CONFIG, overflowMode: 'relax_uniform' });
  expect(out.overflow).toBe(true);
  approx(out.allocatedTotal, 400);
  approx(out.residual, 0);
  expect(out.allocations.every((a) => a.capBreached)).toBe(true);
  expect(out.notes.some((n) => n.includes('relaxed all caps'))).toBe(true);
});

test('overflow underspend: each pinned at its cap, the excess stays unallocated as residual', () => {
  const items: SolverItem[] = [
    { id: 'a', score: 1, current: 100, floor: 10, velocityDown: 70, velocityUp: 130 },
    { id: 'b', score: 1, current: 100, floor: 10, velocityDown: 70, velocityUp: 130 },
  ];
  const out = solve(items, 400, { ...DEFAULT_CONFIG, overflowMode: 'underspend' });
  expect(out.overflow).toBe(true);
  approx(out.allocatedTotal, 260); // both at upperBound 130
  approx(out.residual, 140); // 400 - 260 left unallocated
  for (const a of out.allocations) approx(a.amount, a.upperBound, 1e-4);
  expect(out.notes.some((n) => n.includes('underspend'))).toBe(true);
});

test('overflow breach_best with zero scores: residual split EVENLY over cap, conservation exact', () => {
  // sumScore <= EPS forces distributeByScore's even-split branch: residual 140 / 2 = 70 each,
  // added on top of the pinned cap 130 -> 200 each, every item cap-breached.
  const items: SolverItem[] = [
    { id: 'a', score: 0, current: 100, floor: 10, velocityDown: 70, velocityUp: 130 },
    { id: 'b', score: 0, current: 100, floor: 10, velocityDown: 70, velocityUp: 130 },
  ];
  const out = solve(items, 400, DEFAULT_CONFIG); // default overflowMode 'breach_best'
  expect(out.overflow).toBe(true);
  approx(out.allocatedTotal, 400);
  for (const a of out.allocations) approx(a.amount, 200, 1e-4);
  expect(out.allocations.every((a) => a.capBreached)).toBe(true);
});
