// Why a cycle can honestly produce zero recommendations — read off the account
// snapshots the same way the engine scores them, so the UI can name the cause
// instead of showing a blank panel.
//
// A zero-rec cycle is not always "nothing happened": an ad set frozen for
// kpi_mismatch (it buys a different result than the portfolio prices), an account
// too young to have a trailing window, or one with no tracked objective events at
// all will all score to silence. This module tells those apart.
//
// Derivation discipline (mirrors preview/whatIf.ts): the objective -> KPI-field
// map lives ONCE in getOptimizationMetricDefinition. A local copy here would be a
// fourth place for it to drift from the engine, the SQL, and the verdicts — and a
// readiness panel that counts a different event than the cycle it explains is
// worse than no panel.
//
// Verdict precedence (first matching wins), most-specific and least-recoverable
// first, so the panel never mislabels a fixable misconfiguration as "just wait":
//   1. no_optimizable_budget — a STRICT MAJORITY of ad sets carry no daily budget
//      of their own (CBO / lifetime, frozen unsupported_budget or lifetime_budget).
//      The optimizer cannot move a budget it does not control, so KPI alignment,
//      tracking and history are all moot. This outranks everything: reporting
//      "ready" over a CBO-only account claims the budget is balanced when in fact
//      nothing here is movable at all. Unblocked by converting to ad-set budgets.
//   2. currency_mismatch — a STRICT MAJORITY of ad sets declare a KPI other than
//      the objective's. They are frozen kpi_mismatch; no amount of history or
//      extra tracking scores them. Fixing the objective (or the ad sets) is the
//      only unblock, so this must not be read as "no signal".
//   3. no_signal — alignment is fine, but not one ad set produced a single
//      objective-KPI event in the trailing 14d window. There is nothing to score;
//      more days cannot rescue an absent event stream (tracking/conversion gap).
//   4. thin_history — signal exists, but the daily series is shorter than the
//      14-day window a confident call needs. Resolves itself with time.
//   5. ready — movable, aligned, tracked, and enough history. A zero-rec cycle
//      here means the allocation is already balanced, not blind.

import type {
  AdSetSnapshot,
  OptimizationMetricDefinition,
  OptimizationObjective,
} from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';

/** Trailing days of daily history a confident scoring call wants — matches the
 *  engine's 14-day window. Below this, a live signal is still too thin to trust. */
export const HISTORY_CONFIDENT_DAYS = 14;

export type SignalVerdict =
  | 'ready'
  | 'thin_history'
  | 'currency_mismatch'
  | 'no_signal'
  | 'no_optimizable_budget';

export type SignalReadiness = {
  /** The WindowMetrics field this objective scores on (e.g. 'conversations'). */
  objectiveKpi: OptimizationMetricDefinition['kpiField'];
  /** Ad sets that explicitly declare the objective's KPI. */
  declaredMatching: number;
  /** Ad sets that declare a DIFFERENT KPI — frozen kpi_mismatch this cycle. */
  declaredMismatched: number;
  /** Ad sets that declare nothing — they inherit the portfolio's objective KPI. */
  undeclared: number;
  /** Ad sets the optimizer cannot move: no daily budget of their own (CBO/lifetime). */
  unmovable: number;
  /** Longest daily series across the ad sets (max daily[].length). */
  daysOfHistory: number;
  /** Share (0..1) of ad sets with >0 objective-KPI events in the 14d window. */
  trackedShare: number;
  verdict: SignalVerdict;
};

function d14Events(snapshot: AdSetSnapshot, kpi: OptimizationMetricDefinition['kpiField']): number {
  const value = snapshot.windows?.d14?.[kpi];
  return typeof value === 'number' ? value : 0;
}

/** The ingest freezes an ad set whose budget lives at the campaign level (CBO) or
 *  spans a whole flight (lifetime). Either way the optimizer owns no lever on it.
 *  A zero currentBudget is the same condition seen from the other side, for feeds
 *  that abstain without stamping a reason. */
function isUnmovable(snapshot: AdSetSnapshot): boolean {
  if (snapshot.freezeReason === 'unsupported_budget') return true;
  if (snapshot.freezeReason === 'lifetime_budget') return true;
  return snapshot.currentBudget <= 0;
}

export function signalReadiness(
  snapshots: AdSetSnapshot[],
  objective: OptimizationObjective,
): SignalReadiness {
  const objectiveKpi = getOptimizationMetricDefinition(objective).kpiField;
  const total = snapshots.length;

  if (total === 0) {
    return {
      objectiveKpi,
      declaredMatching: 0,
      declaredMismatched: 0,
      undeclared: 0,
      unmovable: 0,
      daysOfHistory: 0,
      trackedShare: 0,
      verdict: 'no_signal',
    };
  }

  let declaredMatching = 0;
  let declaredMismatched = 0;
  let undeclared = 0;
  let unmovable = 0;
  let daysOfHistory = 0;
  let trackedCount = 0;

  for (const snapshot of snapshots) {
    if (isUnmovable(snapshot)) unmovable += 1;

    if (!snapshot.kpiField) {
      undeclared += 1;
    } else if (snapshot.kpiField === objectiveKpi) {
      declaredMatching += 1;
    } else {
      declaredMismatched += 1;
    }

    daysOfHistory = Math.max(daysOfHistory, snapshot.daily?.length ?? 0);
    if (d14Events(snapshot, objectiveKpi) > 0) trackedCount += 1;
  }

  const trackedShare = trackedCount / total;
  // Ad sets the objective CAN score: they declare its KPI, or declare nothing and
  // inherit it. Mismatched ad sets are frozen and score to nothing.
  const aligned = declaredMatching + undeclared;

  let verdict: SignalVerdict;
  if (unmovable > total - unmovable) {
    verdict = 'no_optimizable_budget';
  } else if (declaredMismatched > aligned) {
    verdict = 'currency_mismatch';
  } else if (trackedShare === 0) {
    verdict = 'no_signal';
  } else if (daysOfHistory < HISTORY_CONFIDENT_DAYS) {
    verdict = 'thin_history';
  } else {
    verdict = 'ready';
  }

  return {
    objectiveKpi,
    declaredMatching,
    declaredMismatched,
    undeclared,
    unmovable,
    daysOfHistory,
    trackedShare,
    verdict,
  };
}
