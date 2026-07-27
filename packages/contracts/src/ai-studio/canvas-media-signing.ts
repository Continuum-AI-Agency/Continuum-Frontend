import { z } from 'zod';

export const CANVAS_MEDIA_SIGN_ROUTE = '/api/ai-studio/media/sign';
export const LEGACY_CANVAS_MEDIA_SIGN_ROUTE = '/api/ai-studio/sign';
export const CANVAS_MEDIA_SIGN_MAX_ITEMS = 50;
export const CANVAS_MEDIA_SIGN_TTL_SECONDS = 60 * 60;
export const CANVAS_MEDIA_BUCKETS = ['brand-profile-assets', 'media-library'] as const;

export const canvasMediaCoordinateSchema = z
  .object({
    bucket: z.enum(CANVAS_MEDIA_BUCKETS),
    path: z.string().min(1).max(1024),
  })
  .strict();
export type CanvasMediaCoordinate = z.infer<typeof canvasMediaCoordinateSchema>;

export const canvasMediaSignRequestSchema = z
  .object({
    brandProfileId: z.string().uuid(),
    items: z.array(canvasMediaCoordinateSchema).min(1).max(CANVAS_MEDIA_SIGN_MAX_ITEMS),
  })
  .strict();
export type CanvasMediaSignRequest = z.infer<typeof canvasMediaSignRequestSchema>;

export const canvasMediaSignedItemSchema = canvasMediaCoordinateSchema.extend({
  signedUrl: z.string().url(),
});
export type CanvasMediaSignedItem = z.infer<typeof canvasMediaSignedItemSchema>;

export const canvasMediaSignResponseSchema = z
  .object({
    items: z.array(canvasMediaSignedItemSchema),
    expiresIn: z.literal(CANVAS_MEDIA_SIGN_TTL_SECONDS),
  })
  .strict();
export type CanvasMediaSignResponse = z.infer<typeof canvasMediaSignResponseSchema>;
