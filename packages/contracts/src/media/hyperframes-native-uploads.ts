import { z } from 'zod';
import { nativeTemplateUploadVariantSchema } from './library-upload';
import { templateNativeIngestStatusSchema, templateParseStateSchema } from './template-source';

export const nativeTemplateUploadCursorSchema = z
  .object({
    createdAt: z.iso.datetime({ offset: true }),
    jobId: z.uuid(),
  })
  .strict();
export const nativeTemplateUploadStatusSchema = z
  .object({
    family: z.literal('hyperframes'),
    brandId: z.uuid(),
    templateId: z.uuid(),
    jobId: z.uuid(),
    uploadedAssetId: z.uuid(),
    uploadedVersionId: z.uuid(),
    intent: nativeTemplateUploadVariantSchema,
    createdAt: z.iso.datetime({ offset: true }),
    ingest: templateNativeIngestStatusSchema,
    // An old terminal job can outlive its mutable source row. Null is unknown,
    // never a borrowed parse result from the newer source version.
    parseState: templateParseStateSchema.nullable(),
    revisionId: z.uuid().nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.intent.templateId === value.templateId &&
      (value.ingest.state === 'compiled') === (value.revisionId !== null) &&
      (value.ingest.state !== 'compiled' || value.parseState === 'parsed'),
    {
      message: 'An uploaded native variant is saved only with its compiled child revision',
    },
  );
export const nativeTemplateUploadHistorySchema = z
  .object({
    family: z.literal('hyperframes'),
    brandId: z.uuid(),
    templateId: z.uuid(),
    enabled: z.boolean(),
    items: z.array(nativeTemplateUploadStatusSchema).max(50),
    nextCursor: nativeTemplateUploadCursorSchema.nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.items.every(
        (item) => item.brandId === value.brandId && item.templateId === value.templateId,
      ),
    {
      message: 'Uploaded variants must belong to the requested brand and template',
    },
  );
export type NativeTemplateUploadCursor = z.infer<typeof nativeTemplateUploadCursorSchema>;
export type NativeTemplateUploadStatus = z.infer<typeof nativeTemplateUploadStatusSchema>;
export type NativeTemplateUploadHistory = z.infer<typeof nativeTemplateUploadHistorySchema>;
