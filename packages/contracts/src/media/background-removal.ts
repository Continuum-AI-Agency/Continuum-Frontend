/**
 * AI background removal — the HTTP contract between the Canvas action ops and
 * `POST /api/ai-studio/remove-background`.
 *
 * Peer of `reformat.ts`, and deliberately the same shape: one request, an SSE
 * stream of `started | progress | completed | failed`, and a machine-readable
 * error code so the canvas can tell "this brand has no entitlement" from "the
 * matte service is down" without string-matching a message.
 *
 * The knobs themselves are NOT here — they live on the action registry as
 * `removeBackgroundConfig` (`../ai-studio/action-registry.ts`), because the node
 * stores them in `node.data.config` and the registry is the one place a config
 * shape is allowed to be declared. This file carries only what crosses the wire.
 */

import { z } from 'zod';

export const backgroundRemovalModeSchema = z.enum(['remove', 'replace']);
export type BackgroundRemovalMode = z.infer<typeof backgroundRemovalModeSchema>;

/**
 * Which lane the request takes. This is not cosmetic: an image comes back as
 * bytes on the response, while a video is streamed into storage by MediaStream
 * and comes back as a registered asset — two different completion payloads.
 */
export const backgroundRemovalKindSchema = z.enum(['image', 'video']);
export type BackgroundRemovalKind = z.infer<typeof backgroundRemovalKindSchema>;

export const backgroundRemovalRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    sourceAssetId: z.string().uuid(),
    requestId: z.string().uuid(),
    kind: backgroundRemovalKindSchema,
    mode: backgroundRemovalModeSchema.default('remove'),
    replacement: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    featherPx: z.number().min(0).max(20).default(0),
    // Where the node lives, so the registered asset is traceable back to the
    // canvas that produced it — lands verbatim in `media.assets.origin_ref`.
    origin: z
      .object({
        roomId: z.string().min(1).max(200),
        nodeId: z.string().min(1).max(200),
      })
      .strict()
      .optional(),
  })
  .strict();
export type BackgroundRemovalRequest = z.infer<typeof backgroundRemovalRequestSchema>;

const requestDataSchema = z.object({ requestId: z.string().uuid() }).strict();

/**
 * The stages a caller can actually observe. `matting` is the long one — it is the
 * whole GPU pass — and `relaying` only ever appears on the video lane, where
 * MediaStream is moving bytes from the matte service's staging bucket into the
 * brand's library.
 */
export const backgroundRemovalStageSchema = z.enum([
  'loading_source',
  'matting',
  'relaying',
  'storing',
  'registering',
]);
export type BackgroundRemovalStage = z.infer<typeof backgroundRemovalStageSchema>;

export const backgroundRemovalCompletedDataSchema = requestDataSchema.extend({
  assetId: z.string().uuid(),
  versionId: z.string().uuid(),
  sourceVersionId: z.string().uuid(),
  kind: backgroundRemovalKindSchema,
  mode: backgroundRemovalModeSchema,
  signedUrl: z.string().url(),
  bucket: z.string().min(1),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  // `image/png` or `video/webm`. Never `video/mp4`: MP4 carries no alpha channel,
  // so a transparent result in an MP4 would be a silently flattened one.
  mimeType: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  /** True when the output actually carries an alpha channel (`mode: 'remove'`). */
  hasAlpha: z.boolean(),
});
export type BackgroundRemovalCompletedData = z.infer<typeof backgroundRemovalCompletedDataSchema>;

export const backgroundRemovalErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'SOURCE_NOT_FOUND',
  'UNSUPPORTED_SOURCE',
  'SOURCE_TOO_LONG',
  'ENTITLEMENT_REQUIRED',
  'USAGE_CAP_REACHED',
  'RATE_LIMITED',
  // The matte service itself: unreachable, out of GPU quota, or it threw.
  'MATTE_FAILED',
  // MediaStream could not move the finished video into storage.
  'RELAY_FAILED',
  'STORAGE_FAILED',
  'REGISTRATION_FAILED',
  'CANCELLED',
  'INTERNAL_ERROR',
]);
export type BackgroundRemovalErrorCode = z.infer<typeof backgroundRemovalErrorCodeSchema>;

export const backgroundRemovalEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('background_removal.started'),
    data: requestDataSchema,
  }),
  z.object({
    type: z.literal('background_removal.progress'),
    data: requestDataSchema.extend({
      stage: backgroundRemovalStageSchema,
      progress: z.number().int().min(0).max(100),
    }),
  }),
  z.object({
    type: z.literal('background_removal.completed'),
    data: backgroundRemovalCompletedDataSchema,
  }),
  z.object({
    type: z.literal('background_removal.failed'),
    data: requestDataSchema.extend({
      code: backgroundRemovalErrorCodeSchema,
      message: z.string().min(1),
      retryable: z.boolean(),
    }),
  }),
]);
export type BackgroundRemovalEvent = z.infer<typeof backgroundRemovalEventSchema>;

// ---------------------------------------------------------------------------
// Backend ↔ matte service (Cloud Run). Not consumed by the Frontend, but it lives
// here because it is a boundary schema and the bench asserts against it too.
// ---------------------------------------------------------------------------

export const matteImageResponseSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** Base64 RGBA PNG. Small enough to travel inline; a video never is. */
    png: z.string().min(1),
  })
  .strict();
export type MatteImageResponse = z.infer<typeof matteImageResponseSchema>;

/**
 * Where a clip's billed seconds went.
 *
 * Every second of the job costs the same $0.0003 whether it is inference, muxing or
 * the CUDA runtime starting up, so this is what decides which term to attack next.
 * `startupMs` is the residual — the interpreter, the imports and the GPU context —
 * and on a short clip it is usually the largest one.
 *
 * `_inferenceMs` and `_encodeMs` are BREAKDOWNS of `matteMs`, not sibling phases.
 * Only `totalMs` is a whole.
 */
export const matteTimingsSchema = z
  .object({
    startupMs: z.number().int(),
    downloadMs: z.number().int().nonnegative(),
    warmWaitMs: z.number().int().nonnegative(),
    matteMs: z.number().int().nonnegative(),
    uploadMs: z.number().int().nonnegative(),
    totalMs: z.number().int().nonnegative(),
    _inferenceMs: z.number().int().nonnegative().optional(),
    _encodeMs: z.number().int().nonnegative().optional(),
  })
  .partial()
  .passthrough();
export type MatteTimings = z.infer<typeof matteTimingsSchema>;

export const matteVideoResponseSchema = z
  .object({
    /** V4-signed GET URL into the matte service's own staging bucket. */
    resultUrl: z.string().url(),
    mimeType: z.literal('video/webm'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    frames: z.number().int().positive(),
    durationMs: z.number().int().nonnegative(),
    /** Frames that got a FRESH matte; the rest held the previous one (FRAME_STRIDE). */
    mattedFrames: z.number().int().nonnegative().optional(),
    timings: matteTimingsSchema.optional(),
  })
  .strict();
export type MatteVideoResponse = z.infer<typeof matteVideoResponseSchema>;
