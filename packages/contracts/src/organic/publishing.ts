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

/**
 * The organic platform vocabulary — defined ONCE, here.
 *
 * Every organic surface narrows a platform string against this enum: the calendar and
 * planner (`App/organic/schemas.ts`), the MCP tool surface (`App/mcp/shared/platformEnums.ts`),
 * and the legacy weekly-grid path. Those are derivations, not second opinions; the vocabulary
 * had drifted into four disagreeing member lists before this became the single source.
 *
 * It answers "can this platform appear on a calendar", which is a strictly WIDER question
 * than "can we publish to it" — see `publishPlatformSchema`.
 */
export const organicPlatformSchema = z.enum([
  'instagram',
  'facebook',
  'linkedin',
  'tiktok',
  'youtube',
  'threads',
  'x',
]);
export type OrganicPlatform = z.infer<typeof organicPlatformSchema>;

/**
 * The GENERATABLE subset: the platforms the calendar and planner can actually write for.
 *
 * Narrower than the canonical vocabulary because content generation is per-platform prompt
 * work, not a loop — `App/organic/creation/agents/platformRegistry.ts` carries a strategist /
 * creative / copywriter / hashtag / visual / audio prompt set for exactly these five, and a
 * placement on a platform with no prompt set has nothing to generate from.
 *
 * X and Threads sit outside it: a brand can CONNECT them (one X integration exists in
 * production today, which is why they stay in the canonical vocabulary and the MCP read
 * surface keeps serving them) but nothing can compose a post for them. Widen this only
 * together with a prompt set in `platformRegistry.ts`.
 */
export const organicGeneratablePlatformSchema = organicPlatformSchema.extract([
  'instagram',
  'facebook',
  'linkedin',
  'tiktok',
  'youtube',
]);
export type OrganicGeneratablePlatform = z.infer<typeof organicGeneratablePlatformSchema>;

/**
 * The PUBLISHABLE subset: the platforms with a working publisher behind them.
 *
 * The narrowest of the three, and derived with `.extract` so a member leaving the canonical
 * vocabulary breaks this line at compile time instead of drifting into a rival definition.
 *
 * The nesting is `publishable ⊆ generatable ⊆ canonical`, and each step is a different
 * capability with a different owner:
 *
 *   canonical    — the platform has a name the system understands and can hold an integration
 *   generatable  — …and `platformRegistry.ts` can compose a post for it
 *   publishable  — …and `publisherRegistry.ts` can send that post
 *
 * YouTube generates but does not publish: the calendar plans a YouTube post and the generator
 * writes one, but nothing under `App/organic/publishing/` can send it, so the publish boundary
 * refuses rather than pretending. Flattening these would break in one direction or the other —
 * widening this enum makes an unpublishable platform look publishable, narrowing the canonical
 * one erases platforms that already hold live integrations.
 *
 * Widen this ONLY by shipping a publisher and registering it in `publisherRegistry.ts`.
 */
export const publishPlatformSchema = organicPlatformSchema.extract([
  'instagram',
  'facebook',
  'linkedin',
  'tiktok',
]);
export type PublishPlatform = z.infer<typeof publishPlatformSchema>;

export const publishFormatSchema = z.enum(['POST', 'REEL', 'CAROUSEL']);
export type PublishFormat = z.infer<typeof publishFormatSchema>;

/** Match generator-written and user-written format strings at the boundary. */
/**
 * How a platform ingests media.
 *
 * `url`   — the platform fetches a publicly reachable URL we hand it (Instagram, Facebook,
 *           TikTok). TikTok additionally rejects URLs on domains the developer app has not
 *           verified, so ours are served through `mediaProxy.ts`.
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
  tiktok: {
    // REEL is the native shape (a video). POST is a single-image photo post and CAROUSEL a
    // multi-image photo post, both via /post/publish/content/init with media_type=PHOTO.
    formats: { POST: true, REEL: true, CAROUSEL: true },
    // TikTok photo posts accept up to 35 images.
    carousel: { min: 2, max: 35 },
    // URL-pull for EVERY format. The Business Organic API (business-api.tiktok.com/open_api/v1.3,
    // the client we actually ship) has no FILE_UPLOAD route and no chunking on either endpoint —
    // `video_url` and `photo_images` are both fetched by TikTok. See the header of
    // `App/organic/publishing/tiktok/client.ts`. TikTok rejects URLs on unverified domains with
    // `url_ownership_unverified`, so every format goes out through `mediaProxy.ts`.
    mediaTransport: 'url',
    // TikTok caps the video caption ("title") at 2,200 UTF-16 runes.
    caption: { maxLength: 2200, maxHashtags: 30 },
  },
};

/**
 * The transport a specific platform+format pair uses. Every platform is currently uniform
 * across formats, so `format` is accepted and ignored — it stays in the signature because a
 * per-format split is a real possibility (TikTok had one until its client moved to the
 * Business Organic API) and callers should not have to change shape to get it back.
 */
export function mediaTransportFor(
  platform: PublishPlatform,
  _format: PublishFormat,
): PublishMediaTransport {
  return PLATFORM_CAPABILITIES[platform].mediaTransport;
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
  // No account is bound to the draft and none could be resolved for its platform. Drafts are
  // written before an account is chosen, so this is the ordinary "nothing connected yet" state
  // — the publish is the stage that needs one.
  'account_missing',
  'media_missing',
  // The draft resolved to no caption at all. A platform accepts a container with no caption
  // param and posts it blank, so this fails closed rather than publishing an empty post.
  'caption_missing',
  'hyperframe_mp4_not_ready',
  // The draft's format is not offered by its platform.
  'unsupported_format',
  // The caption states figures the claim guard recorded as `data_needed` — the system flagged
  // them as unsourced and the caption publishes them as fact. Fails closed rather than ship them.
  'unverified_claims',
  // A carousel block exists but not one slide carries headline/body/overlayText. The generator
  // used to pad these from the internal brief; it now emits nothing and this blocks instead.
  'slide_copy_missing',
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
