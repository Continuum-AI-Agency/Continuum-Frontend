/**
 * HTTP envelopes for the planner's per-draft enrichment ladder.
 *
 * A draft advances through three stages, each enriching the SAME persisted row
 * (`organic.organic_calendar_drafts`) in place:
 *
 *   copy       `post_generation`    → writes content_json, media_stage text_only
 *   blueprint  `expand_draft`       → writes the 512px storyboard, storyboard_ready
 *   media      `realize_post_media` → writes publishable pixels, realized
 *
 * Stage 1 auto-enqueues stage 2 on success, so `build_blueprint` is a RECOVERY
 * action for drafts stranded at `text_only`. Stage 3 already has its own routes
 * (`media/realize`, `reels/generate`) and is not modelled here.
 *
 * The target draft is the URL param, never the body — these envelopes carry only
 * the brand it must be scoped to plus per-stage options.
 */

import { z } from 'zod';

import { organicMediaStageSchema } from '../streaming/organic-pipeline';

export const draftEnrichmentStageEnum = z.enum(['generate_copy', 'build_blueprint']);
export type DraftEnrichmentStage = z.infer<typeof draftEnrichmentStageEnum>;

export const draftEnrichmentRequestSchema = z
  .object({
    brandId: z.string().min(1),
    // Extra creative direction folded into the post's guidancePrompt. Copy stage only.
    guidancePrompt: z.string().nullable().optional(),
    timezone: z.string().optional(),
    // Copy stage only. A plain re-enqueue on a draft that already has copy would
    // RESUME rather than regenerate (the worker skips text generation whenever a
    // text checkpoint is present), so rewriting requires clearing that checkpoint
    // first. Destructive: the existing caption is discarded.
    regenerate: z.boolean().optional(),
  })
  .strict();
export type DraftEnrichmentRequest = z.infer<typeof draftEnrichmentRequestSchema>;

export const draftEnrichmentResponseSchema = z
  .object({
    status: z.literal('queued'),
    stage: draftEnrichmentStageEnum,
    draftId: z.string().min(1),
    jobId: z.string().min(1),
    // The draft's enrichment stage at enqueue time. Reuses the canonical
    // media_stage enum so the Frontend renders one source of truth.
    mediaStage: organicMediaStageSchema,
  })
  .strict();
export type DraftEnrichmentResponse = z.infer<typeof draftEnrichmentResponseSchema>;

/**
 * Machine-readable `code` on a 409. Each names the precondition that failed, so
 * the Frontend can decide between "offer Rewrite", "run copy first", and "this
 * draft is already past the point where rewriting is safe".
 */
export const draftEnrichmentConflictCodeEnum = z.enum([
  // generate-copy without `regenerate` on a draft that already has content_json.
  'already_has_copy',
  // generate-copy with `regenerate` on a draft whose media is realizing/realized —
  // a new concept would strand the pixels already rendered against the old one.
  'already_realized',
  // build-blueprint on a draft with no content_json to expand.
  'no_copy_yet',
  // build-blueprint on a draft already past text_only.
  'already_blueprinted',
]);
export type DraftEnrichmentConflictCode = z.infer<typeof draftEnrichmentConflictCodeEnum>;
