/**
 * HTTP envelope for the planner's one-shot post generator.
 *
 * The "very light harness": the composer sends predetermined inputs — selected
 * metrics, insights, winning angles, tagged library creatives, trends — and the
 * Backend runs ONE schema-direct creative pass (no strategist, no editorial, no
 * angle/hook agents, no queue wait), persists the text-checkpoint draft, and
 * returns it synchronously. Media realization stays a separate, user-gated
 * step; a Stage-2 blueprint job is auto-enqueued exactly like the worker path.
 *
 * Selected evidence carries a `refId` so numeric claims the copy makes against
 * it are grounded (claimGuard) instead of flagged data_needed.
 */

import { z } from 'zod';

import { creativeRefSchema } from '../media/attach';
import { numericClaimSchema, organicPostFormatEnum } from '../streaming/organic';
import { quickCreateObjectiveEnum, quickCreatePlatformEnum } from './quick-create';

export const oneShotMetricSchema = z
  .object({
    // Stable evidence reference — claims citing this metric ground against it.
    refId: z.string().min(1),
    key: z.string().min(1),
    label: z.string().min(1),
    value: z.union([z.number(), z.string()]),
    unit: z.string().nullable().optional(),
    delta: z.number().nullable().optional(),
    window: z.string().nullable().optional(),
  })
  .strict();
export type OneShotMetric = z.infer<typeof oneShotMetricSchema>;

export const oneShotInsightSchema = z
  .object({
    refId: z.string().min(1),
    category: z.string().min(1),
    summary: z.string().min(1),
    recommendation: z.string().nullable().optional(),
  })
  .strict();
export type OneShotInsight = z.infer<typeof oneShotInsightSchema>;

export const oneShotAngleSchema = z
  .object({
    refId: z.string().min(1),
    angle: z.string().min(1),
    evidence: z.string().nullable().optional(),
  })
  .strict();
export type OneShotAngle = z.infer<typeof oneShotAngleSchema>;

export const oneShotPostRequestSchema = z
  .object({
    brandId: z.string().min(1),
    platform: quickCreatePlatformEnum,
    scheduledAt: z.string().min(1),
    // One-line creative direction. When omitted, the first selected angle is
    // authoritative; one of the two must be present.
    direction: z.string().nullable().optional(),
    format: organicPostFormatEnum.nullable().optional(),
    objective: quickCreateObjectiveEnum.optional(),
    // Predetermined inputs from the planner pickers.
    metrics: z.array(oneShotMetricSchema).default([]),
    insights: z.array(oneShotInsightSchema).default([]),
    angles: z.array(oneShotAngleSchema).default([]),
    // Tagged library creatives. >1 ⇒ carousel (selection order = slide order).
    libraryCreativeRefs: z.array(creativeRefSchema).default([]),
    trendIds: z.array(z.string().uuid()).default([]),
    guidancePrompt: z.string().nullable().optional(),
    idempotencyKey: z.string().min(1).optional(),
    timezone: z.string().optional(),
    platformAccountIds: z.record(z.string(), z.string()).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.direction?.trim()) || value.angles.length > 0,
    'Provide a direction or select at least one angle',
  );
export type OneShotPostRequest = z.infer<typeof oneShotPostRequestSchema>;

export const oneShotPostResponseSchema = z
  .object({
    status: z.literal('created'),
    draftId: z.string().min(1),
    // Inline observability job (cancel/generations ticker); null when the
    // tracker row could not be created (generation still succeeded).
    jobId: z.string().nullable(),
    caption: z.string().nullable(),
    scheduledAt: z.string().min(1),
    platform: z.string().min(1),
    // The persisted text-checkpoint placement — the composer inserts this
    // directly into the calendar without waiting for a refetch.
    placement: z.record(z.string(), z.unknown()),
    // Numeric-claim provenance from the deterministic audit; data_needed
    // entries mark numbers with no grounded evidence.
    claims: z.array(numericClaimSchema).default([]),
  })
  .strict();
export type OneShotPostResponse = z.infer<typeof oneShotPostResponseSchema>;
