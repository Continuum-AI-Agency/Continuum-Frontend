import { z } from 'zod';
import { classifyLibraryFile } from './asset-formats';

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

const STORED_IMAGE_PREVIEW_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);
const STORED_IMAGE_PREVIEW_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

/**
 * The share-safe preview a file gets: a WebP still for a JPEG/PNG/WebP/AVIF photo, a 720p
 * proxy for any video (small browser MP4s included — a share never signs the original), none
 * for anything else (GIF keeps its animation, documents and audio have their own viewers).
 * A known extension decides; a name with none, or an unknown one ('gemini-file-…' — 325 of
 * prod's 8,634 photos), falls back to the MIME type. HEIC is not a Library image format, and
 * the Backend's image decoder (prebuilt sharp/libvips) has no HEVC to read it.
 */
export function sharePreviewRoleFor(file: {
  fileName: string;
  mimeType?: string | null;
}): EnsureAssetPreviewRole | null {
  const format = classifyLibraryFile({
    fileName: file.fileName,
    mimeType: file.mimeType ?? undefined,
  });
  if (!format.accepted) return null;
  if (format.originalKind === 'video') return 'preview_video';
  if (format.family !== 'raster_image') return null;
  if (classifyLibraryFile({ fileName: file.fileName }).accepted) {
    const extension = file.fileName.toLowerCase().split('.').pop() ?? '';
    return STORED_IMAGE_PREVIEW_EXTENSIONS.has(extension) ? 'preview_image' : null;
  }
  const mimeType = file.mimeType?.trim().toLowerCase() ?? '';
  return STORED_IMAGE_PREVIEW_MIME_TYPES.has(mimeType) ? 'preview_image' : null;
}
