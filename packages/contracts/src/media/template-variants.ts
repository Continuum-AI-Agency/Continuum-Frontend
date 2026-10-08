import { z } from 'zod';
import { designArrangementSchema } from '../hyperframes-aep/design-import';
import { templateSourceKindSchema, templateSourceSummarySchema } from './template-source';

export const templateVariantSchema = z
  .object({
    assetId: z.string().uuid(),
    rootAssetId: z.string().uuid(),
    parentAssetId: z.string().uuid().nullable(),
    parentVersionId: z.string().uuid().nullable(),
    name: z.string(),
    sourceKind: templateSourceKindSchema,
    originalAssetId: z.string().uuid(),
    originalVersionId: z.string().uuid(),
    originalFileName: z.string(),
    source: templateSourceSummarySchema,
  })
  .strict();
export type TemplateVariant = z.infer<typeof templateVariantSchema>;
export const templateVariantsResponseSchema = z
  .object({ items: z.array(templateVariantSchema) })
  .strict();
export const createTemplateVariantRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    expectedVersionId: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
    // An uploaded AEP source, or the inspected design's complete layer arrangement.
    uploadAssetId: z.string().uuid().optional(),
    arrangement: designArrangementSchema.optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.uploadAssetId) !== Boolean(value.arrangement),
    'Choose an uploaded project or a layer arrangement',
  );
export type CreateTemplateVariantRequest = z.infer<typeof createTemplateVariantRequestSchema>;
