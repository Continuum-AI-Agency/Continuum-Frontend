import { z } from 'zod';

/** Backend asks Continuum-Render for an H.264 proxy of an MXF / unplayable MOV. */
export const libraryPreviewProxyRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    assetVersionId: z.string().uuid(),
  })
  .strict();
export type LibraryPreviewProxyRequest = z.infer<typeof libraryPreviewProxyRequestSchema>;

export const libraryPreviewProxyResponseSchema = z
  .object({
    state: z.enum(['ready', 'awaiting_companion', 'failed', 'skipped']),
    signedUrl: z.string().nullable(),
    errorCode: z.string().nullable().optional(),
  })
  .strict();
export type LibraryPreviewProxyResponse = z.infer<typeof libraryPreviewProxyResponseSchema>;

/**
 * Large browser-playable videos also get a 720p `preview_video` the player streams instead
 * of the original. Measured on prod (2026-09-27, 789 videos): p50 3.4 MB at ~3 Mb/s, p99
 * 18.4 MB. A 720p H.264 proxy runs ~2–3 Mb/s, so below the p99 tail the original already
 * streams like a proxy and transcoding it is waste; above 20 MB the original is heavy
 * enough to stall playback on an ordinary connection.
 */
export const LIBRARY_PLAYBACK_PROXY_MIN_BYTES = 20 * 1024 * 1024;
export const LIBRARY_PLAYBACK_PROXY_SHORT_SIDE = 720;

export function needsPlaybackProxy(asset: {
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
}): boolean {
  if ((asset.sizeBytes ?? 0) <= LIBRARY_PLAYBACK_PROXY_MIN_BYTES) return false;
  if (asset.width && asset.height) {
    return Math.min(asset.width, asset.height) > LIBRARY_PLAYBACK_PROXY_SHORT_SIDE;
  }
  return true;
}
