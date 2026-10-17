import { resolveMediaKind } from '@/components/chat/media/media';
import type { OrganicCalendarPostedContent } from '@/components/organic/primitives/types';
import type { SignablePath } from '@/lib/media/signed-urls';
import {
  formatCalendarDayId,
  formatPostedDayId,
  formatPostedTimeLabel,
  normalizeCalendarPlatform,
} from '@/lib/organic/calendar-posts';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';
import type { PublishedPostRow } from './publishedPostPages';

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export type MediaKind = 'image' | 'video';
export type ResolvedMedia = { url: string; kind: MediaKind };

const kindOfUrl = (url: string, mimeType?: unknown): MediaKind =>
  resolveMediaKind({ url, mimeType: typeof mimeType === 'string' ? mimeType : null }) === 'video'
    ? 'video'
    : 'image';

/**
 * `media_urls` is whatever the publisher sent the platform. Production rows hold one object per
 * post type — `{videoUrl}` (REEL), `{imageUrl}` (POST), `{items: [{imageUrl}]}` (CAROUSEL);
 * older rows a bare string or an array. A still wins over a video when both are present.
 */
export function readMedia(value: unknown): ResolvedMedia | null {
  if (typeof value === 'string') {
    const url = value.trim();
    return url ? { url, kind: kindOfUrl(url) } : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const media = readMedia(item);
      if (media) return media;
    }
    return null;
  }
  const record = asRecord(value);
  const image = readString(record.imageUrl);
  if (image) return { url: image, kind: 'image' };
  const video = readString(record.videoUrl);
  if (video) return { url: video, kind: 'video' };
  const url = readString(record.url);
  if (url) return { url, kind: kindOfUrl(url, record.mimeType) };
  return Array.isArray(record.items) ? readMedia(record.items) : null;
}

export function mapTimestampToPostFields(timestamp: string, timeZone: string) {
  const parsed = new Date(timestamp);
  const dayId = Number.isNaN(parsed.getTime())
    ? timestamp.slice(0, 10)
    : (formatPostedDayId(timestamp, timeZone) ?? formatCalendarDayId(parsed));
  return {
    dayId,
    timeLabel: formatPostedTimeLabel(timestamp, timeZone),
  };
}

export type DurableMedia = { kind: MediaKind } & ({ ref: SignablePath } | { url: string });

function storageRef(path: unknown, bucket: unknown, kind: MediaKind): DurableMedia | null {
  if (typeof path !== 'string' || typeof bucket !== 'string' || /^https?:/i.test(path)) return null;
  return path ? { kind, ref: { path, bucket } } : null;
}

/**
 * The durable media behind a published post, read from the original placement snapshot.
 * `media_urls` holds the 24h signed URL sent to the platform at publish time and expires;
 * re-signing a durable {bucket, path} on every read keeps the calendar media live. A still
 * comes first; a reel with no still falls back to its video (the preview paints its first frame).
 */
export function durableMedia(snapshot: Record<string, unknown>): DurableMedia | null {
  const assets = (Array.isArray(snapshot.publishingAssets) ? snapshot.publishingAssets : []).map(
    asRecord,
  );
  const assetRef = (kind: MediaKind) =>
    assets
      .map((asset) =>
        asset.kind === kind ? storageRef(asset.storagePath, asset.bucket, kind) : null,
      )
      .find((ref) => ref !== null) ?? null;
  const ms = asRecord(asRecord(snapshot.creative).mediaSuggestion);
  const hyperframe = asRecord(ms.hyperframe);
  const reel = asRecord(ms.reel);
  const reelPoster = readString(reel.thumbnailUrl);
  return (
    assetRef('image') ??
    (typeof ms.url === 'string'
      ? storageRef(ms.url, ms.bucket, kindOfUrl(ms.url, ms.mimeType))
      : null) ??
    storageRef(hyperframe.coverPath, hyperframe.bucket, 'image') ??
    (reelPoster && /^https?:/i.test(reelPoster)
      ? { kind: 'image', url: reelPoster }
      : storageRef(reelPoster, reel.bucket, 'image')) ??
    assetRef('video') ??
    storageRef(reel.url, reel.bucket, 'video')
  );
}

