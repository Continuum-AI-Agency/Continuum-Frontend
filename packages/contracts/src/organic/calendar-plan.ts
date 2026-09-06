import { z } from 'zod';
import {
  bulkContentFormatEnum,
  bulkContentObjectiveEnum,
  bulkContentPlanSchema,
} from '../streaming/bulk';
import { coerceLegacyHyperframeFormat, planStatusSchema } from '../streaming/organic';
import { organicPipelinePlatformSchema } from '../streaming/organic-pipeline';

/**
 * Calendar page → agent plan flow.
 *
 * The calendar's Generate button no longer generates. It PROPOSES a bulk plan from
 * the slots the user picked, a human approves the plan card, and approval mints the
 * one runV2 batch run — the same gate the chat agent already puts every generation
 * behind. Propose makes no model call and enqueues no job: the user chose the slots.
 *
 *   POST /api/organic/agent/plans/from-placements   calendarPlanProposeRequest  → BulkContentPlan
 *   POST /api/organic/agent/plans/:planId/approve   calendarPlanDecisionRequest → calendarPlanDecisionResponse
 *   POST /api/organic/agent/plans/:planId/reject    calendarPlanDecisionRequest → calendarPlanDecisionResponse
 *
 * Placements arrive in CALENDAR shape — what the grid already holds per slot. The
 * Backend derives each `bulkPlacementSpec` and marks it `openBrief`, so the batch
 * engine derives the angle per placement instead of reading a fabricated one.
 */

const dayIdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const calendarPlanPlacementSchema = z
  .object({
    /** The grid's slot id; becomes the plan placement's `specId` and the run's `placementId`. */
    placementId: z.string().min(1),
    platform: organicPipelinePlatformSchema,
    /** Defaults to 'post' when absent. Legacy 'hyperframe' coerces to 'reel'. */
    format: z.preprocess(coerceLegacyHyperframeFormat, bulkContentFormatEnum.optional()),
    dayId: dayIdSchema,
    /** ISO datetime; an offset is accepted and normalized to UTC server-side. */
    scheduledAt: z.string().datetime({ offset: true }),
    /** The platform account the slot is assigned to (integration asset id). */
    accountId: z.string().nullable().optional(),
    trendId: z.string().nullable().optional(),
    trendTitle: z.string().nullable().optional(),
    objective: bulkContentObjectiveEnum.optional(),
    /** The user's own words for this slot, when they typed any. */
    guidancePrompt: z.string().nullable().optional(),
  })
  .strict();

export const calendarPlanProposeRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    weekStart: dayIdSchema,
    placements: z.array(calendarPlanPlacementSchema).min(1).max(120),
    /** Defaults to `Calendar week of <weekStart>`. */
    title: z.string().min(1).optional(),
  })
  .strict();

/** The persisted plan, status 'proposed'. Render it with BulkPlanCard. */
export const calendarPlanProposeResponseSchema = bulkContentPlanSchema;

export const calendarPlanDecisionSchema = z.enum(['approve', 'reject']);

/**
 * Body of `/approve` and `/reject`. The path names the decision; the body must agree
 * (a mismatch is a 400), so a client cannot post a reject to the approve URL by accident.
 */
export const calendarPlanDecisionRequestSchema = z
  .object({
    decision: calendarPlanDecisionSchema,
    reason: z.string().max(2000).optional(),
  })
  .strict();

export const calendarPlanDecisionResponseSchema = z
  .object({
    planId: z.string().min(1),
    status: planStatusSchema,
    /**
     * Present after approve: the deterministic `run_<planId>` BulkRunPanel polls via
     * `GET /api/organic/agent/runs/:runId/events`. Re-approving returns the same id.
     */
    runId: z.string().min(1).optional(),
  })
  .strict();

export type CalendarPlanPlacement = z.infer<typeof calendarPlanPlacementSchema>;
export type CalendarPlanProposeRequest = z.infer<typeof calendarPlanProposeRequestSchema>;
export type CalendarPlanProposeResponse = z.infer<typeof calendarPlanProposeResponseSchema>;
export type CalendarPlanDecision = z.infer<typeof calendarPlanDecisionSchema>;
export type CalendarPlanDecisionRequest = z.infer<typeof calendarPlanDecisionRequestSchema>;
export type CalendarPlanDecisionResponse = z.infer<typeof calendarPlanDecisionResponseSchema>;
