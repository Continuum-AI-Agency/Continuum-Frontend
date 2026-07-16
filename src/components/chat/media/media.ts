import type { MediaAsset } from '@continuum/contracts';
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
