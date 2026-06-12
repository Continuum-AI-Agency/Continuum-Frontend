/**
 * Step-3 (opt-in headless media generation) for image/carousel drafts. After the
 * TEXT checkpoint + the creative-director BLUEPRINT, the user can intentionally
 * trigger this token-heavy step. The endpoint reads each draft's persisted
 * blueprint and realizes the media, deep-merging onto the draft and flipping
 * `mediaStatus` to 'ready'. (Reels keep their own FE-stitch path via
 * `reelVideoBatchFrameSchema` — this covers image + carousel only.)
 */

import { z } from "zod";

export const DEFAULT_MEDIA_REALIZE_BATCH_MAX = 10;

export const mediaRealizeRequestSchema = z
  .object({
    brandId: z.string().min(1),
    draftIds: z.array(z.string().min(1)).min(1).max(50),
  })
  .strict();
export type MediaRealizeRequest = z.infer<typeof mediaRealizeRequestSchema>;

export const mediaRealizeStageEnum = z.enum([
  "loading",
  "generating",
  "persisting",
]);
export type MediaRealizeStage = z.infer<typeof mediaRealizeStageEnum>;

export const mediaRealizeFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("realize_batch_started"), total: z.number().int().min(0) }).strict(),
  z.object({ type: z.literal("realize_started"), draftId: z.string().min(1) }).strict(),
  z
    .object({
      type: z.literal("realize_progress"),
      draftId: z.string().min(1),
      stage: mediaRealizeStageEnum,
      message: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("realize_ready"),
      draftId: z.string().min(1),
      kind: z.enum(["image", "carousel"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("realize_failed"),
      draftId: z.string().min(1),
      error: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("realize_batch_completed"),
      ready: z.number().int().min(0),
      failed: z.number().int().min(0),
    })
    .strict(),
]);
export type MediaRealizeFrame = z.infer<typeof mediaRealizeFrameSchema>;
