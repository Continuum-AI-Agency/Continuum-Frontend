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

export const assetRenditionRoleSchema = z.enum([
  'thumbnail',
  'poster',
  'preview_image',
  'preview_video',
  'first_frame',
  'last_frame',
]);
export type AssetRenditionRole = z.infer<typeof assetRenditionRoleSchema>;

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
