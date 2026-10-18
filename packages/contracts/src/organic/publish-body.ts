/**
 * The publish request body the planner POSTs to /api/organic/calendar/drafts/:id/publish,
 * and the format→postType mapping behind it.
 *
 * This is an FE→BE HTTP envelope, so it lives here and both sides import it: the planner
 * builds the body, the Backend's `PublishDraftBodySchema` parses it, and the publish bench
 * drives this exact builder instead of a hand-shaped stand-in that can't drift with it.
 *
 * `resolvePublishFormat` exists because the mapping used to be written twice — case-
 * sensitively in the planner (`format === "Carousel"`) and case-insensitively in the
 * scheduled publisher (`format.includes("carousel")`). Generators write `"carousel"`,
 * so a carousel draft rendered as a carousel in the UI and published as a single image.
 * One mapping, matched loosely, is the fix.
 */
import { z } from 'zod';
import { buildPlatformCaption, type HashtagTiers } from '../media/instagram-caption';
import { trialGraduationStrategySchema } from '../trial-reels/index';
import { type PublishPlanDraft, type PublishPlanMedia, resolvePublishPlan } from './publish-plan';
import {
  PLATFORM_CAPABILITIES,
  type PublishFormat,
  type PublishPlatform,
  publishPlatformSchema,
} from './publishing';

/**
 * Optional per-platform options for one publish. A publish body targets exactly one
 * platform, so this block IS that platform's options; what each platform can honour is
 * `PLATFORM_CAPABILITIES[platform].publishOptions`, checked by `unsupportedPublishOptions`.
 *
 * `aiGenerated` can only ever ADD the AI label. The publisher sets it on its own, from the
 * media's provenance, whenever the media came out of a generation pipeline — a caller cannot
 * switch that off by sending `false`.
 */
export const publishOptionsSchema = z
  .object({
    /** Posted as the account's own comment right after the post goes live. */
    firstComment: z.string().trim().min(1).max(2200).optional(),
    /** The video cover: an image URL, or a frame of the video by offset in ms. */
    thumbnail: z
      .union([
        z.object({ url: z.string().url() }).strict(),
        z.object({ offsetMs: z.number().int().min(0) }).strict(),
      ])
      .optional(),
    aiGenerated: z.boolean().optional(),
    /**
     * Publish as an Instagram TRIAL reel: shown to non-followers only, then graduated to
     * followers by the owner in the app (MANUAL) or by Instagram on performance (SS_PERFORMANCE).
     * Irreversible at publish time: Graph takes `trial_params` on the container and has no way to
     * turn an ordinary reel into a trial afterwards.
     */
    trial: z.object({ graduationStrategy: trialGraduationStrategySchema }).strict().optional(),
  })
  .strict();
export type PublishOptions = z.infer<typeof publishOptionsSchema>;

/**
 * The options a user SAVED on a draft, one block per destination platform, held on
 * `content_json.publishOptions`. Keyed because a draft can target several platforms
 * until approve fans it out, and a first comment written for Instagram is not one for
 * TikTok. Every publish path picks its own platform's block (see `savedPublishOptions`).
 */
export const publishOptionsByPlatformSchema = z.partialRecord(
  publishPlatformSchema,
  publishOptionsSchema,
);
export type PublishOptionsByPlatform = z.infer<typeof publishOptionsByPlatformSchema>;

/** The block saved for `platform`, or undefined when there is none or it is malformed. */
export function savedPublishOptions(
  saved: unknown,
  platform: PublishPlatform,
): PublishOptions | undefined {
  const parsed = publishOptionsByPlatformSchema.safeParse(saved);
  return parsed.success ? parsed.data[platform] : undefined;
}

/**
 * The options in `options` that `platform` cannot honour for `format` — empty when all of
 * them can be. `aiGenerated` is never listed: it is a disclosure, sent where the platform has
 * a field for it, and asking for it on a platform without one is not an error.
 */
