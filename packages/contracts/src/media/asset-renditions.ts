import { z } from 'zod';

export const assetPreviewStateSchema = z.enum([
  'pending',
  'processing',
  'ready',
  'awaiting_companion',
  'unsupported',
  'failed',
]);
export type AssetPreviewState = z.infer<typeof assetPreviewStateSchema>;

/** A video's search stills, frame_1 … frame_N in time order (the DB admits 1–999). */
export const SAMPLED_FRAME_ROLE_PATTERN = /^frame_[1-9][0-9]{0,2}$/;
export type SampledFrameRole = `frame_${number}`;

export function isSampledFrameRole(role: string): role is SampledFrameRole {
  return SAMPLED_FRAME_ROLE_PATTERN.test(role);
}

/** An InDesign (later PDF/Office) page image, page_1 … page_9999 (1-based, as printed). */
export const PAGE_RENDITION_ROLE_PATTERN = /^page_[1-9][0-9]{0,3}$/;
export type PageRenditionRole = `page_${number}`;
export const MAX_RENDITION_PAGE = 9999;

export function isPageRenditionRole(role: string): role is PageRenditionRole {
  return PAGE_RENDITION_ROLE_PATTERN.test(role);
}

export function pageRenditionRole(page: number): PageRenditionRole {
  if (!Number.isInteger(page) || page < 1 || page > MAX_RENDITION_PAGE) {
    throw new RangeError(`a rendition page is 1 … ${MAX_RENDITION_PAGE}, got ${page}`);
  }
  return `page_${page}`;
}

/**
 * The video playback ladder, largest first. `preview_video` stays the default SDR playback
 * (about 720/1080); `hdr_proxy` is H.265 Main 10 for HDR sources.
 */
export const PROXY_LADDER_ROLES = ['proxy_2160', 'proxy_1080', 'proxy_540', 'proxy_360'] as const;

export const FIXED_RENDITION_ROLES = [
  'thumbnail',
  'poster',
  'preview_image',
  'preview_video',
  'first_frame',
  'last_frame',
  ...PROXY_LADDER_ROLES,
  'hdr_proxy',
  'scrub_sprite',
  'audio_proxy',
  'model_poster',
  'model_glb',
  'html_bundle',
] as const;

export const assetRenditionRoleSchema = z.union([
  z.enum(FIXED_RENDITION_ROLES),
  z.custom<SampledFrameRole>(
    (value) => typeof value === 'string' && isSampledFrameRole(value),
    'a sampled frame role is frame_1 … frame_999',
  ),
  z.custom<PageRenditionRole>(
    (value) => typeof value === 'string' && isPageRenditionRole(value),
    'a page role is page_1 … page_9999',
  ),
]);
export type AssetRenditionRole = z.infer<typeof assetRenditionRoleSchema>;

/**
 * The stills every video has besides its sampled ones. A video's visual search matches the
 * best of these and its frame_N stills, which Continuum-Render samples by the clip's length
 * and at its scene cuts (it keeps its own copy of the plan — it takes no workspace
 * dependency).
 */
export const LIBRARY_FIXED_FRAME_ROLES = [
  'poster',
  'first_frame',
  'last_frame',
] as const satisfies readonly AssetRenditionRole[];

