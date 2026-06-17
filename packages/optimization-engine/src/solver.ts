// ---------------------------------------------------------------------------
// Constrained proportional allocation solver (water-filling).
//
// This is the piece the Excel sheet admits it does NOT implement
// ("handled by the optimization engine in code"): after the velocity cap and
// floor bind, the one-shot formula no longer sums to the total. This solver
// enforces the budget-conservation invariant exactly.
//
// Precedence (confirmed): Conservation > Floor > Velocity cap.
//   - Conservation ALWAYS holds (top guardrail).
//   - When constraints conflict, the velocity cap yields first, then the floor.
// ---------------------------------------------------------------------------

import type { EngineConfig } from './config';
import { sum } from './internal/math';

export type SolverItem = {
  id: string;
  score: number; // effective score (>= 0); drives proportional target
  current: number; // current budget
  floor: number; // budget floor (lower bound from BR-floor)
  velocityDown: number; // current * (1 - downCap)  -> velocity/learning lower bound
  velocityUp: number; // current * (1 + V)          -> velocity upper bound
};

export type SolverAllocation = {
  id: string;
  amount: number;
  lowerBound: number;
  upperBound: number;
  capBreached: boolean;
  floorRelaxed: boolean;
};

export type SolverOutput = {
  allocations: SolverAllocation[];
  allocatedTotal: number;
  residual: number;
  sumLowerBounds: number;
  sumUpperBounds: number;
  overflow: boolean;
  underflow: boolean;
  notes: string[];
};

const EPS = 1e-6;

/**
 * Allocate `pool` across `items` proportional to score, respecting each
 * item's [lo, hi] box, while keeping sum(amount) == pool exactly.
 */
