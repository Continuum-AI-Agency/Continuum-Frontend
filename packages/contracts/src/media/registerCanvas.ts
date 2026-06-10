// Request/response for POST /api/library/register-canvas — the bridge that
// auto-registers an AI Studio canvas creation into the media library
// (source="canvas") so it is browsable and (later) agent-queryable.

import { z } from "zod";
import { mediaKindSchema } from "./asset";

// Structured provenance stored on media.assets.origin_ref for canvas creations.
// kind:"canvas" is the discriminant agents/backfills key on.
export const canvasOriginRefSchema = z
  .object({
    kind: z.literal("canvas"),
    roomId: z.string().nullable().optional(),
    nodeId: z.string().min(1),
    prompt: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    generator: z.string().nullable().optional(),
  })
  .strict();
export type CanvasOriginRef = z.infer<typeof canvasOriginRefSchema>;

export const registerCanvasAssetRequestSchema = z
  .object({
    brandProfileId: z.string().uuid(),
    kind: mediaKindSchema,
    bucket: z.string().min(1),
    storagePath: z.string().min(1),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
    originRef: canvasOriginRefSchema,
  })
  .strict();
export type RegisterCanvasAssetRequest = z.infer<typeof registerCanvasAssetRequestSchema>;

export const registerCanvasAssetResponseSchema = z
  .object({
    // null when registration was skipped (flag off) or could not be resolved.
    assetId: z.string().nullable(),
  })
  .strict();
export type RegisterCanvasAssetResponse = z.infer<typeof registerCanvasAssetResponseSchema>;