export const assetRenditionSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    assetVersionId: z.string().uuid(),
    role: assetRenditionRoleSchema,
    state: assetPreviewStateSchema,
    bucket: z.string().min(1).nullable().optional(),
    storagePath: z.string().min(1).nullable().optional(),
    mimeType: z.string().min(1).nullable().optional(),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
    sizeBytes: z.number().int().nonnegative().nullable().optional(),
    renderer: z.string().min(1).nullable().optional(),
    rendererVersion: z.string().min(1).nullable().optional(),
    sourceChecksum: z.string().min(1).nullable().optional(),
    // Poster provenance: whether the current frame was picked by a person or
    // chosen automatically, and which video moment it was decoded from.
    posterSource: z.enum(['auto', 'user']).nullable().optional(),
    sourceTimestampMs: z.number().int().nonnegative().nullable().optional(),
    errorCode: z.string().min(1).nullable().optional(),
    errorMessage: z.string().min(1).nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    signedUrl: z.string().url().nullable().optional(),
  })
  .strict()
  .superRefine((rendition, context) => {
    if (rendition.state !== 'ready') return;
    if (!rendition.bucket) {
      context.addIssue({
        code: 'custom',
        path: ['bucket'],
        message: 'Ready rendition needs bucket',
      });
    }
    if (!rendition.storagePath) {
      context.addIssue({
        code: 'custom',
        path: ['storagePath'],
        message: 'Ready rendition needs storagePath',
      });
    }
    if (!rendition.mimeType) {
      context.addIssue({
        code: 'custom',
        path: ['mimeType'],
        message: 'Ready rendition needs mimeType',
      });
    }
  });
export type AssetRendition = z.infer<typeof assetRenditionSchema>;

export const assetPreviewSchema = z
  .object({
    assetVersionId: z.string().uuid(),
    state: assetPreviewStateSchema,
    kind: z.enum(['image', 'video']).nullable(),
    renditionId: z.string().uuid().nullable().optional(),
    role: assetRenditionRoleSchema.nullable().optional(),
    mimeType: z.string().min(1).nullable().optional(),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
    signedUrl: z.string().url().nullable(),
    errorCode: z.string().min(1).nullable().optional(),
  })
  .strict();
export type AssetPreview = z.infer<typeof assetPreviewSchema>;

export type AssetPreviewSurface = 'card' | 'detail';

const CARD_ROLE_ORDER: AssetRenditionRole[] = ['thumbnail', 'poster', 'preview_image'];
const DETAIL_ROLE_ORDER: AssetRenditionRole[] = [
  'preview_video',
  'preview_image',
  'poster',
  'thumbnail',
];

export function preferredAssetPreview(
  renditions: readonly AssetRendition[],
  surface: AssetPreviewSurface,
): AssetRendition | null {
  const ready = renditions.filter((rendition) => rendition.state === 'ready');
  const roleOrder = surface === 'detail' ? DETAIL_ROLE_ORDER : CARD_ROLE_ORDER;
  for (const role of roleOrder) {
    const match = ready.find((rendition) => rendition.role === role);
    if (match) return match;
  }
  return null;
}

export const signAssetRenditionOperationSchema = z
  .object({
    action: z.literal('sign_asset_rendition'),
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    assetVersionId: z.string().uuid(),
    role: assetRenditionRoleSchema,
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'video/mp4']),
    extension: z.enum(['png', 'jpg', 'webp', 'mp4']),
  })
  .strict();
export type SignAssetRenditionOperation = z.infer<typeof signAssetRenditionOperationSchema>;

export const signAssetRenditionResponseSchema = z
  .object({
    renditionId: z.string().uuid(),
    bucket: z.literal('media-previews'),
    path: z.string().min(1),
    token: z.string().min(1),
  })
  .strict();

export const completeAssetRenditionOperationSchema = z
  .object({
    action: z.literal('complete_asset_rendition'),
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    assetVersionId: z.string().uuid(),
    renditionId: z.string().uuid(),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'video/mp4']),
    sizeBytes: z.number().int().nonnegative(),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
    renderer: z.string().min(1).max(100),
    rendererVersion: z.string().min(1).max(100).optional(),
    posterSource: z.enum(['auto', 'user']).optional(),
    sourceTimestampMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export const markAssetPreviewStateOperationSchema = z
  .object({
    action: z.literal('mark_asset_preview_state'),
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    assetVersionId: z.string().uuid(),
    state: z.enum(['awaiting_companion', 'unsupported', 'failed']),
    errorCode: z.string().min(1).max(100).optional(),
    errorMessage: z.string().min(1).max(1000).optional(),
  })
  .strict();
