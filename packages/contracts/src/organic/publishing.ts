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

/** Match generator-written and user-written format strings at the boundary. */
/**
 * How a platform ingests media.
 *
 * `url`   — the platform fetches a publicly reachable URL we hand it (Instagram, Facebook).
 * `bytes` — the platform refuses URLs and requires us to upload the raw file (LinkedIn).
 */
export type PublishMediaTransport = 'url' | 'bytes';

/**
 * The caption a platform will actually accept. `maxLength` counts the assembled
 * caption (body + hashtag block); `maxHashtags` counts the tag ARRAY, never a regex
 * over prose, so a legitimate `#word` in the body is never stripped.
 */
export interface CaptionCapability {
  readonly maxLength: number;
  readonly maxHashtags: number;
}

export interface PlatformCapability {
  readonly formats: Readonly<Record<PublishFormat, boolean>>;
  readonly carousel: { readonly min: number; readonly max: number };
  readonly mediaTransport: PublishMediaTransport;
  readonly caption: CaptionCapability;
}

export const PLATFORM_CAPABILITIES: Readonly<Record<PublishPlatform, PlatformCapability>> = {
  instagram: {
    formats: { POST: true, REEL: true, CAROUSEL: true },
    carousel: { min: 2, max: 10 },
    mediaTransport: 'url',
    // Instagram Content Publishing API.
    caption: { maxLength: 2200, maxHashtags: 30 },
  },
  facebook: {
    formats: { POST: true, REEL: true, CAROUSEL: true },
    carousel: { min: 2, max: 10 },
    mediaTransport: 'url',
    // Facebook's message field is effectively unbounded at the post level (63,206).
    caption: { maxLength: 63206, maxHashtags: 30 },
  },
  linkedin: {
    // REEL maps to a native video post; CAROUSEL maps to a native multiImage post.
    formats: { POST: true, REEL: true, CAROUSEL: true },
    carousel: { min: 2, max: 20 },
    mediaTransport: 'bytes',
    // LinkedIn ugcPost commentary.
    caption: { maxLength: 3000, maxHashtags: 30 },
  },
};

export function supportsFormat(platform: PublishPlatform, format: PublishFormat): boolean {
  return PLATFORM_CAPABILITIES[platform].formats[format];
}

export function carouselLimits(platform: PublishPlatform): { min: number; max: number } {
  return PLATFORM_CAPABILITIES[platform].carousel;
}

export function captionLimits(platform: PublishPlatform): {
  maxLength: number;
  maxHashtags: number;
} {
  return PLATFORM_CAPABILITIES[platform].caption;
}

/**
 * The widest caption any supported platform accepts. Wire schemas parse before the
 * platform is resolved, so they bound on this and leave exact per-platform truncation
 * to the publisher, which knows the destination.
 */
export const CAPTION_MAX_ANY_PLATFORM: number = Math.max(
  ...Object.values(PLATFORM_CAPABILITIES).map((capability) => capability.caption.maxLength),
);

/**
 * Narrow a free-form platform string to a known publish platform. Planner drafts and
 * preview components carry `string`, so this is the one place that decides what counts.
 */
export function toPublishPlatform(value: string | null | undefined): PublishPlatform | null {
  const parsed = publishPlatformSchema.safeParse((value ?? '').trim().toLowerCase());
  return parsed.success ? parsed.data : null;
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
  // The draft resolved to no caption at all. A platform accepts a container with no caption
  // param and posts it blank, so this fails closed rather than publishing an empty post.
  'caption_missing',
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