export function mapPublishedPost(
  row: PublishedPostRow,
  freshMedia: ResolvedMedia | null,
  timeZone: string,
): OrganicCalendarPostedContent {
  const snapshot = asRecord(row.content_snapshot);
  const timestamp = row.published_at || row.created_at;
  const caption = row.caption ?? readString(snapshot.caption) ?? undefined;
  const title = readString(snapshot.title) ?? caption?.slice(0, 72) ?? 'Published post';
  const media = freshMedia ?? readMedia(row.media_urls) ?? readMedia(snapshot.mediaUrls);
  const { dayId, timeLabel } = mapTimestampToPostFields(timestamp, timeZone);
  const platform = normalizeCalendarPlatform(row.platform);

  return {
    id: `published:${platform}:${row.platform_post_id}`,
    source: 'published_posts',
    platform,
    integrationAccountId: row.platform_account_id,
    externalPostId: row.platform_post_id,
    timestamp,
    dayId,
    timeLabel,
    title,
    caption,
    permalink: row.permalink ?? undefined,
    mediaType: row.post_type,
    mediaUrl: media?.url ?? null,
    thumbnailUrl: media?.kind === 'image' ? media.url : null,
    mediaKind: media?.kind,
  };
}

// The analytics feed reports every YouTube video as mediaType VIDEO with a watch?v= link, and
// every Instagram reel as VIDEO too; the shape lives in mediaProductType (SHORTS | VIDEO,
// REELS | STORY | FEED). Only the product types that name a shape override mediaType.
const SHAPED_PRODUCT_TYPES = new Set(['SHORTS', 'REELS', 'STORY']);

export function mapAnalyticsPost(args: {
  post: OrganicPost;
  platform: OrganicPlatformKey;
  integrationAccountId: string;
  timeZone: string;
}): OrganicCalendarPostedContent | null {
  const { post, platform, integrationAccountId, timeZone } = args;
  if (!post.timestamp) return null;

  const { dayId, timeLabel } = mapTimestampToPostFields(post.timestamp, timeZone);
  const caption = post.caption ?? post.title;
  const productType = post.mediaProductType?.toUpperCase();
  // Instagram's media_url is the video file itself for media_type VIDEO; every other feed
  // reports a picture there (Facebook full_picture, the YouTube still, the TikTok cover).
  const mediaKind: MediaKind | undefined = post.mediaUrl
    ? platform === 'instagram' && post.mediaType?.toUpperCase() === 'VIDEO'
      ? 'video'
      : 'image'
    : undefined;

  return {
    id: `external:${platform}:${post.id}`,
    source: 'external',
    platform,
    integrationAccountId,
    externalPostId: post.id,
    timestamp: post.timestamp,
    dayId,
    timeLabel,
    title: post.title ?? caption?.slice(0, 72) ?? 'Published post',
    caption,
    permalink: post.permalink,
    mediaType:
      productType && SHAPED_PRODUCT_TYPES.has(productType)
        ? productType
        : (post.mediaType ?? post.mediaProductType),
    mediaUrl: post.mediaUrl ?? null,
    thumbnailUrl: post.thumbnailUrl ?? (mediaKind === 'image' ? post.mediaUrl : null) ?? null,
    mediaKind,
  };
}

const dedupeKeys = (post: OrganicCalendarPostedContent) => [
  `${post.platform}:id:${post.externalPostId ?? post.id}`,
  ...(post.permalink ? [`${post.platform}:url:${post.permalink}`] : []),
];

const hasMedia = (post: OrganicCalendarPostedContent) =>
  Boolean(post.thumbnailUrl ?? post.mediaUrl);

// Our own row wins over the analytics copy of the same post, but it borrows the copy's media
// and link when it has none (production rows store no permalink, and old ones no live media).
function mergeDuplicate(
  existing: OrganicCalendarPostedContent,
  next: OrganicCalendarPostedContent,
): OrganicCalendarPostedContent {
  const [kept, other] = existing.source === 'external' ? [next, existing] : [existing, next];
  const media =
    !hasMedia(kept) && hasMedia(other)
      ? { mediaUrl: other.mediaUrl, thumbnailUrl: other.thumbnailUrl, mediaKind: other.mediaKind }
      : null;
  return { ...kept, ...media, permalink: kept.permalink ?? other.permalink };
}

/** One entry per post, matched on the platform id or the permalink, oldest first. */
export function dedupePosts(posts: OrganicCalendarPostedContent[]): OrganicCalendarPostedContent[] {
  const byKey = new Map<string, OrganicCalendarPostedContent>();
  for (const post of posts) {
    const existing = dedupeKeys(post)
      .map((key) => byKey.get(key))
      .find((found) => found !== undefined);
    const kept = existing ? mergeDuplicate(existing, post) : post;
    for (const key of [
      ...dedupeKeys(post),
      ...dedupeKeys(kept),
      ...(existing ? dedupeKeys(existing) : []),
    ]) {
      byKey.set(key, kept);
    }
  }
  return [...new Set(byKey.values())].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
