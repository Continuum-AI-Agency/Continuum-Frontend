// Shared view-model for the AI-Awareness report sub-blocks. The edge payload's
// block `data` is intentionally loose (contracts `z.unknown()`), so these types
// describe the concrete shape the renderer expects and keep the sub-components in
// sync with the get-organic-insights assembler (awareness.ts).

import type { OrganicPost } from '@/lib/schemas/organicMetrics';

export type AwarenessTopPost = {
  id: string;
  mediaProductType: string | null;
  mediaType?: string | null;
  hookRate: number | null;
  views: number | null;
  reach: number | null;
  permalink?: string | null;
  thumbnailUrl?: string | null;
  caption?: string | null;
  timestamp?: string | null;
};

export type AwarenessContentTypeRow = {
  contentType: string;
  posts?: number;
  reach?: number;
  views?: number;
  engagement?: number;
  comments?: number;
};

// Meta's media_product_type / media_type are ALL-CAPS enum-ish strings (REELS,
// FEED, CAROUSEL_ALBUM, ...). Collapse them to a short human label so five reels
// don't all render as the same opaque "REELS".
export function postKindLabel(post: {
  mediaProductType?: string | null;
  mediaType?: string | null;
}): string {
  const raw = (post.mediaProductType ?? post.mediaType ?? 'post').toLowerCase();
  if (raw.includes('reel')) return 'Reel';
  if (raw.includes('story')) return 'Story';
  if (raw.includes('carousel') || raw.includes('album')) return 'Carousel';
  if (raw.includes('feed') || raw.includes('image')) return 'Post';
  if (raw.includes('video')) return 'Video';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// Prefer live gallery/detail fields over the (often sparse or stale) awareness
// snapshot so the hover card can show caption + a still-valid thumbnail.
export function enrichAwarenessTopPost(
  post: AwarenessTopPost,
  live: OrganicPost | null | undefined,
): AwarenessTopPost {
  if (!live) return post;
  const liveThumb =
    live.thumbnailUrl ??
    live.mediaUrl ??
    live.carouselMedia?.[0]?.thumbnailUrl ??
    live.carouselMedia?.[0]?.mediaUrl ??
    null;
  return {
    ...post,
    mediaProductType: post.mediaProductType ?? live.mediaProductType ?? live.mediaType ?? null,
    mediaType: post.mediaType ?? live.mediaType ?? null,
    permalink: post.permalink ?? live.permalink ?? null,
    thumbnailUrl: post.thumbnailUrl || liveThumb,
    caption: post.caption?.trim() ? post.caption : (live.caption ?? live.title ?? null),
    timestamp: post.timestamp ?? live.timestamp ?? null,
    views: post.views ?? live.metrics?.views ?? null,
    reach: post.reach ?? live.metrics?.reach ?? null,
  };
}
