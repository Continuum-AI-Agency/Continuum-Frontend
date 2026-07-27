// Request/response for POST /api/library/register-canvas — the bridge that
// registers an already-stored AI Studio output into the media library so it is
// browsable and agent-queryable. Register-in-place: the generator wrote the
// bytes to its own bucket, and Creative Operations records the durable asset.

import { z } from 'zod';
import { imageReformatModeSchema } from './reformat';

export const canvasOriginRefSchema = z
  .object({
    kind: z.literal('canvas'),
    roomId: z.string().nullable().optional(),
    nodeId: z.string().min(1),
    prompt: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    generator: z.string().nullable().optional(),
  })
  .strict();
export type CanvasOriginRef = z.infer<typeof canvasOriginRefSchema>;

export const resizeOriginRefSchema = z
  .object({
    kind: z.literal('resize'),
    sourceAssetId: z.string().uuid(),
    preset: z.string().min(1),
    aspectRatio: z.string().min(1),
    mode: imageReformatModeSchema.optional(),
    model: z.string().min(1).nullable().optional(),
  })
  .strict();
export type ResizeOriginRef = z.infer<typeof resizeOriginRefSchema>;

export const registeredAssetOriginRefSchema = z.discriminatedUnion('kind', [
  canvasOriginRefSchema,
  resizeOriginRefSchema,
]);
export type RegisteredAssetOriginRef = z.infer<typeof registeredAssetOriginRefSchema>;

export const registerCanvasAssetRequestSchema = z
  .object({
    brandProfileId: z.string().uuid(),
    // Studio outputs are renderable media; source project files stay in Library.
    kind: z.enum(['image', 'video']),
    bucket: z.string().min(1),
    storagePath: z.string().min(1),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
    sizeBytes: z.number().int().nonnegative().nullable().optional(),
    originRef: registeredAssetOriginRefSchema,
  })
  .strict();
export type RegisterCanvasAssetRequest = z.infer<typeof registerCanvasAssetRequestSchema>;

export const registerCanvasAssetResponseSchema = z
  .object({
    assetId: z.string().nullable(),
    assetVersionId: z.string().nullable(),
  })
  .strict();
export type RegisterCanvasAssetResponse = z.infer<typeof registerCanvasAssetResponseSchema>;
