import { z } from 'zod';
import { mediaPreviewApprovalSchema } from './preview-approval';

/**
 * Contract for the reel-video batch endpoint
 * (`POST /api/organic/agent/reels/generate`).
 *
 * Bulk reels are persisted as an ungenerated storyboard
 * (`mediaSuggestion.reel.scenes`). The user tags the reels they want and
 * approves a gated batch; the backend renders each tagged reel's stored
 * storyboard into durable Veo clips, seeds an editable AI Studio composition,
 * and streams per-draft progress as SSE frames. The browser may either stitch
 * those clips directly in Planner or edit/render the composition in AI Studio.
 */

/** Default cap on reels per batch. Backend may override via env; FE uses it to gate selection. */
export const DEFAULT_REEL_VIDEO_BATCH_MAX = 5;

/** Hard protocol ceiling (abuse guard); the configurable cap lives on the backend. */
const REEL_VIDEO_BATCH_HARD_MAX = 50;

export const organicUgcReferenceRoleSchema = z.enum(['character', 'product']);
export type OrganicUgcReferenceRole = z.infer<typeof organicUgcReferenceRoleSchema>;

export const organicUgcReferenceSchema = z
  .object({
    assetId: z.string().min(1),
    role: organicUgcReferenceRoleSchema,
    source: z.enum(['library', 'generated_anchor']).default('library'),
  })
  .strict();
export type OrganicUgcReference = z.infer<typeof organicUgcReferenceSchema>;

/**
 * Reviewable UGC generation policy persisted beside the reel storyboard.
 * Scene prompts remain canonical in `reel.scenes`; references use durable
 * Library asset ids so signed URLs are never stored as generation inputs.
 */
export const organicUgcSpecSchema = z
  .object({
    references: z.array(organicUgcReferenceSchema).max(3).default([]),
    sceneCount: z.number().int().min(3).max(5).default(4),
    targetDurationSeconds: z.number().min(12).max(30).default(20),
    captionsEnabled: z.boolean().default(true),
    characterDescription: z.string().min(1).max(1_000).nullable().optional(),
    /**
     * How each shot leaves its storyboard panel. `match` closes every shot on the
     * NEXT shot's panel, so the clips flow seamlessly; `cut` (default) lets each
     * clip end where the model takes it, which is the native UGC jump cut.
     * Costs no extra generation either way — every panel already exists.
     */
    continuity: z.enum(['cut', 'match']).default('cut'),
  })
  .strict();
export type OrganicUgcSpec = z.infer<typeof organicUgcSpecSchema>;

export const reelVideoBatchRequestSchema = z
  .object({
    brandId: z.string().min(1),
    approvals: z.array(mediaPreviewApprovalSchema).min(1).max(REEL_VIDEO_BATCH_HARD_MAX),
  })
  .strict();

/** Coarse stage a single reel is in, for progress UI. */
export const reelVideoStageEnum = z.enum([
  'planning',
  'generating_scenes',
  'stitching',
  'persisting',
]);

/**
 * One persisted, verified scene clip the backend hands to the browser for the
 * frontend-stitch path. `signedClipUrl` is required and non-empty — the backend
 * only emits clips that landed in storage with a usable URL (`isVerifiedAsset`).
 */
export const reelClipSchema = z
  .object({
    index: z.number().int().min(0),
    role: z.enum(['hook', 'body', 'cta']),
    durationSec: z.number().nonnegative(),
    /** Durable storage bucket; signedClipUrl is preview-only and may expire. */
    bucket: z.string().min(1),
    clipUrl: z.string(),
    signedClipUrl: z.string().min(1),
    captionText: z.string().nullable().optional(),
    mimeType: z.string().optional(),
    assetId: z.string().optional(),
  })
  .strict();

export const reelVideoBatchFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('batch_started'), total: z.number().int().nonnegative() }).strict(),
  z
    .object({
      type: z.literal('reel_started'),
      draftId: z.string().min(1),
      // Real organic.post_generation_jobs uuid backing this inline reel batch, so
      // the FE can cancel via POST /jobs/:jobId/cancel. Optional (graceful
      // degradation if job-row creation fails).
      jobId: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('reel_queued'),
      draftId: z.string().min(1),
      jobId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('reel_progress'),
      draftId: z.string().min(1),
      stage: reelVideoStageEnum,
      message: z.string().nullable().optional(),
      // Heartbeat telemetry (seconds), emitted periodically while multi-minute
      // Veo scene generation runs so the UI never reads as stuck.
      elapsedSec: z.number().nonnegative().optional(),
      etaSec: z.number().nonnegative().optional(),
      budgetSec: z.number().positive().optional(),
      sceneIndex: z.number().int().nonnegative().optional(),
      sceneCount: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('reel_ready'),
      draftId: z.string().min(1),
      mp4Url: z.string().nullable(),
      mp4Path: z.string(),
      mp4Bucket: z.string(),
      durationSec: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('reel_clips_ready'),
      draftId: z.string().min(1),
      aspectRatio: z.string().min(1),
      durationSec: z.number().nonnegative(),
      // >=1: a single-scene reel is valid — the browser passes the lone clip
      // through without splicing (which requires >=2). No server fallback.
      clips: z.array(reelClipSchema).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('reel_failed'),
      draftId: z.string().min(1),
      error: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal('batch_completed'),
      ready: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    })
    .strict(),
]);

export type ReelVideoBatchRequest = z.infer<typeof reelVideoBatchRequestSchema>;
export type ReelVideoStage = z.infer<typeof reelVideoStageEnum>;
export type ReelVideoBatchFrame = z.infer<typeof reelVideoBatchFrameSchema>;
export type ReelClip = z.infer<typeof reelClipSchema>;
