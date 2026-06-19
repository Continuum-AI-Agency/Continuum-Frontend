import { z } from "zod";

import {
  organicHyperframeAspectRatioSchema,
  organicHyperframeStylePresetSchema,
  organicHyperframeToneSchema,
  organicPipelinePlatformSchema,
} from "./organic-pipeline";
import { coerceLegacyHyperframeFormat } from "./organic";

/**
 * Bulk content generation (Milestone 1) — canonical contracts.
 *
 * A bulk plan is the on-demand "generate a coherent, varied month" artifact:
 * a strategy brief, a deterministic schedule, and N expanded placement specs.
 * On approval the Backend routes the whole plan into a single `runV2` batch
 * run (see App/organic/runtime/generationRuns.ts) instead of enqueuing N chat
 * jobs. Both the Backend (planner emit + trigger) and the Frontend
 * (BulkPlanCard render) import these from `@continuum/contracts`.
 *
 * The piece count is derived from the prompt + strategy brief (horizon ×
 * cadence × platforms, or an explicit user count). `.max(120)` is a guard,
 * not a target.
 */

export const bulkContentFormatEnum = z.enum([
  "reel",
  "post",
  "carousel",
  "story",
]);

/** Format field that coerces legacy "hyperframe" → "reel" (HyperFrame is a method, not a format). */
const bulkContentFormatField = z.preprocess(coerceLegacyHyperframeFormat, bulkContentFormatEnum);

export const bulkContentObjectiveEnum = z.enum([
  "follow",
  "save",
  "click",
  "comment",
  "dm",
  "share",
]);

/** Roles map onto the existing reel multi-shot model (ReelSceneAsset.role). */
export const bulkReelShotRoleEnum = z.enum(["hook", "body", "cta"]);

/**
 * One shot of a multi-shot reel storyboard. In M1 this is storyboard-only —
 * the asset pipeline renders a first-frame image per shot; the actual video
 * clip (clipUrl) is filled in M2 by generateReelVideo/stitchReel.
 */
export const bulkReelShotSchema = z
  .object({
    role: bulkReelShotRoleEnum,
    durationSec: z.number().int().min(1).max(60),
    prompt: z.string().min(1),
    captionText: z.string().nullable().optional(),
  })
  .strict();

/**
 * Brief for a HyperFrames (HTML video composition) placement. HyperFrame is a
 * production METHOD, not a post format: a placement carrying this brief is a
 * `format: 'reel'` whose media is produced via HyperFrames. It rides into the
 * runV2 PlacementSeed `metadata` and is synthesized into the backend
 * `HyperframeBrief` that drives `produceHyperframesComposition`.
 */
export const bulkHyperframeBriefSchema = z
  .object({
    stylePreset: organicHyperframeStylePresetSchema,
    tone: organicHyperframeToneSchema,
    aspectRatio: organicHyperframeAspectRatioSchema,
    durationSec: z.number().int().min(5).max(30),
  })
  .strict();

/** A single content pillar/theme the month is organized around. */
export const bulkPillarSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
  })
  .strict();

/** Target proportion of the batch that should be a given format. */
export const bulkFormatMixSchema = z
  .object({
    format: bulkContentFormatField,
    weight: z.number().min(0).max(1),
  })
  .strict();

/** Target proportion of the batch that should go to a given platform. */
export const bulkPlatformSplitSchema = z
  .object({
    platform: organicPipelinePlatformSchema,
    weight: z.number().min(0).max(1),
  })
  .strict();

/** Per-platform best-time slots (local "HH:MM") the scheduler places into. */
export const bulkBestTimeSchema = z
  .object({
    platform: organicPipelinePlatformSchema,
    times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1),
  })
  .strict();

/**
 * Tier-1 output of the bulk planner: the high-level strategy for the month.
 * Grounded in trends + brand context. The expansion (Tier 2) turns this into
 * the placement specs.
 */