export function solve(items: SolverItem[], pool: number, cfg: EngineConfig): SolverOutput {
  const notes: string[] = [];

  // Lower bound = max(floor, velocity/learning down-limit).
  // Upper bound = velocity up-limit, but floor wins over the cap if floor > hi
  // (Floor > Velocity cap), so the box can never be empty.
  const lo = new Map<string, number>();
  const hi = new Map<string, number>();
  const floorRelaxed = new Map<string, boolean>();
  const capBreached = new Map<string, boolean>();

  for (const it of items) {
    const lower = Math.max(it.floor, it.velocityDown);
    const upper = Math.max(it.velocityUp, it.floor); // floor pins above cap if needed
    lo.set(it.id, lower);
    hi.set(it.id, upper);
    floorRelaxed.set(it.id, false);
    capBreached.set(it.id, false);
  }

  let sumLo = sum([...lo.values()]);
  let sumHi = sum([...hi.values()]);
  const overflow = pool > sumHi + EPS;
  const underflow = pool < sumLo - EPS;

  // ---- Feasibility relaxation ------------------------------------------
  if (underflow) {
    // Lower bounds demand more than the pool. Velocity cap yields first:
    // drop the velocity-down limit (allow bigger cuts), keeping only floors.
    for (const it of items) lo.set(it.id, it.floor);
    sumLo = sum([...lo.values()]);
    notes.push('underflow: relaxed velocity down-cap (allowed deeper cuts)');

    if (pool < sumLo - EPS) {
      // Floors alone still exceed the pool. Floor yields next: scale floors.
      const scale = pool / sumLo;
      for (const it of items) {
        lo.set(it.id, it.floor * scale);
        floorRelaxed.set(it.id, true);
      }
      sumLo = pool;
      notes.push(
        `underflow: floors exceed pool, scaled floors by ${scale.toFixed(4)}`,
      );
    }
  }

  let residual = 0;
  if (overflow) {
    residual = pool - sumHi;
    if (cfg.overflowMode === 'relax_uniform') {
      // Raise every cap by the same factor until it fits.
      const scale = pool / sumHi;
      for (const it of items) {
        hi.set(it.id, hi.get(it.id)! * scale);
        capBreached.set(it.id, true);
      }
      sumHi = pool;
      residual = 0;
      notes.push(`overflow: relaxed all caps uniformly x${scale.toFixed(4)}`);
    } else if (cfg.overflowMode === 'underspend') {
      // Respect the cap; the residual stays unallocated.
      notes.push(
        `overflow: underspend, ${residual.toFixed(2)} left unallocated`,
      );
    } else {
      // 'breach_best' (default): place residual on best-scoring items,
      // breaking their cap. Pin everyone at hi first, then water-fill the
      // residual proportional to score (the engine handles this below).
      notes.push('overflow: residual distributed to best performers (cap breached)');
    }
  }

  // ---- Core water-filling ----------------------------------------------
  // Iteratively assign target = remaining * score/sumScore among "free"
  // items; clamp any that violate their box, freeze them, repeat.
  const amount = new Map<string, number>();
  const free = new Set(items.map((i) => i.id));
  let remaining = pool;

  // Overflow + breach_best: pin all at hi, then redistribute residual to the
  // best performers beyond their cap.
  if (overflow && cfg.overflowMode === 'breach_best') {
    for (const it of items) amount.set(it.id, hi.get(it.id)!);
    distributeByScore(items, residual, capBreached, amount);
    return finalize(items, amount, lo, hi, capBreached, floorRelaxed, pool, 0, sumLo, sumHi, overflow, underflow, notes);
  }
  if (overflow && cfg.overflowMode === 'underspend') {
    for (const it of items) amount.set(it.id, hi.get(it.id)!);
    return finalize(items, amount, lo, hi, capBreached, floorRelaxed, pool, residual, sumLo, sumHi, overflow, underflow, notes);
  }

  let guard = 0;
  while (free.size > 0 && guard++ < 4 * items.length + 4) {
    const freeItems = items.filter((i) => free.has(i.id));
    const sumScore = sum(freeItems.map((i) => i.score));

    if (sumScore <= EPS) {
      // No signal among the free items: spread remaining evenly within boxes.
      // Any leftover that doesn't fit is carried to the reconciliation pass.
      remaining = spreadEvenly(freeItems, remaining, lo, hi, amount, free);
      break;
    }

    // Targets use the remaining captured at the START of the round.
    const roundRemaining = remaining;
    const target = (it: SolverItem) => roundRemaining * (it.score / sumScore);

    // HI-PRIORITY: clamp items above their cap FIRST. Clamping a winner down
    // frees budget for the others, so lo-decisions must wait until after this.
    const hiViol = freeItems.filter((it) => target(it) > hi.get(it.id)! + EPS);
    if (hiViol.length > 0) {
      for (const it of hiViol) {
        const h = hi.get(it.id)!;
        amount.set(it.id, h);
        free.delete(it.id);
        remaining -= h;
      }
      continue;
    }

    // Only once no item exceeds its cap, clamp items below their floor.
    const loViol = freeItems.filter((it) => target(it) < lo.get(it.id)! - EPS);
    if (loViol.length > 0) {
      for (const it of loViol) {
        const l = lo.get(it.id)!;
        amount.set(it.id, l);
        free.delete(it.id);
        remaining -= l;
      }
      continue;
    }

    // Everyone remaining fits: assign proportional targets and finish.
    for (const it of freeItems) {
      amount.set(it.id, roundRemaining * (it.score / sumScore));
      free.delete(it.id);
    }
    remaining = 0;
    break;
  }

  // Safety reconciliation: drive any leftover (float dust or rare corner) to
  // zero by nudging items that still have room in the needed direction.
  remaining = reconcile(items, amount, lo, hi, remaining);
  residual += remaining;

  return finalize(items, amount, lo, hi, capBreached, floorRelaxed, pool, residual, sumLo, sumHi, overflow, underflow, notes);
}

// --- helpers ---------------------------------------------------------------

function distributeByScore(
  items: SolverItem[],
  extra: number,
  capBreached: Map<string, boolean>,
  amount: Map<string, number>,
): void {
  if (extra <= EPS) return;
  const sumScore = sum(items.map((i) => i.score));
  if (sumScore <= EPS) {
    const per = extra / items.length;
    for (const it of items) {
      amount.set(it.id, (amount.get(it.id) ?? 0) + per);
      capBreached.set(it.id, true);
    }
    return;
  }
  for (const it of items) {
    const add = extra * (it.score / sumScore);
    if (add > EPS) {
      amount.set(it.id, (amount.get(it.id) ?? 0) + add);
      capBreached.set(it.id, true);
    }
  }
}

