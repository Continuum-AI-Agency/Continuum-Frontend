// Flight pacing — the model behind the dashboard's Pacing panel.
//
// Why the old gauge showed nothing: it read `latest_run.pacing` for `periodBudget` and
// `actualSpendToDate`, and the engine never persisted either (it stored only the verdict).
// The run row now carries the flight state it was computed from PLUS a `source`, and the
// engine's flat fallback also says `on_track` — so the source is what separates a real
// verdict from a placeholder. When the run predates that (or the scheduler skipped pacing
// because its series did not reach the flight start), the same numbers are derived here
// from the enrolled ad sets' daily spend, marked `source: 'client'` so the panel can say
// "estimated from spend" rather than pretending the engine judged it.

import type { CycleRunPacing } from '@continuum/contracts';
import { daysBetween, isIsoDate } from '../sections/detail/rangeModel';

export type FlightPacingStatus = 'on_track' | 'underpacing' | 'overpacing';

export type FlightPacingModel =
  | { kind: 'no_flight' }
  | { kind: 'not_started'; start: string; end: string; budget: number }
  | {
      kind: 'ended';
      start: string;
      end: string;
      budget: number;
      spent: number | null;
      spentPct: number | null;
    }
  | {
      kind: 'awaiting_cycle';
      start: string;
      end: string;
      budget: number;
      dayIndex: number;
      periodDays: number;
    }
  | {
      kind: 'ready';
      source: 'engine' | 'client';
      status: FlightPacingStatus;
      start: string;
      end: string;
      budget: number;
      periodDays: number;
      dayIndex: number;
      /** Elapsed share of the flight, 0–100. */
      timePct: number;
      spent: number;
      /** Spent share of the budget, 0–100 (capped). */
      spentPct: number;
      /** actual / ideal cumulative spend; 1 = exactly on plan. */
      ratio: number;
      /** Straight-line projection of end-of-flight spend at today's pace. */
      projectedEnd: number;
      /** What the remaining days must average to land exactly on budget. */
      dailyNeeded: number;
      /** The flat daily plan (budget / days). */
      dailyPlanned: number;
      /** Remaining budget (never negative). */
      remaining: number;
      note: string | null;
    };

export type FlightPortfolio = {
  period_start?: string | null;
  period_end?: string | null;
  period_budget?: number | null;
};

/** The slice of an AdSetSnapshot this model reads. Loose on purpose: zod-inferred rows,
 *  test fixtures and partial daily rows all fit without adapters. */
export type DailySpendRow = {
  id: string;
  daily?: ReadonlyArray<{ date: string; spend?: number | null }> | null;
};

/** Σ spend of the enrolled ad sets between two dates (inclusive), off the daily series
 *  the account-snapshot read already carries. Null when no enrolled series reaches back
 *  to `from` — a partial sum would read as underspending and lie in the wrong direction. */
export function spendBetween(
  snapshots: DailySpendRow[],
  enrolledIds: Iterable<string>,
  from: string,
  to: string,
): number | null {
  const ids = new Set(enrolledIds);
  let earliest: string | null = null;
  let total = 0;
  let saw = false;
  for (const snapshot of snapshots) {
    if (!ids.has(snapshot.id)) continue;
    const daily = snapshot.daily;
    if (!daily || daily.length === 0) continue;
    saw = true;
    for (const day of daily) {
      if (!isIsoDate(day.date)) continue;
      if (earliest === null || day.date < earliest) earliest = day.date;
      if (day.date >= from && day.date <= to) total += day.spend ?? 0;
    }
  }
  if (!saw || earliest === null || earliest > from) return null;
  return total;
}

/** The engine's thresholds (packages/optimization-engine/src/pacing.ts): ±5%. */
export function pacingStatus(ratio: number): FlightPacingStatus {
  if (ratio > 1.05) return 'overpacing';
  if (ratio < 0.95) return 'underpacing';
  return 'on_track';
}

export function buildFlightPacing(args: {
  portfolio: FlightPortfolio;
  runPacing: CycleRunPacing | null | undefined;
  snapshots: DailySpendRow[];
  enrolledIds: Iterable<string>;
  today: string;
}): FlightPacingModel {
  const { portfolio, runPacing, snapshots, enrolledIds, today } = args;
  const start = portfolio.period_start;
  const end = portfolio.period_end;
  const budget = portfolio.period_budget;
  if (!isIsoDate(start) || !isIsoDate(end) || budget == null || budget <= 0 || end < start) {
    return { kind: 'no_flight' };
  }
  const periodDays = daysBetween(start, end) + 1;
  const dayIndex = daysBetween(start, today) + 1;
  if (dayIndex < 1) return { kind: 'not_started', start, end, budget };

  // Spend to date: the engine's own figure when it paced THIS flight, else the client sum.
  let spent: number | null = null;
  let source: 'engine' | 'client' = 'client';
  let note: string | null = null;
  const engineSaysPacing =
    runPacing?.source === 'pacing' &&
    typeof runPacing.actualSpendToDate === 'number' &&
    typeof runPacing.periodBudget === 'number' &&
    Math.abs(runPacing.periodBudget - budget) < 0.5;
  if (engineSaysPacing && runPacing) {
    spent = runPacing.actualSpendToDate as number;
    source = 'engine';
    note = runPacing.note ?? null;
  } else {
    const clipped = end < today ? end : today;
    spent = spendBetween(snapshots, enrolledIds, start, clipped);
  }

  if (dayIndex > periodDays) {
    return {
      kind: 'ended',
      start,
      end,
      budget,
      spent,
      spentPct: spent != null ? Math.min(100, (spent / budget) * 100) : null,
    };
  }
  if (spent == null) return { kind: 'awaiting_cycle', start, end, budget, dayIndex, periodDays };

  const dailyPlanned = budget / periodDays;
  const idealCumulative = dailyPlanned * Math.max(0, dayIndex - 1);
  // On day one nothing "should" have been spent yet; call that on track rather than ∞.
  const ratio = idealCumulative > 0 ? spent / idealCumulative : 1;
  const remaining = Math.max(0, budget - spent);
  const remainingDays = Math.max(1, periodDays - (dayIndex - 1));
  return {
    kind: 'ready',
    source,
    status: pacingStatus(ratio),
    start,
    end,
    budget,
    periodDays,
    dayIndex,
    timePct: Math.min(100, (dayIndex / periodDays) * 100),
    spent,
    spentPct: Math.min(100, (spent / budget) * 100),
    ratio,
    projectedEnd: dayIndex > 0 ? (spent / dayIndex) * periodDays : spent,
    dailyNeeded: remaining / remainingDays,
    dailyPlanned,
    remaining,
    note,
  };
}
