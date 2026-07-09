/**
 * Canonical vocabulary for publishing an organic calendar draft to a social platform.
 *
 * Both sides import from here: the Backend publisher emits `PublishEvent` over SSE,
 * the Frontend `usePublishDraft` hook interprets it. Post format stays platform-neutral
 * (`POST | REEL | CAROUSEL`) because every existing consumer already speaks it —
 * `content_json.content.format`, `slot_data`, the `post_type` CHECK constraint, and the
 * planner's `inferPostType`. Per-platform native shapes are derived from
 * `PLATFORM_CAPABILITIES` at the boundary rather than fanned out into the type system.
 */
import { z } from 'zod';

export const publishPlatformSchema = z.enum(['instagram', 'facebook', 'linkedin']);
export type PublishPlatform = z.infer<typeof publishPlatformSchema>;

export const publishFormatSchema = z.enum(['POST', 'REEL', 'CAROUSEL']);
export type PublishFormat = z.infer<typeof publishFormatSchema>;

/**
 * How a platform ingests media.
 *
 * `url`   — the platform fetches a publicly reachable URL we hand it (Instagram, Facebook).
 * `bytes` — the platform refuses URLs and requires us to upload the raw file (LinkedIn).
 */
export type PublishMediaTransport = 'url' | 'bytes';

export interface PlatformCapability {
  readonly formats: Readonly<Record<PublishFormat, boolean>>;
  readonly carousel: { readonly min: number; readonly max: number };
  readonly mediaTransport: PublishMediaTransport;
}

export const PLATFORM_CAPABILITIES: Readonly<Record<PublishPlatform, PlatformCapability>> = {
  instagram: {
    formats: { POST: true, REEL: true, CAROUSEL: true },
    carousel: { min: 2, max: 10 },
    mediaTransport: 'url',
  },
  facebook: {
    formats: { POST: true, REEL: true, CAROUSEL: true },
    carousel: { min: 2, max: 10 },
    mediaTransport: 'url',
  },
  linkedin: {
    // REEL maps to a native video post; CAROUSEL maps to a native multiImage post.
    formats: { POST: true, REEL: true, CAROUSEL: true },
    carousel: { min: 2, max: 20 },
    mediaTransport: 'bytes',
  },
};

export function supportsFormat(platform: PublishPlatform, format: PublishFormat): boolean {
  return PLATFORM_CAPABILITIES[platform].formats[format];
}

export function carouselLimits(platform: PublishPlatform): { min: number; max: number } {
  return PLATFORM_CAPABILITIES[platform].carousel;
}

export const publishResultSchema = z.object({
  postId: z.string(),
  format: publishFormatSchema,
  platform: publishPlatformSchema,
  accountId: z.string(),
});
export type PublishResult = z.infer<typeof publishResultSchema>;

export const publishErrorCodeSchema = z.enum([
  'already_published',
  'not_found',
  'token_expired',
  'rate_limited',
  'media_processing_error',
  'media_staging_failed',
  // Raised when a `bytes`-transport platform (LinkedIn) fails to upload the asset.
  'media_upload_failed',
  'api_error',
  'validation_error',
  // Compliance gate reasons (see assertPublishable):
  'quality_failed',
  'media_missing',
  'hyperframe_mp4_not_ready',
  // The draft's format is not offered by its platform.
  'unsupported_format',
  'unknown',
]);
export type PublishErrorCode = z.infer<typeof publishErrorCodeSchema>;

/**
 * Progress stages. `container_created` / `polling` / `carousel_retry` are Meta's
 * asynchronous-container model; `upload_init` / `upload_chunk` / `finalize` are
 * LinkedIn's byte-upload model. A platform emits only the stages it actually has.
 */
export const publishStageSchema = z.enum([
  'container_created',
  'polling',
  'carousel_retry',
  'upload_init',
  'upload_chunk',
  'finalize',
]);
export type PublishStage = z.infer<typeof publishStageSchema>;

export const publishEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('started'),
    platform: publishPlatformSchema,
    format: publishFormatSchema,
  }),
  z.object({
    type: z.literal('processing'),
    platform: publishPlatformSchema,
    stage: publishStageSchema,
    containerId: z.string().optional(),
    attempt: z.number().optional(),
    itemIndex: z.number().optional(),
    statusCode: z.string().optional(),
  }),
  z.object({
    type: z.literal('published'),
    platform: publishPlatformSchema,
    postId: z.string(),
    format: publishFormatSchema,
    accountId: z.string(),
  }),
  z.object({
    type: z.literal('failed'),
    error: z.string(),
    code: publishErrorCodeSchema,
  }),
]);
export type PublishEvent = z.infer<typeof publishEventSchema>;

export type PublishEventCallback = (event: PublishEvent) => void;
