// How much of an objective the team is aiming for, and by when (H02, the Goal Ring).
//
// `home_profiles.objectives` says WHAT the Home measures; a goal target says HOW MUCH, over
// which period. One target per (brand, scope, objective). Persisted in
// brand_profiles.home_goal_targets (RLS by brand membership) and written through the Backend
// at HOME_READ_PATHS.goalTargets: GET ?brandId= lists, PUT upserts, DELETE removes.

import { z } from 'zod';
import { HOME_OBJECTIVE_METRICS, homeObjectiveMetricSchema } from '../objectives';
import { homeReadEnvelopeSchema } from './envelope';

export const homeGoalPeriodSchema = z.enum(['week', 'month', 'quarter', 'custom']);
export type HomeGoalPeriod = z.infer<typeof homeGoalPeriodSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const scopeSchema = z
  .string()
  .regex(/^[A-Za-z0-9_:-]{1,64}$/, 'Scope is "brand" or an ad account id');
const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 code');

type TargetShape = {
  metric: z.infer<typeof homeObjectiveMetricSchema>;
  period: HomeGoalPeriod;
  periodStart?: string | null;
  periodEnd?: string | null;
  currency?: string | null;
};

/** The rules the table's CHECK constraints also hold, so a refusal happens before the write. */
function refineTarget(value: TargetShape, ctx: z.RefinementCtx): void {
  const start = value.periodStart ?? null;
  const end = value.periodEnd ?? null;
  if (value.period === 'custom') {
    if (!start || !end) {
      ctx.addIssue({ code: 'custom', message: 'A custom period needs a start and an end date.' });
    } else if (start > end) {
      ctx.addIssue({ code: 'custom', message: 'The period ends before it starts.' });
    }
  } else if (start || end) {
    ctx.addIssue({ code: 'custom', message: 'Only a custom period carries its own dates.' });
  }
  const isCurrency = HOME_OBJECTIVE_METRICS[value.metric].unit === 'currency';
  const currency = value.currency ?? null;
  if (isCurrency && !currency) {
    ctx.addIssue({ code: 'custom', message: 'A money target names its currency.' });
  }
  if (!isCurrency && currency) {
    ctx.addIssue({ code: 'custom', message: 'A count target has no currency.' });
  }
}

const targetFields = {
  scope: scopeSchema,
  objectiveId: z.string().min(1).max(64),
  metric: homeObjectiveMetricSchema,
  target: z.number().finite().positive(),
  period: homeGoalPeriodSchema,
  periodStart: isoDate.nullable(),
  periodEnd: isoDate.nullable(),
  currency: currencySchema.nullable(),
};

export const homeGoalTargetSchema = z
  .object({
    ...targetFields,
    updatedAt: z.string().nullable(),
    updatedBy: z.string().nullable(),
  })
  .superRefine(refineTarget);
export type HomeGoalTarget = z.infer<typeof homeGoalTargetSchema>;

export const homeGoalTargetsReadSchema = homeReadEnvelopeSchema(
  z.object({ targets: z.array(homeGoalTargetSchema) }),
);
export type HomeGoalTargetsRead = z.infer<typeof homeGoalTargetsReadSchema>;

export const homeGoalTargetUpsertRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    scope: scopeSchema.default('brand'),
    objectiveId: targetFields.objectiveId,
    metric: targetFields.metric,
    target: targetFields.target,
    period: targetFields.period,
    periodStart: isoDate.nullable().optional(),
    periodEnd: isoDate.nullable().optional(),
    currency: currencySchema.nullable().optional(),
  })
  .superRefine(refineTarget);
export type HomeGoalTargetUpsertRequest = z.infer<typeof homeGoalTargetUpsertRequestSchema>;

export const homeGoalTargetUpsertResponseSchema = z.object({ target: homeGoalTargetSchema });
export type HomeGoalTargetUpsertResponse = z.infer<typeof homeGoalTargetUpsertResponseSchema>;

export const homeGoalTargetDeleteRequestSchema = z.object({
  brandId: z.string().uuid(),
  scope: scopeSchema.default('brand'),
  objectiveId: targetFields.objectiveId,
});
export type HomeGoalTargetDeleteRequest = z.infer<typeof homeGoalTargetDeleteRequestSchema>;

export const homeGoalTargetDeleteResponseSchema = z.object({ deleted: z.boolean() });

// ── Period maths ────────────────────────────────────────────────────────────────────────────
// Dates are calendar days in the account's own timezone: the caller passes `today` already
// resolved there, so nothing below reads a clock or a timezone.

const DAY_MS = 86_400_000;
const toUtc = (date: string): number => Date.parse(`${date}T00:00:00Z`);
const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const daysBetweenInclusive = (since: string, until: string): number =>
  Math.round((toUtc(until) - toUtc(since)) / DAY_MS) + 1;

export type HomeGoalPeriodWindow = {
  since: string;
  until: string;
  /** Calendar days in the period. */
  days: number;
  /** Days of the period up to and including today, clamped to [0, days]. */
  elapsedDays: number;
};

export function homeGoalPeriodWindow(
  target: Pick<HomeGoalTarget, 'period' | 'periodStart' | 'periodEnd'>,
  today: string,
): HomeGoalPeriodWindow {
  const now = new Date(toUtc(today));
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  let since: string;
  let until: string;
  switch (target.period) {
    case 'week': {
      const mondayOffset = (now.getUTCDay() + 6) % 7;
      const start = toUtc(today) - mondayOffset * DAY_MS;
      since = fromUtc(start);
      until = fromUtc(start + 6 * DAY_MS);
      break;
    }
    case 'month':
      since = fromUtc(Date.UTC(year, month, 1));
      until = fromUtc(Date.UTC(year, month + 1, 0));
      break;
    case 'quarter': {
      const first = Math.floor(month / 3) * 3;
      since = fromUtc(Date.UTC(year, first, 1));
      until = fromUtc(Date.UTC(year, first + 3, 0));
      break;
    }
    case 'custom':
      if (!target.periodStart || !target.periodEnd) {
        throw new Error('A custom goal period needs its start and end dates.');
      }
      since = target.periodStart;
      until = target.periodEnd;
      break;
  }
  const days = daysBetweenInclusive(since, until);
  const elapsed = today < since ? 0 : daysBetweenInclusive(since, today < until ? today : until);
  return { since, until, days, elapsedDays: Math.min(days, Math.max(0, elapsed)) };
}

export type HomeGoalPace = {
  /** actual / target. */
  progress: number;
  /** The share of the target the elapsed days owe, on a straight line. */
  expectedToDate: number;
  /** actual / expectedToDate; null before the period starts. */
  paceRatio: number | null;
  /** The actual extended linearly to the end of the period; null before it starts. */
  projected: number | null;
};

export function homeGoalPace(input: {
  target: number;
  actual: number;
  days: number;
  elapsedDays: number;
}): HomeGoalPace {
  const expectedToDate = (input.target * input.elapsedDays) / input.days;
  const started = input.elapsedDays > 0;
  return {
    progress: input.actual / input.target,
    expectedToDate,
    paceRatio: started && expectedToDate > 0 ? input.actual / expectedToDate : null,
    projected: started ? (input.actual / input.elapsedDays) * input.days : null,
  };
}
