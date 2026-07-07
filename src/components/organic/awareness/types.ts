// Shared view-model for the AI-Awareness report sub-blocks. The edge payload's
// block `data` is intentionally loose (contracts `z.unknown()`), so these types
// describe the concrete shape the renderer expects and keep the sub-components in
// sync with the get-organic-insights assembler (awareness.ts).

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
