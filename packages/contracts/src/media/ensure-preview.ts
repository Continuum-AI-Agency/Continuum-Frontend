import { z } from 'zod';

// No relative imports: library-share bundles this file by path, and the edge bundler cannot
// follow an extensionless one. sharePreviewRoleFor lives in asset-formats.ts for that reason.

// "Ensure preview": a stored, share-safe preview for an EXISTING asset, made on demand.
// Protected share links never sign originals, so an asset without a stored rendition shows a
// placeholder there. library-share (service role) asks for one per asset a protected-link
// member is looking at; the Backend makes it once and it is a rendition like any other.
//
//   POST {CONTINUUM_BACKEND_URL}/internal/media/ensure-preview
//   header  x-internal-token: MEDIA_INTERNAL_TOKEN
//   body    EnsureAssetPreviewRequest
//   200     EnsureAssetPreviewResponse — answers at once; the work runs in the background
//
// Readiness is observable without calling again: a media.asset_renditions row with
// asset_version_id = the answer's assetVersionId, role = its role, and state = 'ready'.
// Calling again is idempotent and cheap: 'ready' once the row is, 'pending' while it is
// being made (never started twice), 'failed' for ten minutes after a failure, then retried.

export const ENSURE_ASSET_PREVIEW_PATH = '/internal/media/ensure-preview';

export const ensureAssetPreviewRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    /**
     * The version the viewer is shown (a share pins one). Optional and additive: without it,
     * the asset's head. A version of another asset answers not_found.
     */
    assetVersionId: z.string().uuid().optional(),
  })
  .strict();
export type EnsureAssetPreviewRequest = z.infer<typeof ensureAssetPreviewRequestSchema>;

export const ensureAssetPreviewRoleSchema = z.enum(['preview_image', 'preview_video']);
export type EnsureAssetPreviewRole = z.infer<typeof ensureAssetPreviewRoleSchema>;

export const ensureAssetPreviewResponseSchema = z
  .object({
    assetId: z.string().uuid(),
    /** The version the preview belongs to (the one asked for, else the head); null only
     *  when the asset or that version is not found. */
    assetVersionId: z.string().uuid().nullable(),
    /** Which rendition to look for; null when this kind of file gets none (unsupported). */
    role: ensureAssetPreviewRoleSchema.nullable(),
    state: z.enum(['ready', 'pending', 'failed', 'unsupported', 'not_found']),
    /** The ready rendition's id, when state is 'ready'. */
    renditionId: z.string().uuid().nullable(),
  })
  .strict();
export type EnsureAssetPreviewResponse = z.infer<typeof ensureAssetPreviewResponseSchema>;

/** Stored image previews are ≤1600 px on the long edge, WebP. */
export const LIBRARY_PREVIEW_IMAGE_MAX_EDGE = 1600;
