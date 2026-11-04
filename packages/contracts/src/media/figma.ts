import { z } from 'zod';

/** A Figma folder (REST v2; formerly "project"). Top-level folders have no parent. */
export const figmaFolderSchema = z
  .object({ id: z.string().min(1), name: z.string().min(1), parentFolderId: z.string().nullable() })
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

export const figmaFoldersResponseSchema = z
  .object({ folders: z.array(figmaFolderSchema) })
  .strict();
export const figmaFilesResponseSchema = z.object({ files: z.array(figmaFileSchema) }).strict();
export const figmaFramesResponseSchema = z
  .object({
    fileKey: z.string(),
    fileName: z.string(),
    modifiedAt: z.string().nullable(),
    frames: z.array(figmaFrameSchema),
  })
  .strict();

/**
 * Frames per import request. ponytail: the import is one synchronous request that authors frames
 * one after another (seconds for a card, minutes at worst), so a long batch can outlive the proxy;
 * the import carries on and a retry joins it. A job queue lifts the cap.
 */
export const FIGMA_IMPORT_MAX_FRAMES = 5;

export const importFigmaFramesRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    fileKey: z.string().min(1).max(200),
    nodeIds: z.array(z.string().min(1).max(200)).min(1).max(FIGMA_IMPORT_MAX_FRAMES),
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

export type FigmaFolder = z.infer<typeof figmaFolderSchema>;
export type FigmaFile = z.infer<typeof figmaFileSchema>;
export type FigmaFrame = z.infer<typeof figmaFrameSchema>;
export type FigmaImportedAsset = z.infer<typeof figmaImportedAssetSchema>;
export type RegisterFigmaImportOperation = z.infer<typeof registerFigmaImportOperationSchema>;

/**
 * A Figma link → the file to read and, when the link points at a layer, that node. Takes
 * /design, /file and /proto links (a branch link reads the branch) and the node-id in either form
 * Figma writes it (`12-34` in the address bar, `12:34` in the API).
 */
export function parseFigmaLink(value: string): { fileKey: string; nodeId: string | null } | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)figma\.com$/.test(url.hostname)) return null;
  const match = /^\/(?:design|file|proto)\/([A-Za-z0-9]+)(?:\/branch\/([A-Za-z0-9]+))?/.exec(
    url.pathname,
  );
  if (!match) return null;
  const nodeId = url.searchParams.get('node-id')?.replaceAll('-', ':') || null;
  return { fileKey: match[2] ?? match[1], nodeId };
}
