import { z } from 'zod';
import { assetIntegrityStateSchema } from './creative-operations';

export const libraryTransformOperationSchema = z.enum([
  'crop',
  'smart_expand',
  'erase',
  'background_remove',
  'upscale',
  'variant',
]);
export type LibraryTransformOperation = z.infer<typeof libraryTransformOperationSchema>;

export const transformOutputModeSchema = z.enum(['derivative', 'new_version']);
export type TransformOutputMode = z.infer<typeof transformOutputModeSchema>;

export const registerAssetDerivativeOperationSchema = z
  .object({
    action: z.literal('register_asset_derivative'),
    brandId: z.string().uuid(),
    sourceAssetId: z.string().uuid(),
    sourceVersionId: z.string().uuid(),
    outputAssetId: z.string().uuid(),
    outputMode: transformOutputModeSchema.default('derivative'),
    operation: libraryTransformOperationSchema,
    parameters: z.record(z.string(), z.unknown()).default({}),
    bucket: z.string().min(1).max(100),
    storagePath: z.string().min(1).max(1024),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().regex(/^image\//),
    sizeBytes: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    integrityState: assetIntegrityStateSchema.default('unknown'),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();
export type RegisterAssetDerivativeOperation = z.infer<
  typeof registerAssetDerivativeOperationSchema
>;

export const registerAssetDerivativeResponseSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    sourceVersionId: z.string().uuid(),
    outputMode: transformOutputModeSchema,
  })
  .strict();
export type RegisterAssetDerivativeResponse = z.infer<
  typeof registerAssetDerivativeResponseSchema
>;
