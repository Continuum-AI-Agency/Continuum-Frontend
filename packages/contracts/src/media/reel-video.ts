import { z } from "zod";

/**
 * Contract for the reel-video batch endpoint
 * (`POST /api/organic/agent/reels/generate`).
 *
 * Bulk reels are persisted as an ungenerated storyboard
 * (`mediaSuggestion.reel.scenes`). The user tags the reels they want and
 * approves a gated batch; the backend renders each tagged reel's stored
 * storyboard (Veo clips + stitch), writes the MP4 back onto the draft, and
 * streams per-draft progress as SSE frames. Selection is the "tag" — there is
 * no persisted tag column.
 */

/** Default cap on reels per batch. Backend may override via env; FE uses it to gate selection. */
export const DEFAULT_REEL_VIDEO_BATCH_MAX = 5;

/** Hard protocol ceiling (abuse guard); the configurable cap lives on the backend. */
const REEL_VIDEO_BATCH_HARD_MAX = 50;

export const reelVideoBatchRequestSchema = z
  .object({
    brandId: z.string().min(1),
    draftIds: z.array(z.string().min(1)).min(1).max(REEL_VIDEO_BATCH_HARD_MAX),
  })
  .strict();

/** Coarse stage a single reel is in, for progress UI. */
export const reelVideoStageEnum = z.enum([
  "planning",
  "generating_scenes",
  "stitching",
  "persisting",
]);

/**
 * One persisted, verified scene clip the backend hands to the browser for the
 * frontend-stitch path. `signedClipUrl` is required and non-empty — the backend
 * only emits clips that landed in storage with a usable URL (`isVerifiedAsset`).
 */
export const reelClipSchema = z
  .object({
    index: z.number().int().min(0),
    role: z.enum(["hook", "body", "cta"]),
    durationSec: z.number().nonnegative(),
    clipUrl: z.string(),
    signedClipUrl: z.string().min(1),
    captionText: z.string().nullable().optional(),
    mimeType: z.string().optional(),
  })
  .strict();

export const reelVideoBatchFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("batch_started"), total: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("reel_started"), draftId: z.string().min(1) }).strict(),
  z
    .object({
      type: z.literal("reel_progress"),
      draftId: z.string().min(1),
      stage: reelVideoStageEnum,
      message: z.string().nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("reel_ready"),
      draftId: z.string().min(1),
      mp4Url: z.string().nullable(),
      mp4Path: z.string(),
      mp4Bucket: z.string(),
      durationSec: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal("reel_clips_ready"),
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
      type: z.literal("reel_failed"),
      draftId: z.string().min(1),
      error: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("batch_completed"),
      ready: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    })
    .strict(),
]);

export type ReelVideoBatchRequest = z.infer<typeof reelVideoBatchRequestSchema>;
export type ReelVideoStage = z.infer<typeof reelVideoStageEnum>;
export type ReelVideoBatchFrame = z.infer<typeof reelVideoBatchFrameSchema>;
export type ReelClip = z.infer<typeof reelClipSchema>;
