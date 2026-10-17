import { z } from 'zod';

/**
 * Server-side extraction of an uploaded sheet. The Render tab on beta reads sheets in the browser
 * (forge-sheet-import); this stays for the promoted app until it does too.
 */
export const API_RENDER_IMPORT_PREVIEW_ROUTE = '/api/ai-studio/renders/imports/preview';
/** GET reads, PUT saves, the column mapping a brand last confirmed for one template. */
export const API_RENDER_IMPORT_MAPPING_ROUTE = '/api/ai-studio/renders/import-mapping';
export const API_RENDER_DRIVE_SNAPSHOT_ROUTE = '/api/ai-studio/renders/imports/drive-snapshot';
export const API_RENDER_IMPORT_MEDIA_ROUTE = '/api/ai-studio/renders/imports/media';

export const forgeRenderImportMediaRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    url: z.string().url().max(4096),
    kind: z.enum(['image', 'video']),
  })
  .strict();
export type ForgeRenderImportMediaRequest = z.infer<typeof forgeRenderImportMediaRequestSchema>;
export const forgeRenderImportMediaResponseSchema = z
  .object({ assetId: z.string().uuid(), versionId: z.string().uuid() })
  .strict();
export type ForgeRenderImportMediaResponse = z.infer<typeof forgeRenderImportMediaResponseSchema>;

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

/**
 * How one brand's sheet maps onto one template, saved when an import is confirmed so next week's
 * sheet imports with no mapping at all. Keyed by brand + binding + template on the membership row.
 */
export const forgeImportMappingSchema = z
  .object({
    /** The sheet it was confirmed on, and that sheet's headers — what recognises the next one. */
    sheet: z.string().max(200).nullable(),
    headerRow: z.number().int().min(0).max(499).nullable(),
    headers: z.array(z.string().max(200)).max(100),
    /** header → variable key, `@name`/`@parent`/`@formats`/`@replaceAdId`, or `__skip__`. */
    columns: z.record(z.string().max(200), z.string().max(120)),
    /** Row names built from cells: `{Equipo A} vs. {Equipo B}`. Null names rows from a column. */
    label: z.string().max(300).nullable(),
    /** A Formats cell's folded text → output id: "ambos equipos anotan" → the BTTS output. */
    outputs: z.record(z.string().max(200), z.string().max(200)),
    /** Decimal places per variable key: odds always carry two. */
    decimals: z.record(z.string().max(120), z.number().int().min(0).max(6)),
    /** Picture variable key → the header whose cell names it (left_jersey ← Equipo A). */
    kits: z.record(z.string().max(120), z.string().max(200)),
  })
  .strict();
export type ForgeImportMapping = z.infer<typeof forgeImportMappingSchema>;

export const forgeImportMappingQuerySchema = z
  .object({
    brandId: z.string().uuid(),
    bindingId: z.string().uuid(),
    templateKey: z.string().min(1).max(120),
  })
  .strict();
export type ForgeImportMappingQuery = z.infer<typeof forgeImportMappingQuerySchema>;

export const forgeImportMappingSaveSchema = forgeImportMappingQuerySchema
  .extend({ mapping: forgeImportMappingSchema.nullable() })
  .strict();
export type ForgeImportMappingSave = z.infer<typeof forgeImportMappingSaveSchema>;

export const forgeImportMappingResponseSchema = z
  .object({ mapping: forgeImportMappingSchema.nullable() })
  .strict();
export type ForgeImportMappingResponse = z.infer<typeof forgeImportMappingResponseSchema>;

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