export function unsupportedPublishOptions(
  platform: PublishPlatform,
  format: PublishFormat,
  options: PublishOptions | null | undefined,
): Array<'firstComment' | 'thumbnail' | 'trial'> {
  const can = PLATFORM_CAPABILITIES[platform].publishOptions;
  const unsupported: Array<'firstComment' | 'thumbnail' | 'trial'> = [];
  // Graph has no comment edge on a story.
  if (options?.firstComment && !(can.firstComment && format !== 'STORY')) {
    unsupported.push('firstComment');
  }
  if (options?.trial && !(format === 'REEL' && can.trialReel)) unsupported.push('trial');
  const thumbnail = options?.thumbnail;
  if (thumbnail) {
    const supported =
      format === 'REEL' && ('url' in thumbnail ? can.thumbnailUrl : can.thumbnailOffset);
    if (!supported) unsupported.push('thumbnail');
  }
  return unsupported;
}

/** The draft fields the publish body is built from. The planner's richer draft satisfies it. */
export interface PublishableDraft {
  id: string;
  format?: string | null;
  captionPreview?: string | null;
  hashtags?: HashtagTiers | null;
  /**
   * Realized, durable media — including anything the user assigned in the planner.
   * Authoritative over `mediaSuggestion`, which is where headless generation writes.
   */
  publishingAssets?: ReadonlyArray<{
    role: string;
    kind: 'image' | 'video';
    slideIndex?: number;
    storageUrl: string;
  }> | null;
  mediaSuggestion?: {
    assets?: ReadonlyArray<{
      order?: number | null;
      assetUrl?: string | null;
      assetBase64?: string | null;
      mimeType?: string | null;
    }> | null;
  } | null;
}

interface PublishTarget {
  platform?: PublishPlatform;
  accountId?: string;
  brandId?: string;
  publishOptions?: PublishOptions;
}

interface PostPublishBody extends PublishTarget {
  postType: 'POST';
  placementId: string;
  imageUrl?: string;
  caption?: string;
}

interface ReelPublishBody extends PublishTarget {
  postType: 'REEL';
  placementId: string;
  videoUrl?: string;
  coverUrl?: string;
  caption?: string;
  shareToFeed: true;
}

export type CarouselPublishItem =
  | { imageUrl: string; videoUrl?: never }
  | { videoUrl: string; imageUrl?: never };

interface CarouselPublishBody extends PublishTarget {
  postType: 'CAROUSEL';
  placementId: string;
  items?: CarouselPublishItem[];
  caption?: string;
}

interface StoryPublishBody extends PublishTarget {
  postType: 'STORY';
  placementId: string;
  /** Exactly one of the two: video wins when both are assigned, as it does for a reel. */
  imageUrl?: string;
  videoUrl?: string;
  /** A story container has no caption field. */
  caption?: never;
}

export type PublishRequestBody =
  | PostPublishBody
  | ReelPublishBody
  | CarouselPublishBody
  | StoryPublishBody;

/**
 * The format a single stored value NAMES, or null when it names none.
 *
 * `null` is the load-bearing part. A draft carries the format under four different
 * keys and no row carries all four, so a reader has to walk them — and a walk needs
 * to tell "this value names no format" (the generator's literal `'Text'`, an empty
 * `content_json`) apart from "this value names a POST". Defaulting mid-walk is how
 * every MCP-created reel resolved as a plain post: the first key present won, even
 * when it named nothing.
 */
export function matchPublishFormat(format?: string | null): PublishFormat | null {
  const value = (format ?? '').trim().toLowerCase();
  if (!value) return null;
  if (value.includes('video') || value.includes('reel') || value.includes('hyperframe')) {
    return 'REEL';
  }
  if (value.includes('carousel')) return 'CAROUSEL';
  // Before the post group: "story post" is a story. "stories" does not contain "story".
  if (value.includes('story') || value.includes('stories')) return 'STORY';
  if (
    value.includes('post') ||
    value.includes('image') ||
    value.includes('photo') ||
    value.includes('static')
  ) {
    return 'POST';
  }
  return null;
}

/**
 * A draft's `format` is free-form prose from whichever generator wrote it — "carousel",
 * "Carousel", "FeedPost", "reel", "Hyperframe". Match loosely; never on exact case.
 *
 * Defaults to POST for a value that names nothing. Callers walking several keys want
 * `matchPublishFormat` instead, so the default cannot outrank a later key that answers.
 */
export function resolvePublishFormat(format?: string | null): PublishFormat {
  return matchPublishFormat(format) ?? 'POST';
}

export function isCarouselFormat(format?: string | null): boolean {
  return resolvePublishFormat(format) === 'CAROUSEL';
}

