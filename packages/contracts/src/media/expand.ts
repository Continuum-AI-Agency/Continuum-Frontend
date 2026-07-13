/**
 * Manual Stage-2 (blueprint) trigger for the checkpointed post pipeline. The
 * worker normally auto-enqueues `expand_draft` after the TEXT checkpoint, so
 * this endpoint is the user-facing "Enrich" action: it enqueues a durable
 * `expand_draft` job per draft (512px storyboard + stored prompts + reel
 * scenes) and returns immediately — completion lands on the draft row and
 * arrives over Realtime, not in the response. Peer of `realize.ts` (Stage 3).
 */

import { z } from 'zod';

export const mediaExpandRequestSchema = z
  .object({
    brandId: z.string().min(1),
    draftIds: z.array(z.string().min(1)).min(1).max(50),
  })
  .strict();
export type MediaExpandRequest = z.infer<typeof mediaExpandRequestSchema>;

/**
 * Why a draft was skipped instead of enqueued. Machine-readable so the caller
 * can distinguish "already done" from "run copy first" without string-matching.
 */
export const mediaExpandSkipReasonEnum = z.enum([
  // Draft missing, or owned by another brand (indistinguishable on purpose).
  'not_found',
  // No content_json to expand — run generate-copy first.
  'no_copy_yet',
  // media_stage is realizing/realized; re-sketching under final pixels is unsafe.
  'already_realized',
  // The user attached their own creative — enrichment must not clobber it.
  'user_supplied',
  // The durable enqueue itself failed (jobId stays null).
  'enqueue_failed',
]);
export type MediaExpandSkipReason = z.infer<typeof mediaExpandSkipReasonEnum>;

export const mediaExpandJobSchema = z
  .object({
    draftId: z.string().min(1),
    // The organic.post_generation_jobs uuid backing the enqueued expand, or null
    // when the draft was skipped / the enqueue failed (see `error`).
    jobId: z.string().min(1).nullable(),
    error: mediaExpandSkipReasonEnum.optional(),
  })
  .strict();
export type MediaExpandJob = z.infer<typeof mediaExpandJobSchema>;

export const mediaExpandResponseSchema = z
  .object({
    jobs: z.array(mediaExpandJobSchema),
  })
  .strict();
export type MediaExpandResponse = z.infer<typeof mediaExpandResponseSchema>;
