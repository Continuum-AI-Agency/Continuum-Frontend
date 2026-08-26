// What autopilot would have DONE with the cycle the engine just previewed.
//
// The reallocation itself is never computed here — it comes from the real engine through
// the read-only /cycle/preview edge, because a client-side re-implementation would drift
// and lie to the operator on the one screen where that costs money. What this file adds is
// the pair of GUARDRAIL rules that stand between a scored move and a Meta write, and those
// are three comparisons, not an engine:
//
//   1. the daily pool over max_daily_apply_minor  → autopilot writes NOTHING that cycle
//   2. |change| over max_change_pct_per_cycle     → that item is HELD for human approval
//
// Both mirror Continuum-Optimizer/src/apply.ts (dailyCapExceeded ~:155, the %-cap hold
// ~:227) including its EPSILON, so the preview and the service agree on which moves are
// real. If those rules move, this moves with them.

import { type CyclePreviewItem, toMinorUnits } from '@continuum/contracts';

/** apply.ts EPSILON — a change smaller than this is not a change, and never a write. */
const EPSILON = 1e-9;

export type AutopilotForecast = {
  /** The daily pool exceeds the spend ceiling: NO writes at all this cycle. */
  poolOverCeiling: boolean;
  poolMinor: number;
  ceilingMinor: number;
  /** Moves autopilot would write to Meta itself. */
  wouldApply: CyclePreviewItem[];
  /** Moves too big for the per-cycle cap — parked for per-item approval. */
  wouldHold: CyclePreviewItem[];
};

/** Classify a previewed cycle against the caps the operator is about to arm. */
export function forecastAutopilot({
  items,
  dailyTotal,
  currency,
  maxDailyApplyMinor,
  maxChangePctPerCycle,
}: {
  items: CyclePreviewItem[];
  /** The portfolio's daily pool in MAJOR units — what the cycle reallocates within. */
  dailyTotal: number;
  currency: string | null | undefined;
  /** The armed ceiling, in MINOR units (the column's own unit). */
  maxDailyApplyMinor: number;
  /** The armed per-cycle cap, as a fraction (0.2 = 20%). */
  maxChangePctPerCycle: number;
}): AutopilotForecast {
  const poolMinor = toMinorUnits(dailyTotal, currency);
  const changed = items.filter(
    (item) => Number.isFinite(item.final_budget) && Math.abs(item.change_abs) >= EPSILON,
  );
  const wouldHold = changed.filter((item) => Math.abs(item.change_pct) > maxChangePctPerCycle);
  const held = new Set(wouldHold);
  return {
    poolOverCeiling: poolMinor > maxDailyApplyMinor,
    poolMinor,
    ceilingMinor: maxDailyApplyMinor,
    wouldApply: changed.filter((item) => !held.has(item)),
    wouldHold,
  };
}
