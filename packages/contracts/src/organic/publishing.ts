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

export const publishPlatformSchema = z.enum(['instagram', 'facebook', 'linkedin', 'tiktok']);
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
  /** The platform's transport for formats not named in `mediaTransportByFormat`. */
  readonly mediaTransport: PublishMediaTransport;
  /**
   * Per-format overrides, for platforms whose transport is not uniform.
   *
   * TikTok is the reason this exists: its video endpoint accepts a FILE_UPLOAD of raw bytes,
   * but its photo endpoint is PULL_FROM_URL only — and it rejects URLs on domains the developer
   * has not verified, so photo posts must be served from a domain we own.
   */
  readonly mediaTransportByFormat?: Readonly<Partial<Record<PublishFormat, PublishMediaTransport>>>;
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
  tiktok: {
    // REEL is the native shape (a video). POST is a single-image photo post and CAROUSEL a
    // multi-image photo post, both via /post/publish/content/init with media_type=PHOTO.
    formats: { POST: true, REEL: true, CAROUSEL: true },
    // TikTok photo posts accept up to 35 images.
    carousel: { min: 2, max: 35 },
    // Video uploads push raw bytes (FILE_UPLOAD): PULL_FROM_URL would need TikTok to fetch our
    // Supabase signed URL, and TikTok rejects unverified domains with url_ownership_unverified.
    mediaTransport: 'bytes',
    // Photo posts have no FILE_UPLOAD option at all — they are PULL_FROM_URL only, which is why
    // they must be served through a domain verified with TikTok.
    mediaTransportByFormat: { POST: 'url', CAROUSEL: 'url' },
    // TikTok caps the video caption ("title") at 2,200 UTF-16 runes.
    caption: { maxLength: 2200, maxHashtags: 30 },
  },
};

/** The transport a specific platform+format pair uses. */
export function mediaTransportFor(
  platform: PublishPlatform,
  format: PublishFormat,
): PublishMediaTransport {
  const capability = PLATFORM_CAPABILITIES[platform];
  return capability.mediaTransportByFormat?.[format] ?? capability.mediaTransport;
}

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
  // Human-in-the-loop gate reasons (see publishGate.ts). These are not faults — they mean the
  // publish is waiting on a person, so the surface must prompt rather than report an error.
  //
  // `confirmation_required` — no confirmation accompanied the publish.
  // `confirmation_stale`    — a confirmation was given, but the caption/account/platform/format
  //                            changed since, so it no longer describes what would go out.
  // `not_approved`          — the draft reached the publisher having never been approved.
  'confirmation_required',
  'confirmation_stale',
  'not_approved',
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
