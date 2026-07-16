import { z } from 'zod';

export const figmaProjectSchema = z
  .object({ id: z.string().min(1), name: z.string().min(1), fileCount: z.number().int().nonnegative() })
  .strict();
export const figmaFileSchema = z
  .object({
    key: z.string().min(1),
    name: z.string().min(1),
    modifiedAt: z.string().nullable(),
    thumbnailUrl: z.string().url().nullable(),
  })
  .strict();
export const figmaFrameSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.string().min(1),
    pageName: z.string().min(1),
    width: z.number().positive().nullable(),
    height: z.number().positive().nullable(),
  })
  .strict();

export const figmaProjectsResponseSchema = z.object({ projects: z.array(figmaProjectSchema) }).strict();
export const figmaFilesResponseSchema = z.object({ files: z.array(figmaFileSchema) }).strict();
export const figmaFramesResponseSchema = z
  .object({ fileKey: z.string(), fileName: z.string(), modifiedAt: z.string().nullable(), frames: z.array(figmaFrameSchema) })
  .strict();

export const importFigmaFramesRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    fileKey: z.string().min(1).max(200),
    nodeIds: z.array(z.string().min(1).max(200)).min(1).max(50),
    scale: z.number().int().min(1).max(4).default(2),
  })
  .strict();

export const registerFigmaImportOperationSchema = z
  .object({
    action: z.literal('register_figma_import'),
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    bucket: z.literal('media-library'),
    storagePath: z.string().min(1),
    fileName: z.string().min(1),
    mimeType: z.literal('image/png'),
    sizeBytes: z.number().int().nonnegative(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    figmaFileKey: z.string().min(1),
    figmaNodeId: z.string().min(1),
    figmaFileName: z.string().min(1),
    figmaNodeName: z.string().min(1),
    sourceUpdatedAt: z.string().datetime().nullable(),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();

export const figmaImportedAssetSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    figmaNodeId: z.string().min(1),
    status: z.enum(['created', 'updated', 'exists']),
  })
  .strict();
export const importFigmaFramesResponseSchema = z
  .object({ assets: z.array(figmaImportedAssetSchema) })
  .strict();

export type FigmaProject = z.infer<typeof figmaProjectSchema>;
export type FigmaFile = z.infer<typeof figmaFileSchema>;
export type FigmaFrame = z.infer<typeof figmaFrameSchema>;
export type FigmaImportedAsset = z.infer<typeof figmaImportedAssetSchema>;
export type RegisterFigmaImportOperation = z.infer<typeof registerFigmaImportOperationSchema>;
