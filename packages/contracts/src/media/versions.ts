// Version history for Library assets. media.assets stays the head — its file
// columns always mirror the latest version — and media.asset_versions holds
// every file the asset has ever pointed at. Version 1 is backfilled lazily
// from the head row the first time a second version is uploaded, so legacy
// assets get history without a migration backfill.

import { z } from 'zod';

export const mediaAssetVersionSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    assetId: z.string().min(1),
    versionNumber: z.number().int().positive(),
    bucket: z.string().min(1),
    storagePath: z.string().min(1),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative().nullable().optional(),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
    checksum: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    createdBy: z.string().nullable().optional(),
    // Transient display fields resolved at read time.
    authorName: z.string().nullable().optional(),
    signedUrl: z.string().nullable().optional(),
    isHead: z.boolean().default(false),
    createdAt: z.string(),
  })
  .strict();
export type MediaAssetVersion = z.infer<typeof mediaAssetVersionSchema>;

// Sign step: mints a signed upload URL for the next version's bytes at
// <brandId>/<assetId>/v<versionNumber>/<sanitizedName>.
export const versionSignUploadRequestSchema = z
  .object({
    brandId: z.string().min(1),
    assetId: z.string().min(1),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
  })
  .strict();
export type VersionSignUploadRequest = z.infer<typeof versionSignUploadRequestSchema>;

export const versionSignUploadResponseSchema = z
  .object({
    bucket: z.string().min(1),
    path: z.string().min(1),
    token: z.string().min(1),
    versionNumber: z.number().int().positive(),
  })
  .strict();
export type VersionSignUploadResponse = z.infer<typeof versionSignUploadResponseSchema>;

// Register step: archives the current head into asset_versions (backfilling
// v1 if this is the first versioned upload) and promotes the uploaded file to
// the head row.
export const registerVersionRequestSchema = z
  .object({
    brandId: z.string().min(1),
    assetId: z.string().min(1),
    bucket: z.string().min(1),
    storagePath: z.string().min(1),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    note: z.string().max(2000).optional(),
  })
  .strict();
export type RegisterVersionRequest = z.infer<typeof registerVersionRequestSchema>;

export const registerVersionResponseSchema = z
  .object({
    assetId: z.string().min(1),
    versionNumber: z.number().int().positive(),
    versions: z.array(mediaAssetVersionSchema),
  })
  .strict();
export type RegisterVersionResponse = z.infer<typeof registerVersionResponseSchema>;

// Rollback: promotes an archived version back to the head (recorded as a new
// version so history stays append-only — rolling back never deletes).
export const rollbackVersionRequestSchema = z
  .object({
    brandId: z.string().min(1),
    assetId: z.string().min(1),
    versionId: z.string().min(1),
  })
  .strict();
export type RollbackVersionRequest = z.infer<typeof rollbackVersionRequestSchema>;

export const listVersionsResponseSchema = z
  .object({
    versions: z.array(mediaAssetVersionSchema),
  })
  .strict();
export type ListVersionsResponse = z.infer<typeof listVersionsResponseSchema>;