export const bulkStrategyBriefSchema = z
  .object({
    summary: z.string().min(1),
    pillars: z.array(bulkPillarSchema).min(1),
    mix: z.array(bulkFormatMixSchema).min(1),
    platformSplit: z.array(bulkPlatformSplitSchema).min(1),
    cadencePerDayPerPlatform: z.number().min(0),
    horizonWeeks: z.number().int().min(1).max(12),
    trendAnchors: z
      .array(
        z
          .object({
            trendId: z.string().nullable(),
            title: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
    /**
     * Derived from the prompt/brief; optional — when absent the count falls
     * out of horizon × cadence × platforms. Never a forced minimum.
     */
    targetCount: z.number().int().min(1).max(120).nullable().optional(),
  })
  .strict();

/** Deterministic schedule shape fed to the AutoScheduler. */
export const bulkScheduleSchema = z
  .object({
    horizonWeeks: z.number().int().min(1).max(12),
    postsPerDayPerPlatform: z.number().min(0),
    /** ISO date (YYYY-MM-DD) the horizon begins; defaults to next Monday. */
    startDate: z.string().nullable().optional(),
    bestTimes: z.array(bulkBestTimeSchema).optional(),
  })
  .strict();

/**
 * One expanded placement spec. A superset of the Backend `PlacementSeed`
 * consumed by `runV2`: the creative fields (pillar/angle/hook/objective) ride
 * into the seed's `metadata`/`desiredFormat`; `dayId`/`scheduledAt` are filled
 * by the AutoScheduler (nullable pre-schedule). Reels carry a `shots[]`
 * multi-shot storyboard.
 */
export const bulkPlacementSpecSchema = z
  .object({
    specId: z.string().min(1),
    platform: organicPipelinePlatformSchema,
    format: bulkContentFormatField,
    pillar: z.string().min(1),
    angle: z.string().min(1),
    hook: z.string().min(1),
    objective: bulkContentObjectiveEnum,
    trendId: z.string().nullable(),
    trendTitle: z.string().nullable().optional(),
    audienceSegment: z.string().nullable().optional(),
    guidancePrompt: z.string().nullable().optional(),
    // Scheduling — populated by the AutoScheduler.
    dayId: z.string().nullable().optional(),
    scheduledAt: z.string().nullable().optional(),
    // Multi-shot storyboard (reels). Null/absent for non-reel formats.
    shots: z.array(bulkReelShotSchema).nullable().optional(),
    // HyperFrames composition brief (production method on a reel placement).
    // Null/absent when the reel is not produced via HyperFrames.
    hyperframe: bulkHyperframeBriefSchema.nullable().optional(),
  })
  .strict();

/**
 * The persisted bulk plan. Stored on `organic.organic_agent_plans`
 * (kind='bulk', strategy_brief, schedule) and emitted as a `ui.plan_card`
 * whose `data` validates against this schema (discriminated by `kind`).
 */
export const bulkContentPlanSchema = z
  .object({
    planId: z.string().min(1),
    kind: z.literal("bulk"),
    title: z.string().min(1),
    summary: z.string().optional(),
    strategyBrief: bulkStrategyBriefSchema,
    schedule: bulkScheduleSchema,
    placements: z.array(bulkPlacementSpecSchema).min(1).max(120),
  })
  .strict();

export type BulkContentFormat = z.infer<typeof bulkContentFormatEnum>;
export type BulkContentObjective = z.infer<typeof bulkContentObjectiveEnum>;
export type BulkReelShotRole = z.infer<typeof bulkReelShotRoleEnum>;
export type BulkReelShot = z.infer<typeof bulkReelShotSchema>;
export type BulkPillar = z.infer<typeof bulkPillarSchema>;
export type BulkFormatMix = z.infer<typeof bulkFormatMixSchema>;
export type BulkPlatformSplit = z.infer<typeof bulkPlatformSplitSchema>;
export type BulkBestTime = z.infer<typeof bulkBestTimeSchema>;
export type BulkHyperframeBrief = z.infer<typeof bulkHyperframeBriefSchema>;
export type BulkStrategyBrief = z.infer<typeof bulkStrategyBriefSchema>;
export type BulkSchedule = z.infer<typeof bulkScheduleSchema>;
export type BulkPlacementSpec = z.infer<typeof bulkPlacementSpecSchema>;
export type BulkContentPlan = z.infer<typeof bulkContentPlanSchema>;