export function inferPostType(draft: PublishableDraft): PublishFormat {
  return resolvePublishFormat(draft.format);
}

/**
 * The caption as published: body text plus the hashtag block, clamped to the destination
 * platform's limits. `platform` defaults to Instagram — the tightest of the three — so a
 * caller that does not yet know its destination cannot over-report what will fit.
 */
export function buildFullCaption(
  draft: PublishableDraft,
  platform: PublishPlatform = 'instagram',
): string {
  return buildPlatformCaption(platform, draft.captionPreview, draft.hashtags);
}

/** The planner's draft as publish-plan input. Fields it does not carry read as absent. */
function planDraftOf(draft: PublishableDraft): PublishPlanDraft {
  const generated = draft.mediaSuggestion?.assets ?? [];
  return {
    id: draft.id,
    formats: [draft.format],
    caption: draft.captionPreview ?? null,
    hashtags: draft.hashtags ?? null,
    publishingAssets: (draft.publishingAssets ?? []).map((asset) => ({
      role: asset.role,
      kind: asset.kind,
      slideIndex: asset.slideIndex ?? null,
      assetId: null,
      bucket: null,
      storagePath: null,
      storageUrl: asset.storageUrl || null,
      mimeType: null,
      width: null,
      height: null,
    })),
    mediaSuggestion: generated.length
      ? {
          mediaStatus: null,
          url: null,
          assetUrl: null,
          signedUrl: null,
          assetBase64: null,
          bucket: null,
          mimeType: null,
          width: null,
          height: null,
          alt: null,
          assets: generated.map((asset) => ({
            order: asset.order ?? null,
            url: null,
            assetUrl: asset.assetUrl ?? null,
            signedUrl: null,
            assetBase64: asset.assetBase64 ?? null,
            bucket: null,
            mimeType: asset.mimeType ?? null,
            width: null,
            height: null,
          })),
          reel: null,
          hyperframe: null,
        }
      : null,
    savedPublishOptions: null,
  };
}

const mediaUrl = (media: PublishPlanMedia | undefined): string | undefined =>
  media?.url ?? undefined;

export function buildPublishBody(
  draft: PublishableDraft,
  platform: PublishPlatform | null,
  accountId: string | null,
  brandId: string | null,
  publishOptions?: PublishOptions | null,
): PublishRequestBody {
  // Instagram's limits when the destination is unknown: the tightest, so nothing over-reports.
  const plan = resolvePublishPlan({
    draft: planDraftOf(draft),
    platform: platform ?? 'instagram',
    account: { requestedAccountId: accountId, boundAccountId: null, accounts: null },
    publishOptions: publishOptions ?? null,
    mediaGenerated: null,
  });
  const caption = plan.caption.text ?? undefined;
  const [first] = plan.media;

  const target: PublishTarget = {
    ...(platform ? { platform } : {}),
    ...(accountId ? { accountId } : {}),
    ...(brandId ? { brandId } : {}),
    ...(publishOptions ? { publishOptions } : {}),
  };

  if (plan.format === 'REEL') {
    const coverUrl = plan.cover?.source === 'publishing_asset' ? plan.cover.url : null;
    return {
      postType: 'REEL',
      placementId: draft.id,
      ...(first ? { videoUrl: mediaUrl(first) } : {}),
      ...(coverUrl ? { coverUrl } : {}),
      caption,
      shareToFeed: true,
      ...target,
    };
  }

  if (plan.format === 'STORY') {
    const media = first
      ? first.kind === 'video'
        ? { videoUrl: mediaUrl(first) }
        : { imageUrl: mediaUrl(first) }
      : {};
    return { postType: 'STORY', placementId: draft.id, ...media, ...target };
  }

  if (plan.format === 'CAROUSEL') {
    const items = plan.media.flatMap((item) =>
      item.url ? [item.kind === 'video' ? { videoUrl: item.url } : { imageUrl: item.url }] : [],
    );
    return {
      postType: 'CAROUSEL',
      placementId: draft.id,
      // Preserve the selected media; the backend enforces the platform minimum.
      ...(items.length > 0 ? { items } : {}),
      caption,
      ...target,
    };
  }

  return {
    postType: 'POST',
    placementId: draft.id,
    ...(first ? { imageUrl: mediaUrl(first) } : {}),
    caption,
    ...target,
  };
}