/**
 * Push any leftover budget (positive or negative) onto items that still have
 * room in the required direction, proportional to score. Returns the residual
 * that could not be placed (only non-zero under genuine infeasibility).
 */
function reconcile(
  items: SolverItem[],
  amount: Map<string, number>,
  lo: Map<string, number>,
  hi: Map<string, number>,
  remaining: number,
): number {
  let r = remaining;
  let guard = 0;
  while (Math.abs(r) > EPS && guard++ < 2 * items.length + 4) {
    const up = r > 0;
    const cands = items.filter((it) =>
      up ? amount.get(it.id)! < hi.get(it.id)! - EPS : amount.get(it.id)! > lo.get(it.id)! + EPS,
    );
    if (cands.length === 0) break; // no room: genuine residual
    const ss = sum(cands.map((c) => c.score));
    let moved = 0;
    for (const it of cands) {
      const share = ss > EPS ? it.score / ss : 1 / cands.length;
      const cur = amount.get(it.id)!;
      const room = up ? hi.get(it.id)! - cur : cur - lo.get(it.id)!;
      let delta = r * share;
      delta = up ? Math.min(delta, room) : Math.max(delta, -room);
      amount.set(it.id, cur + delta);
      moved += delta;
    }
    r -= moved;
    if (Math.abs(moved) < EPS) break;
  }
  return r;
}

function spreadEvenly(
  freeItems: SolverItem[],
  remaining: number,
  lo: Map<string, number>,
  hi: Map<string, number>,
  amount: Map<string, number>,
  free: Set<string>,
): number {
  // Equal-split fill within boxes; returns any leftover that didn't fit.
  let rem = remaining;
  let pool = freeItems.slice();
  // Seed everyone at their lower bound first (guarantees floors are met).
  for (const it of pool) {
    const l = lo.get(it.id)!;
    amount.set(it.id, l);
    rem -= l;
  }
  let guard = 0;
  while (pool.length > 0 && Math.abs(rem) > EPS && guard++ < pool.length + 2) {
    const per = rem / pool.length;
    const next: SolverItem[] = [];
    let changed = false;
    for (const it of pool) {
      const cur = amount.get(it.id)!;
      const want = cur + per;
      const l = lo.get(it.id)!;
      const h = hi.get(it.id)!;
      if (want < l - EPS) { amount.set(it.id, l); rem -= l - cur; free.delete(it.id); changed = true; }
      else if (want > h + EPS) { amount.set(it.id, h); rem -= h - cur; free.delete(it.id); changed = true; }
      else next.push(it);
    }
    if (!changed) {
      for (const it of next) { const cur = amount.get(it.id)!; amount.set(it.id, cur + rem / next.length); free.delete(it.id); }
      rem = 0;
      break;
    }
    pool = next;
  }
  for (const it of freeItems) free.delete(it.id);
  return rem;
}

function finalize(
  items: SolverItem[],
  amount: Map<string, number>,
  lo: Map<string, number>,
  hi: Map<string, number>,
  capBreached: Map<string, boolean>,
  floorRelaxed: Map<string, boolean>,
  pool: number,
  residual: number,
  sumLo: number,
  sumHi: number,
  overflow: boolean,
  underflow: boolean,
  notes: string[],
): SolverOutput {
  const allocations: SolverAllocation[] = items.map((it) => ({
    id: it.id,
    amount: amount.get(it.id) ?? 0,
    lowerBound: lo.get(it.id)!,
    upperBound: hi.get(it.id)!,
    capBreached: capBreached.get(it.id)!,
    floorRelaxed: floorRelaxed.get(it.id)!,
  }));
  const allocatedTotal = sum(allocations.map((a) => a.amount));
  return {
    allocations,
    allocatedTotal,
    residual,
    sumLowerBounds: sumLo,
    sumUpperBounds: sumHi,
    overflow,
    underflow,
    notes,
  };
}
