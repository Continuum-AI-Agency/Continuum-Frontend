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
import { buildInstagramCaption, type HashtagTiers } from '../media/instagram-caption';
import type { PublishFormat, PublishPlatform } from './publishing';

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

interface CarouselPublishBody extends PublishTarget {
  postType: 'CAROUSEL';
  placementId: string;
  items?: Array<{ imageUrl: string }>;
  caption?: string;
}

export type PublishRequestBody = PostPublishBody | ReelPublishBody | CarouselPublishBody;

/**
 * A draft's `format` is free-form prose from whichever generator wrote it — "carousel",
 * "Carousel", "FeedPost", "reel", "Hyperframe". Match loosely; never on exact case.
 */
export function resolvePublishFormat(format?: string | null): PublishFormat {
  const value = (format ?? '').trim().toLowerCase();
  if (value.includes('video') || value.includes('reel') || value.includes('hyperframe')) {
    return 'REEL';
  }
  if (value.includes('carousel')) return 'CAROUSEL';
  return 'POST';
}

export function isCarouselFormat(format?: string | null): boolean {
  return resolvePublishFormat(format) === 'CAROUSEL';
}

export function inferPostType(draft: PublishableDraft): PublishFormat {
  return resolvePublishFormat(draft.format);
}

/** The caption as published: body text plus the hashtag block, clamped to platform limits. */
export function buildFullCaption(draft: PublishableDraft): string {
  return buildInstagramCaption(draft.captionPreview, draft.hashtags);
}

/**
 * Carousel slides, in order. Realized `publishingAssets` win — they are what the planner
 * writes when a user assigns or replaces a creative. Generated `mediaSuggestion.assets` are
 * the headless fallback, and only reachable when nothing has been assigned.
 */
function carouselItems(draft: PublishableDraft): Array<{ imageUrl: string }> {
  const assigned = (draft.publishingAssets ?? [])
    .filter((asset) => asset.kind === 'image')
    .slice()
    .sort((a, b) => (a.slideIndex ?? 0) - (b.slideIndex ?? 0))
    .map((asset) => ({ imageUrl: asset.storageUrl }))
    .filter((item) => !!item.imageUrl);

  if (assigned.length >= 2) return assigned;

  return (draft.mediaSuggestion?.assets ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((asset) => {
      if (asset.assetUrl) return { imageUrl: asset.assetUrl };
      if (asset.assetBase64) {
        return { imageUrl: `data:${asset.mimeType ?? 'image/png'};base64,${asset.assetBase64}` };
      }
      return { imageUrl: '' };
    })
    .filter((item) => !!item.imageUrl);
}

export function buildPublishBody(
  draft: PublishableDraft,
  platform: PublishPlatform | null,
  accountId: string | null,
  brandId: string | null,
): PublishRequestBody {
  const postType = inferPostType(draft);
  const caption = buildFullCaption(draft) || undefined;
  const assets = draft.publishingAssets ?? [];

  const target: PublishTarget = {
    ...(platform ? { platform } : {}),
    ...(accountId ? { accountId } : {}),
    ...(brandId ? { brandId } : {}),
  };

  if (postType === 'REEL') {
    const video = assets.find((asset) => asset.kind === 'video');
    const cover = assets.find((asset) => asset.role === 'cover' && asset.kind === 'image');
    return {
      postType: 'REEL',
      placementId: draft.id,
      ...(video ? { videoUrl: video.storageUrl } : {}),
      ...(cover ? { coverUrl: cover.storageUrl } : {}),
      caption,
      shareToFeed: true,
      ...target,
    };
  }

  if (postType === 'CAROUSEL') {
    const items = carouselItems(draft);
    return {
      postType: 'CAROUSEL',
      placementId: draft.id,
      // Below the platform minimum the backend derives slides from content_json instead.
      ...(items.length >= 2 ? { items } : {}),
      caption,
      ...target,
    };
  }

  const image =
    assets.find((asset) => asset.kind === 'image' && asset.role === 'primary') ??
    assets.find((asset) => asset.kind === 'image');
  return {
    postType: 'POST',
    placementId: draft.id,
    ...(image ? { imageUrl: image.storageUrl } : {}),
    caption,
    ...target,
  };
}
