import type { AdsetAd, MediaAsset } from '@continuum/contracts';
import type { Attachment } from '../attachments';

// One shape for every piece of media a chat surface shows: a composer upload, a library search hit,
// an ad creative, a fetched post, a generation preview. Before this, each of those had its own field
// names AND its own renderer — and every one of those renderers was an <img>, so a video ad or a
// reel rendered its MP4 URL into an image tag and simply appeared broken.
export type ChatMediaKind = 'image' | 'video' | 'file';

export type ChatMedia = {
  id: string;
  url: string;
  /** Poster frame for a video, or a cheaper thumbnail for an image. */
  thumbnailUrl?: string;
  kind: ChatMediaKind;
  name?: string;
  caption?: string;
  /** The live post/ad this media came from, when it has one. */
  permalink?: string;
  /** Short corner label: "Reel", "Video", "#1"… */
  badge?: string;
};

const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|m4v|avi)(\?|$)/i;
const VIDEO_FORMATS = new Set(['video', 'reel', 'reels', 'story', 'clip']);

/**
 * Resolves the kind from whichever hints a source shape happens to carry. Every source names this
 * differently (`kind`, `format`, `mimeType`, `object_type`) and some carry nothing at all, so the
 * URL extension is the last resort rather than the first guess.
 */
export function resolveMediaKind(hints: {
  kind?: string | null;
  format?: string | null;
  mimeType?: string | null;
  url?: string | null;
}): ChatMediaKind {
  const { kind, format, mimeType, url } = hints;

  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType?.startsWith('image/')) return 'image';

  if (kind === 'video' || kind === 'image' || kind === 'file') return kind;

  const normalizedFormat = format?.toLowerCase();
  if (normalizedFormat && VIDEO_FORMATS.has(normalizedFormat)) return 'video';
  if (normalizedFormat === 'image' || normalizedFormat === 'carousel') return 'image';

  if (url && VIDEO_EXTENSIONS.test(url)) return 'video';
  if (mimeType) return 'file';

  return url ? 'image' : 'file';
}

// --- Adapters. One per source shape; the renderer never learns their names. -------------------

export function mediaFromAttachment(attachment: Attachment): ChatMedia | null {
  if (!attachment.url) return null;
  return {
    id: attachment.id,
    url: attachment.url,
    kind: resolveMediaKind({ mimeType: attachment.type, url: attachment.url }),
    name: attachment.name,
  };
}

type PersistedAttachment = { url: string; name?: string; mediaType?: string };

export function mediaFromPersistedAttachments(
  messageId: string,
  attachments: readonly PersistedAttachment[] | undefined,
): ChatMedia[] {
  return (attachments ?? []).map((file, index) => ({
    id: `${messageId}:attachment:${index}`,
    url: file.url,
    kind: resolveMediaKind({ mimeType: file.mediaType, url: file.url }),
    name: file.name,
  }));
}

export function mediaFromLibraryAsset(asset: MediaAsset): ChatMedia | null {
  const url = asset.signedUrl ?? asset.thumbnailUrl ?? null;
  if (!url) return null;
  return {
    id: asset.id,
    url,
    thumbnailUrl: asset.thumbnailUrl ?? undefined,
    kind: resolveMediaKind({ kind: asset.kind, mimeType: asset.mimeType, url }),
    name: asset.title ?? asset.fileName,
  };
}

type CreativeLike = {
  id: string;
  url: string;
  thumbnail_url?: string;
  headline?: string;
  post_copy?: string;
  format?: string;
  /** The media.assets id behind `url`, when the asset is ours to re-sign. */
  asset_id?: string;
  /** A carousel's cards after the cover. Absent for single-asset creatives. */
  slides?: Array<{
    url: string;
    thumbnail_url?: string;
    asset_id?: string;
    caption?: string;
  }>;
};

export function mediaFromCreative(creative: CreativeLike): ChatMedia {
  const kind = resolveMediaKind({ format: creative.format, url: creative.url });
  return {
    id: creative.id,
    url: creative.url,
    thumbnailUrl: creative.thumbnail_url,
    kind,
    name: creative.headline,
    caption: creative.post_copy,
    badge: kind === 'video' ? 'Video' : undefined,
  };
}

