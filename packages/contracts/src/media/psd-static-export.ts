import { z } from 'zod';
export const PSD_STATIC_EXPORT_ROUTE = '/api/media/psd/export';
export const psdStaticFormatSchema = z.enum(['png', 'jpeg']);
export type PsdStaticFormat = z.infer<typeof psdStaticFormatSchema>;
export const PSD_STATIC_EXPORT_MIME = { png: 'image/png', jpeg: 'image/jpeg' } as const;
/** Saves and downloads the requested version's appearance without changing the source PSD. */
export const psdStaticExportRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    versionId: z.string().uuid().optional(),
    format: psdStaticFormatSchema,
  })
  .strict();
export type PsdStaticExportRequest = z.infer<typeof psdStaticExportRequestSchema>;
export const psdStaticExportResponseSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    fileName: z.string(),
    mimeType: z.enum(['image/png', 'image/jpeg']),
    signedUrl: z.string().url(),
  })
  .strict();
export type PsdStaticExportResponse = z.infer<typeof psdStaticExportResponseSchema>;
