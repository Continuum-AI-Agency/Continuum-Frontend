import type { PublishPlatform } from '@continuum/contracts';
import { isPostPlatform } from '@/lib/organic/postPlatforms';
import type { OrganicCalendarPostedContent } from './types';

/**
 * Which native frame a post previews in, and the aspect its media box takes there.
 *
 * feed      — IG / FB / LinkedIn feed card (header, media, actions, caption).
 * vertical  — full-screen 9:16 video surface: Reels, Shorts, TikTok.
 * story     — Instagram story: 9:16 with progress bar and reply pill, no caption.
 * landscape — YouTube long-form watch page: 16:9 player, title, channel row.
 */
export type PreviewFrameKind = 'feed' | 'vertical' | 'story' | 'landscape';
export type PreviewFrame = { kind: PreviewFrameKind; mediaAspect: number };
export type PreviewFormat = 'post' | 'carousel' | 'reel' | 'story';

const VERTICAL: PreviewFrame = { kind: 'vertical', mediaAspect: 9 / 16 };
const STORY: PreviewFrame = { kind: 'story', mediaAspect: 9 / 16 };
const LANDSCAPE: PreviewFrame = { kind: 'landscape', mediaAspect: 16 / 9 };
// Instagram and Facebook crop feed media to 4:5 … 1.91:1; LinkedIn shows the same band.
const FEED_MIN_ASPECT = 4 / 5;
const FEED_MAX_ASPECT = 1.91;
// YouTube treats anything longer than three minutes as long-form, whatever its shape.
const SHORTS_MAX_SECONDS = 180;

/**
 * A draft's `format` is free-form prose from whichever generator wrote it ("FeedPost",
 * "reel", "Hyperframe", "Story"). Read it loosely, in the same order the publisher does.
 */
export function previewFormat(format: string | null | undefined): PreviewFormat {
  const value = (format ?? '').toLowerCase();
  if (value.includes('video') || value.includes('reel') || value.includes('hyperframe')) {
    return 'reel';
  }
  if (value.includes('carousel')) return 'carousel';
  if (value.includes('story') || value.includes('stories')) return 'story';
  return 'post';
}

function feedFrame(aspect: number | null, fallback: number): PreviewFrame {
  const value = aspect ?? fallback;
  return {
    kind: 'feed',
    mediaAspect: Math.min(Math.max(value, FEED_MIN_ASPECT), FEED_MAX_ASPECT),
  };
}

export function resolvePreviewFrame({
  platform,
  format,
  mediaWidth,
  mediaHeight,
  durationSec,
}: {
  platform: string;
  format: string | null | undefined;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  durationSec?: number | null;
}): PreviewFrame {
  const kind = previewFormat(format);
  const aspect = mediaWidth && mediaHeight && mediaHeight > 0 ? mediaWidth / mediaHeight : null;

  if (platform === 'tiktok') return VERTICAL;
  if (platform === 'youtube') {
    const isLongForm = (aspect ?? 0) > 1 || (durationSec ?? 0) > SHORTS_MAX_SECONDS;
    return isLongForm ? LANDSCAPE : VERTICAL;
  }
  if (platform === 'linkedin') return feedFrame(aspect, kind === 'reel' ? 16 / 9 : 1.91);
  // Instagram and Facebook; an unknown platform previews as Instagram.
  if (kind === 'story' && platform !== 'facebook') return STORY;
  if (kind === 'reel') return VERTICAL;
  return feedFrame(aspect, 1);
}

export type LoadedMediaSize = {
  src: string;
  width: number;
  height: number;
  durationSec?: number;
};

/** Natural size of an `<img>` (load) or `<video>` (loadedmetadata) event target. */
export function loadedMediaSize(target: EventTarget | null): LoadedMediaSize | null {
  const media = target as {
    getAttribute?: (name: string) => string | null;
    videoWidth?: number;
    videoHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    duration?: number;
  } | null;
  const width = media?.videoWidth ?? media?.naturalWidth ?? 0;
  const height = media?.videoHeight ?? media?.naturalHeight ?? 0;
  if (!(width > 0 && height > 0)) return null;
  const duration = media?.duration;
  return {
    src: media?.getAttribute?.('src') ?? '',
    width,
    height,
    durationSec: duration && Number.isFinite(duration) ? duration : undefined,
  };
}

export type PostedPreview = {
  platform: PublishPlatform;
  format: PreviewFormat;
  frame: PreviewFrame;
  mediaUrl: string | null;
  /** `video` only when there is no still to show and `mediaUrl` is the video file itself. */
  mediaKind: 'image' | 'video';
  isVideo: boolean;
};

/**
 * A published post as frame input. `null` for a platform with no native frame.
 *
 * The platforms report `mediaType` loosely: IMAGE / VIDEO / REELS / CAROUSEL_ALBUM / STORY,
 * and Facebook its status_type (added_video, added_photos, mobile_status_update). Any type
 * naming VIDEO is a video; a Facebook video is a reel only when its permalink says so, and a
 * Facebook /reel/ link is a reel whatever its type. YouTube links every video as watch?v=, so
 * a Short is SHORTS (the analytics product type), then a `/shorts/` link, and anything else is
 * long-form.
 */
export function postedPreviewInput(
  post: Pick<
    OrganicCalendarPostedContent,
    'platform' | 'mediaType' | 'permalink' | 'mediaUrl' | 'thumbnailUrl' | 'mediaKind'
  >,
  loaded?: Pick<LoadedMediaSize, 'width' | 'height'> | null,
): PostedPreview | null {
  if (!isPostPlatform(post.platform)) return null;
  const platform = post.platform;
  const type = (post.mediaType ?? '').toUpperCase();
  const permalink = post.permalink ?? '';
  const reelType = type === 'REEL' || type === 'REELS' || type === 'SHORTS';
  const videoType = reelType || type.includes('VIDEO');
  const format: PreviewFormat =
    platform === 'facebook' && permalink.includes('/reel/')
      ? 'reel'
      : type.includes('CAROUSEL')
        ? 'carousel'
        : type === 'STORY'
          ? 'story'
          : reelType || (videoType && platform !== 'facebook')
            ? 'reel'
            : 'post';
  const isShort = type === 'SHORTS' || permalink.includes('/shorts/');
  const size =
    platform === 'youtube'
      ? isShort
        ? { width: 9, height: 16 }
        : { width: 16, height: 9 }
      : loaded;
  return {
    platform,
    format,
    frame: resolvePreviewFrame({
      platform,
      format,
      mediaWidth: size?.width,
      mediaHeight: size?.height,
    }),
    mediaUrl: post.thumbnailUrl ?? post.mediaUrl ?? null,
    mediaKind:
      !post.thumbnailUrl && post.mediaUrl && post.mediaKind === 'video' ? 'video' : 'image',
    isVideo: format === 'reel' || videoType,
  };
}

/** "Sat, Oct 24" for a planner day id; `undefined` when there is no day to name. */
export function frameDayLabel(dayId: string | null | undefined): string | undefined {
  if (!dayId) return undefined;
  const date = new Date(`${dayId}T12:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * What each platform calls a video in the frame it previews in. Only the video format is
 * renamed; Post, Carousel and Story read the same everywhere.
 */
export function frameFormatLabel(format: string, platform: string, kind: PreviewFrameKind): string {
  if (format !== 'Reel') return format;
  if (kind === 'vertical' && (platform === 'instagram' || platform === 'facebook')) return 'Reel';
  return kind === 'vertical' && platform === 'youtube' ? 'Short' : 'Video';
}