/**
 * Every card of a creative: the cover, then a carousel's remaining slides.
 *
 * A generated carousel arrives as ONE artifact whose extra cards ride on `slides` —
 * because `CreativesSection` is a strip of independent tiles, so emitting one artifact
 * per slide would read as N separate ads and the header would count them as N
 * creatives. This is the same shape `mediaListFromAdsetAd` already solved for Meta ads,
 * including the rule that a slide carries NO position badge: `ChatMediaCarousel` owns
 * the "k/N" counter, and a slide with its own would print the number twice.
 *
 * Returns a single-item list for a non-carousel, which `ChatMediaCarousel` renders as a
 * bare thumb with no chrome — so wiring this in changes nothing for existing creatives.
 */
export function mediaListFromCreative(creative: CreativeLike): ChatMedia[] {
  const cover = mediaFromCreative(creative);
  const slides = creative.slides ?? [];
  if (slides.length === 0) return [cover];

  return [
    { ...cover, badge: undefined },
    ...slides.map((slide, index): ChatMedia => {
      const kind = resolveMediaKind({ format: creative.format, url: slide.url });
      return {
        id: slide.asset_id ?? `${creative.id}:slide:${index + 1}`,
        url: slide.url,
        thumbnailUrl: slide.thumbnail_url,
        kind,
        name: creative.headline,
        caption: slide.caption,
      };
    }),
  ];
}

type FetchedPostLike = {
  postId: string;
  mediaUrl: string | null;
  caption: string | null;
  permalink: string | null;
  format: string | null;
  rank?: number | null;
};

export function mediaFromFetchedPost(post: FetchedPostLike): ChatMedia | null {
  if (!post.mediaUrl) return null;
  const kind = resolveMediaKind({ format: post.format, url: post.mediaUrl });
  return {
    id: post.postId,
    url: post.mediaUrl,
    kind,
    caption: post.caption ?? undefined,
    permalink: post.permalink ?? undefined,
    badge: post.rank ? `#${post.rank}` : (post.format ?? undefined),
  };
}

const isHttpUrl = (value: string | null | undefined): value is string =>
  typeof value === 'string' && /^https?:\/\//.test(value);

/**
 * Paid dashboard ad (CreativeTile / CreativeHoverCard shape). Meta never hands the
 * dashboard a playable MP4 — only a still — so a video-format ad renders as an
 * image with a "Video" badge; `kind: 'video'` here would put a JPEG in a <video>.
 */
export function mediaFromCreativeAd(ad: {
  id: string;
  name?: string | null;
  creative?: {
    id: string;
    title?: string | null;
    thumbnailUrl?: string | null;
    imageUrl?: string | null;
    format?: string | null;
    videoId?: string | null;
  } | null;
}): ChatMedia | null {
  const url = ad.creative?.thumbnailUrl || ad.creative?.imageUrl || null;
  if (!url) return null;
  const isVideo = ad.creative?.format === 'video' || Boolean(ad.creative?.videoId);
  return {
    id: ad.id,
    url,
    kind: 'image',
    name: ad.creative?.title ?? ad.name ?? undefined,
    badge: isVideo ? 'Video' : undefined,
  };
}

/**
 * One optimizer ad-set ad, as everything it is worth showing.
 *
 * A single-media ad yields one item; a carousel yields one per slide, so the caller
 * can page through the ad the way a person scrolling the feed would. The comment on
 * `mediaFromCreativeAd` above — "Meta never hands the dashboard a playable MP4" — is
 * only true of the paths that never asked. `scope=adset_ads` now resolves the video
 * source when the account grants it, so a video creative with a real MP4 becomes
 * `kind: 'video'` and can actually play. Without one it stays an image on the poster
 * frame plus a "Video" badge, because a JPEG in a <video> renders as a black box.
 *
 * `overrideUrl` is the recovered URL from usePaidCreativeRecovery: it heals an expired
 * primary CDN link and therefore only applies to the primary item.
 */
