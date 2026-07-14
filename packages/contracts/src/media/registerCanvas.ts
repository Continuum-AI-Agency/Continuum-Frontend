// Request/response for POST /api/library/register-canvas — the bridge that
// registers an already-stored AI Studio output into the media library so it is
// browsable and (later) agent-queryable. Register-in-place: the generator wrote
// the bytes to its own bucket, we only record the media.assets row.

import { z } from 'zod';
import { imageReformatModeSchema } from './reformat';

// Structured provenance stored on media.assets.origin_ref for canvas creations.
// kind:"canvas" is the discriminant agents/backfills key on. The Library assets
// that fed the generation are NOT on the wire: the route reads them back off the
// persisted graph, which is both more complete (it sees every reference node) and
// not client-assertable.
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

// A Library asset reframed for a placement by Smart resize. This generation runs
// outside a canvas, so there is no graph to read the lineage back off — the caller
// names the asset it reframed. The route re-checks brand access before trusting it,
// so the worst a caller can do is mislabel lineage inside its own brand.
export const resizeOriginRefSchema = z
  .object({
    kind: z.literal('resize'),
    sourceAssetId: z.string().uuid(),
    /** Placement preset id, e.g. "ig-story-reel". */
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
    // Studio outputs are always renderable media — never 'file' source uploads.
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
    // null when registration was skipped (flag off) or could not be resolved.
    assetId: z.string().nullable(),
  })
  .strict();
export type RegisterCanvasAssetResponse = z.infer<typeof registerCanvasAssetResponseSchema>;
