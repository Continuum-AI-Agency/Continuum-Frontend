// How much of a goal the team is aiming for, and by when (H02): which target applies to the
// primary goal, the period it runs over, and the figure held against it. Pure.
//
// The figure and the pace count COMPLETE days only: the read ends yesterday, so the days a target
// owes end yesterday too. Holding a figure that stops at yesterday against a straight line that
// runs through today would always read a little behind. There is no projection: the Home says
// where a goal stands, never where it would land.
//
// Targets are matched at brand scope, the scope the tile measures.

import {
  HOME_OBJECTIVE_METRICS,
  HOME_PROFILE_BRAND_SCOPE,
  type HomeGoalPeriod,
  type HomeGoalTarget,
  type HomeGoalTargetUpsertRequest,
  type HomeObjective,
  homeGoalPace,
  homeGoalPeriodWindow,
  homeGoalTargetUpsertRequestSchema,
} from '@continuum/contracts';
import { calendarDayIn, shiftDay } from '@/lib/paid-media/reportingWindow';
import type { GoalAmount, GoalWindow } from './goalModel';

export type GoalTargetsLoad =
  /** Nothing to ask: the brand has no ad account to measure a target against. */
  | { status: 'idle' }
  | { status: 'loading' }
  /** The route is not deployed, or the Backend could not be reached: targets are not here yet. */
  | { status: 'unavailable' }
  /** The route answered with a failure: a target may exist, and could not be read. */
  | { status: 'unreadable' }
  | { status: 'ready'; targets: HomeGoalTarget[] };

export type GoalTargetPhase =
  /** Its first day is still ahead. */
  | 'upcoming'
  /** Its first day is today, so no day of it is complete. */
  | 'started-today'
  | 'running'
  /** Its last day is complete. */
  | 'ended';

export type GoalTargetPeriod = {
  since: string;
  until: string;
  /** Calendar days in the period. */
  days: number;
  /** Complete days of the period so far: what the figure covers. */
  elapsedDays: number;
  /** The days to read the figure over; null with no complete day. */
  readWindow: GoalWindow | null;
  phase: GoalTargetPhase;
};

/**
 * The period today falls in, with its complete days. The period is told from today and the days
 * from yesterday: told from yesterday alone, a month target on the 1st would read as last month's.
 */
export function goalTargetPeriod(
  target: Pick<HomeGoalTarget, 'period' | 'periodStart' | 'periodEnd'>,
  now: Date = new Date(),
  timeZone?: string,
): GoalTargetPeriod {
  const today = calendarDayIn(now, timeZone);
  const yesterday = shiftDay(today, -1);
  const { since, until, days } = homeGoalPeriodWindow(target, today);
  const { elapsedDays } = homeGoalPeriodWindow(
    { period: 'custom', periodStart: since, periodEnd: until },
    yesterday,
  );
  const phase: GoalTargetPhase =
    today < since
      ? 'upcoming'
      : elapsedDays === 0
        ? 'started-today'
        : yesterday >= until
          ? 'ended'
          : 'running';
  return {
    since,
    until,
    days,
    elapsedDays,
    readWindow: elapsedDays > 0 ? { since, until: yesterday < until ? yesterday : until } : null,
    phase,
  };
}

/** The target set for this goal, matched by its id and what it measures, at brand scope. */
export function goalTargetFor(
  targets: HomeGoalTarget[],
  objective: HomeObjective,
): HomeGoalTarget | null {
  return (
    targets.find(
      (target) =>
        target.scope === HOME_PROFILE_BRAND_SCOPE &&
        target.objectiveId === objective.id &&
        target.metric === objective.metric,
    ) ?? null
  );
}

export type GoalActiveTarget = { target: HomeGoalTarget; period: GoalTargetPeriod };

export type GoalTargetStatus =
  | { kind: 'unavailable' }
  | { kind: 'unreadable' }
  | { kind: 'none' }
  /** Set, with no complete day to compare yet. */
  | ({ kind: 'not-running' } & GoalActiveTarget)
  /** Money in another currency than the figures: said, never compared. */
  | ({ kind: 'mismatch'; figureCurrencies: (string | null)[] } & GoalActiveTarget)
  | ({
      kind: 'compared';
      /** The figure the target is held against. */
      amount: GoalAmount;
      actual: number;
      /** actual / target. */
      progress: number;
      /** What the complete days owe, on a straight line. */
      expectedToDate: number;
      paceRatio: number | null;
    } & GoalActiveTarget);

/** A money target is held only against the figure in its own currency; a count against the sum. */
export function goalTargetComparison(
  active: GoalActiveTarget,
  amounts: GoalAmount[],
): Extract<GoalTargetStatus, { kind: 'mismatch' | 'compared' }> {
  const { target, period } = active;
  const amount = target.currency
    ? amounts.find(({ currency }) => currency === target.currency)
    : amounts[0];
  if (!amount) {
    return {
      kind: 'mismatch',
      target,
      period,
      figureCurrencies: amounts.map(({ currency }) => currency),
    };
  }
  const { progress, expectedToDate, paceRatio } = homeGoalPace({
    target: target.target,
    actual: amount.value,
    days: period.days,
    elapsedDays: period.elapsedDays,
  });
  return {
    kind: 'compared',
    target,
    period,
    amount,
    actual: amount.value,
    progress,
    expectedToDate,
    paceRatio,
  };
}

/** The figure against the straight line, in the design's bands. */
export function goalPaceWords(paceRatio: number): string {
  const percent = Math.round((paceRatio - 1) * 100);
  if (percent >= 3) return `${percent}% ahead of pace`;
  if (percent <= -6) return `${-percent}% below pace`;
  return 'On pace';
}

export const GOAL_PERIOD_LABELS: Record<HomeGoalPeriod, string> = {
  week: 'This week',
  month: 'This month',
  quarter: 'This quarter',
  custom: 'Custom dates',
};

export type GoalTargetFields = {
  brandId: string;
  objective: HomeObjective;
  target: string;
  period: HomeGoalPeriod;
  periodStart: string;
  periodEnd: string;
  currency: string;
};

export type GoalTargetRequestResult =
  | { ok: true; request: HomeGoalTargetUpsertRequest }
  | { ok: false; message: string };

/** The form's fields as the PUT's body, refused here in the contract's words when it would be
 *  refused there. */
export function goalTargetRequest(fields: GoalTargetFields): GoalTargetRequestResult {
  const target = Number(fields.target);
  if (fields.target.trim() === '' || !Number.isFinite(target) || target <= 0) {
    return { ok: false, message: 'Enter a target above zero.' };
  }
  const { metric, id } = fields.objective;
  const custom = fields.period === 'custom';
  const isMoney = HOME_OBJECTIVE_METRICS[metric].unit === 'currency';
  const parsed = homeGoalTargetUpsertRequestSchema.safeParse({
    brandId: fields.brandId,
    scope: HOME_PROFILE_BRAND_SCOPE,
    objectiveId: id,
    metric,
    target,
    period: fields.period,
    periodStart: custom && fields.periodStart ? fields.periodStart : null,
    periodEnd: custom && fields.periodEnd ? fields.periodEnd : null,
    currency: isMoney && fields.currency.trim() ? fields.currency.trim().toUpperCase() : null,
  });
  return parsed.success
    ? { ok: true, request: parsed.data }
    : { ok: false, message: parsed.error.issues[0]?.message ?? 'This target cannot be saved.' };
}