export function mediaListFromAdsetAd(ad: AdsetAd, overrideUrl?: string | null): ChatMedia[] {
  const label = ad.name ?? ad.id;
  const creative = ad.creative ?? null;

  const slides = creative?.slides ?? [];
  if (slides.length > 1) {
    return slides
      .map((slide, index): ChatMedia | null => {
        const poster = slide.posterUrl ?? slide.imageUrl ?? null;
        const url = slide.videoUrl ?? slide.imageUrl ?? slide.posterUrl ?? null;
        if (!isHttpUrl(url)) return null;
        return {
          id: `${ad.id}:${slide.index ?? index}`,
          url,
          thumbnailUrl: isHttpUrl(poster) ? poster : undefined,
          kind: isHttpUrl(slide.videoUrl) ? 'video' : 'image',
          name: label,
          caption: slide.caption ?? undefined,
          permalink: isHttpUrl(creative?.permalinkUrl) ? creative.permalinkUrl : undefined,
          // No position badge: ChatMediaCarousel owns the "k/N" counter, and a slide
          // carrying its own would print the same number twice on one tile. A poster
          // with no playable source is a video slide we cannot play — say so.
          badge: !isHttpUrl(slide.videoUrl) && isHttpUrl(slide.posterUrl) ? 'Video' : undefined,
        };
      })
      .filter((media): media is ChatMedia => media !== null);
  }

  // Resolution order mirrors the edge's own precedence: a real image, then the
  // 480x848-class video poster, and only then Meta's 64x64 as a last resort.
  const poster = creative?.imageUrl ?? creative?.posterUrl ?? ad.thumbnailUrl ?? null;
  const still = isHttpUrl(overrideUrl) ? overrideUrl : poster;
  const playable = creative?.videoUrl ?? null;
  const isVideo = creative?.format === 'video' || isHttpUrl(playable);

  const url = isHttpUrl(playable) ? playable : still;
  if (!isHttpUrl(url)) return [];

  return [
    {
      id: ad.id,
      url,
      thumbnailUrl: isHttpUrl(still) ? still : undefined,
      kind: isHttpUrl(playable) ? 'video' : 'image',
      name: label,
      permalink: isHttpUrl(creative?.permalinkUrl) ? creative.permalinkUrl : undefined,
      // A video we cannot play still says so — the badge is the only signal left that
      // the creative moves.
      badge: isVideo && !isHttpUrl(playable) ? 'Video' : undefined,
    },
  ];
}

/** What's-Working paid verdict row. Stills only; absorbs the http guard. */
export function mediaFromPaidVerdict(verdict: {
  adId: string;
  adName: string | null;
  thumbnailUrl: string | null;
  permalinkUrl: string | null;
}): ChatMedia | null {
  if (!isHttpUrl(verdict.thumbnailUrl)) return null;
  return {
    id: verdict.adId,
    url: verdict.thumbnailUrl,
    kind: 'image',
    name: verdict.adName ?? verdict.adId,
    permalink: isHttpUrl(verdict.permalinkUrl) ? verdict.permalinkUrl : undefined,
  };
}

/**
 * Competitor paid snapshot plus its separately-fetched signed storage URL. The
 * persisted creative can be an MP4, and the signed URL carries its real
 * extension — so resolveMediaKind gives video snapshots actual video rendering.
 */
export function mediaFromCompetitorAdSnapshot(
  entry: {
    snapshotId: string;
    competitorName: string;
    body?: string | null;
    snapshotUrl?: string | null;
  },
  creativeUrl: string | null,
): ChatMedia | null {
  if (!creativeUrl) return null;
  return {
    id: entry.snapshotId,
    url: creativeUrl,
    kind: resolveMediaKind({ url: creativeUrl }),
    name: entry.competitorName,
    caption: entry.body ?? undefined,
    permalink: entry.snapshotUrl ?? undefined,
  };
}

/** Jaina checkpoint media-map entry (inline hover previews). Stills only. */
export function mediaFromJainaMediaEntry(entry: {
  entity_type: string;
  entity_id: string;
  image_url?: string | null;
  thumbnail_url?: string | null;
}): ChatMedia | null {
  const url = entry.thumbnail_url ?? entry.image_url ?? null;
  if (!url) return null;
  return {
    id: `${entry.entity_type}:${entry.entity_id}`,
    url,
    kind: 'image',
    name: `${entry.entity_type} ${entry.entity_id}`,
  };
}

/**
 * Generation previews, storyboard frames and publishing assets: bare URLs plus the draft's format.
 * The format matters — a generated reel is an MP4, and rendering it as a still is why generated
 * video previews came out blank.
 */
export function mediaFromPreviewUrls(
  idPrefix: string,
  urls: readonly string[],
  format?: string | null,
): ChatMedia[] {
  return urls.map((url, index) => ({
    id: `${idPrefix}:${index}`,
    url,
    // A carousel's slides are stills even though the draft's format is "carousel"; only trust the
    // format when the URL itself does not already say what it is.
    kind: resolveMediaKind({ url, format: urls.length > 1 ? undefined : format }),
  }));
}
