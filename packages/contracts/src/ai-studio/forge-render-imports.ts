import { z } from 'zod';

export const API_RENDER_IMPORT_PREVIEW_ROUTE = '/api/ai-studio/renders/imports/preview';
export const API_RENDER_DRIVE_SNAPSHOT_ROUTE = '/api/ai-studio/renders/imports/drive-snapshot';

export const forgeRenderImportPreviewRequestSchema = z
  .object({ brandId: z.string().uuid(), documentId: z.string().uuid() })
  .strict();
export type ForgeRenderImportPreviewRequest = z.infer<typeof forgeRenderImportPreviewRequestSchema>;

export const forgeRenderImportPreviewSchema = z
  .object({
    sourceName: z.string().min(1),
    sheetName: z.string().nullable(),
    headers: z.array(z.string()).min(1),
    rows: z.array(z.record(z.string(), z.string())),
    rowCount: z.number().int().nonnegative(),
  })
  .strict();
export type ForgeRenderImportPreview = z.infer<typeof forgeRenderImportPreviewSchema>;

export const forgeRenderDriveSnapshotRequestSchema = z
  .object({ brandId: z.string().uuid(), folderId: z.string().min(1).max(500) })
  .strict();
export type ForgeRenderDriveSnapshotRequest = z.infer<typeof forgeRenderDriveSnapshotRequestSchema>;

export const forgeRenderDriveFileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    mimeType: z.string().min(1),
    modifiedTime: z.string().nullable(),
    size: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const forgeRenderDriveSnapshotSchema = z
  .object({
    folderId: z.string(),
    files: z.array(forgeRenderDriveFileSchema),
    complete: z.boolean(),
    scopeRequired: z.boolean(),
  })
  .strict();
export type ForgeRenderDriveSnapshot = z.infer<typeof forgeRenderDriveSnapshotSchema>;
