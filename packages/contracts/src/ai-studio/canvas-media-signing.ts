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

/**
 * Long edge, in pixels, of the derivative the canvas paints its node previews from.
 *
 * The originals are what the generators produced: a mean of 2.1 MB and a tail out to
 * 32 MB, painted into node boxes a few hundred pixels wide. Supabase resizes on demand,
 * so the canvas can ask for what it will actually display instead of the full frame.
 */
export const CANVAS_MEDIA_PREVIEW_MAX_EDGE = 480;

export const canvasMediaSignRequestSchema = z
  .object({
    brandProfileId: z.string().uuid(),
    items: z.array(canvasMediaCoordinateSchema).min(1).max(CANVAS_MEDIA_SIGN_MAX_ITEMS),
    /**
     * Ask for display-sized derivatives rather than the stored originals. OPT-IN, and it
     * must stay that way: this route also signs the media the client renderer composites
     * an export from, and handing that path a 480px derivative would quietly ship
     * downscaled video. Only surfaces that merely SHOW an image may set it.
     */
    preview: z.boolean().optional(),
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
