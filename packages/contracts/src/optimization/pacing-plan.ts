// Which flight a pacing verdict was computed against — and whether it is the flight the
// portfolio row holds NOW.
//
// optimizer.cycle_runs.pacing is written once, at cycle time, from the portfolio row the
// scheduler claimed. The portfolio row keeps moving: on 2026-10-08 the October flights were
// rebased (period_budget = plan − spend to date, period_start moved to the 8th) and the last
// run's pacing block kept pacing 45,000 MXN over 31 days while optimizer_list_portfolios
// reported 26,101 MXN over 24 — the "172 % over" badge was about a plan the flight no longer
// had, and nothing on the row said so. Both sides of the status read (the run's pacing block
// and the portfolio row) now derive the SAME plan version through this module, so a reader
// holding both can label a stale verdict instead of rendering it as current.

/** The portfolio-row spelling of a flight: what optimizer_list_portfolios and
 *  CycleRunReport.portfolio carry. Any of the three may be unset. */
export type FlightRow = {
  period_start?: string | null;
  period_end?: string | null;
  period_budget?: number | null;
};

/** A complete flight: the three fields the scheduler paces against. */
export type PacingFlight = {
  periodStart: string;
  periodEnd: string;
  periodBudget: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The flight on a portfolio row, or null when the row does not carry a complete one — the
 *  same three checks `planCycleBudget` makes before it paces. */
export function flightOf(row: FlightRow): PacingFlight | null {
  const { period_start: periodStart, period_end: periodEnd, period_budget: periodBudget } = row;
  if (typeof periodStart !== 'string' || !ISO_DATE.test(periodStart)) return null;
  if (typeof periodEnd !== 'string' || !ISO_DATE.test(periodEnd)) return null;
  if (typeof periodBudget !== 'number' || !Number.isFinite(periodBudget) || periodBudget <= 0)
    return null;
  return { periodStart, periodEnd, periodBudget };
}

/** The plan version a pacing verdict is stamped with: the flight, spelled so that two flights
 *  are the same plan exactly when the scheduler would pace them the same way. */
export function pacingPlanVersion(flight: PacingFlight): string {
  return `${flight.periodStart}..${flight.periodEnd}@${flight.periodBudget}`;
}

/** `pacingPlanVersion` of a portfolio row; null when the row has no complete flight. */
export function pacingPlanVersionOf(row: FlightRow): string | null {
  const flight = flightOf(row);
  return flight === null ? null : pacingPlanVersion(flight);
}

/** What a reader holding a run's pacing block AND the current portfolio row can conclude.
 *   - `current`: the verdict is about the flight the row holds; render it as the plan.
 *   - `stale`: the row's flight changed since the run (a rebase, a new budget, a new window);
 *     the verdict is about a plan the flight no longer has. Label it, never badge it.
 *   - `unversioned`: the run predates the stamp; nothing on the row can tell either way.
 *   - `not_pacing`: no flight drove this run (the flat 'observed' / 'fixed' totals). */
export type PacingPlanFreshness = 'current' | 'stale' | 'unversioned' | 'not_pacing';

export type PacingPlanReading = {
  freshness: PacingPlanFreshness;
  /** The plan the run paced against (its stamp), when it carries one. */
  runPlan: string | null;
  /** The plan the portfolio row holds now, when it holds a complete flight. */
  currentPlan: string | null;
};

/** The subset of CycleRunPacing this reading needs. */
export type PacingStamp = {
  source?: string | null;
  planVersion?: string | null;
};

export function pacingPlanFreshness(
  pacing: PacingStamp | null | undefined,
  row: FlightRow,
): PacingPlanReading {
  const currentPlan = pacingPlanVersionOf(row);
  if (!pacing || pacing.source !== 'pacing') {
    return { freshness: 'not_pacing', runPlan: null, currentPlan };
  }
  const runPlan = typeof pacing.planVersion === 'string' ? pacing.planVersion : null;
  if (runPlan === null) return { freshness: 'unversioned', runPlan, currentPlan };
  return { freshness: runPlan === currentPlan ? 'current' : 'stale', runPlan, currentPlan };
}
