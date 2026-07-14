import { z } from 'zod';

export const IMAGE_REFORMAT_PRESETS = ['square', 'portrait', 'vertical', 'landscape'] as const;
export const imageReformatPresetSchema = z.enum(IMAGE_REFORMAT_PRESETS);
export type ImageReformatPreset = z.infer<typeof imageReformatPresetSchema>;

export const IMAGE_REFORMAT_ASPECT_RATIOS: Readonly<Record<ImageReformatPreset, string>> = {
  square: '1:1',
  portrait: '4:5',
  vertical: '9:16',
  landscape: '16:9',
};

export const imageReformatModeSchema = z.enum(['smart_expand', 'crop']);
export type ImageReformatMode = z.infer<typeof imageReformatModeSchema>;

export const imageReformatFocalPointSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .strict();
export type ImageReformatFocalPoint = z.infer<typeof imageReformatFocalPointSchema>;

export const imageReformatRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    sourceAssetId: z.string().uuid(),
    requestId: z.string().uuid(),
    mode: imageReformatModeSchema,
    preset: imageReformatPresetSchema,
    focalPoint: imageReformatFocalPointSchema.optional(),
  })
  .strict();
export type ImageReformatRequest = z.infer<typeof imageReformatRequestSchema>;

const reformatRequestDataSchema = z.object({ requestId: z.string().uuid() }).strict();

export const imageReformatCompletedDataSchema = reformatRequestDataSchema.extend({
  assetId: z.string().uuid(),
  signedUrl: z.string().url(),
  bucket: z.string().min(1),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  aspectRatio: z.string().regex(/^\d+:\d+$/),
});
export type ImageReformatCompletedData = z.infer<typeof imageReformatCompletedDataSchema>;

export const imageReformatErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'SOURCE_NOT_FOUND',
  'UNSUPPORTED_SOURCE',
  'ENTITLEMENT_REQUIRED',
  'USAGE_CAP_REACHED',
  'RATE_LIMITED',
  'PROVIDER_FAILED',
  'STORAGE_FAILED',
  'REGISTRATION_FAILED',
  'CANCELLED',
  'INTERNAL_ERROR',
]);
export type ImageReformatErrorCode = z.infer<typeof imageReformatErrorCodeSchema>;

export const imageReformatEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('reformat.started'),
    data: reformatRequestDataSchema,
  }),
  z.object({
    type: z.literal('reformat.progress'),
    data: reformatRequestDataSchema.extend({
      stage: z.enum(['loading_source', 'cropping', 'generating', 'storing', 'registering']),
      progress: z.number().int().min(0).max(100),
    }),
  }),
  z.object({
    type: z.literal('reformat.completed'),
    data: imageReformatCompletedDataSchema,
  }),
  z.object({
    type: z.literal('reformat.failed'),
    data: reformatRequestDataSchema.extend({
      code: imageReformatErrorCodeSchema,
      message: z.string().min(1),
      retryable: z.boolean(),
    }),
  }),
]);
export type ImageReformatEvent = z.infer<typeof imageReformatEventSchema>;
