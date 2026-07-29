import { z } from 'zod';

export const libraryAssetRefSchema = z
  .object({
    asset_id: z.string().uuid(),
    version_id: z.string().uuid().optional(),
  })
  .strict();
export type LibraryAssetRef = z.infer<typeof libraryAssetRefSchema>;

export const pinnedLibraryAssetRefSchema = libraryAssetRefSchema.extend({
  version_id: z.string().uuid(),
});
export type PinnedLibraryAssetRef = z.infer<typeof pinnedLibraryAssetRefSchema>;

// Image-specific names remain as compatibility aliases for the upload and
// generation surfaces that intentionally accept images only.
export const libraryImageRefSchema = libraryAssetRefSchema;
export type LibraryImageRef = LibraryAssetRef;
export const pinnedLibraryImageRefSchema = pinnedLibraryAssetRefSchema;
export type PinnedLibraryImageRef = z.infer<typeof pinnedLibraryImageRefSchema>;

export const completeMcpUploadIntentRequestSchema = z
  .object({
    action: z.literal('complete_mcp_upload_intent'),
    brandId: z.string().uuid(),
    uploadIntentId: z.string().uuid(),
    assetRefs: z.array(pinnedLibraryImageRefSchema).min(1).max(8),
  })
  .strict();

export const completeMcpUploadIntentResponseSchema = z
  .object({
    upload_intent_id: z.string().uuid(),
    status: z.literal('completed'),
    asset_refs: z.array(pinnedLibraryImageRefSchema).min(1).max(8),
    updated_at: z.string(),
  })
  .strict();
