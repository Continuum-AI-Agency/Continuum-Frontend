import { describe, expect, it } from 'bun:test';

import {
  frameDayLabel,
  frameFormatLabel,
  loadedMediaSize,
  postedPreviewInput,
  previewFormat,
  resolvePreviewFrame,
} from './social-preview-utils';

type Row = [
  label: string,
  input: Parameters<typeof resolvePreviewFrame>[0],
  kind: string,
  mediaAspect: number,
];

const FRAME_ROWS: Row[] = [
  ['IG post, no media size → 1:1 feed', { platform: 'instagram', format: 'Post' }, 'feed', 1],
  [
    'IG post, portrait 4:5',
    { platform: 'instagram', format: 'Post', mediaWidth: 1080, mediaHeight: 1350 },
    'feed',
    4 / 5,
  ],
  [
    'IG post, 9:16 still clamps to 4:5',
    { platform: 'instagram', format: 'Post', mediaWidth: 1080, mediaHeight: 1920 },
    'feed',
    4 / 5,
  ],
  [
    'IG post, 3:1 panorama clamps to 1.91:1',
    { platform: 'instagram', format: 'Post', mediaWidth: 3000, mediaHeight: 1000 },
    'feed',
    1.91,
  ],
  [
    'IG carousel takes the first slide aspect',
    { platform: 'instagram', format: 'Carousel', mediaWidth: 1920, mediaHeight: 1080 },
    'feed',
    16 / 9,
  ],
  ['IG reel → vertical', { platform: 'instagram', format: 'Reel' }, 'vertical', 9 / 16],
  ['IG legacy video → vertical', { platform: 'instagram', format: 'video' }, 'vertical', 9 / 16],
  ['IG hyperframe → vertical', { platform: 'instagram', format: 'hyperframe' }, 'vertical', 9 / 16],
  ['IG story → story', { platform: 'instagram', format: 'Story' }, 'story', 9 / 16],
  ['FB post, no media size → 1:1 feed', { platform: 'facebook', format: 'Post' }, 'feed', 1],
  [
    'FB carousel clamps like IG',
    { platform: 'facebook', format: 'carousel', mediaWidth: 1080, mediaHeight: 1920 },
    'feed',
    4 / 5,
  ],
  ['FB reel → vertical', { platform: 'facebook', format: 'Reel' }, 'vertical', 9 / 16],
  [
    'LinkedIn still, no media size → 1.91:1',
    { platform: 'linkedin', format: 'Post' },
    'feed',
    1.91,
  ],
  [
    'LinkedIn video, no media size → 16:9',
    { platform: 'linkedin', format: 'Reel' },
    'feed',
    16 / 9,
  ],
  [
    'LinkedIn still, square stays square',
    { platform: 'linkedin', format: 'Post', mediaWidth: 1080, mediaHeight: 1080 },
    'feed',
    1,
  ],
  [
    'LinkedIn image clamps to 4:5',
    { platform: 'linkedin', format: 'Carousel', mediaWidth: 1080, mediaHeight: 1920 },
    'feed',
    4 / 5,
  ],
  ['TikTok post → vertical', { platform: 'tiktok', format: 'Post' }, 'vertical', 9 / 16],
  ['TikTok carousel → vertical', { platform: 'tiktok', format: 'Carousel' }, 'vertical', 9 / 16],
  [
    'TikTok landscape video → still vertical',
    { platform: 'tiktok', format: 'Reel', mediaWidth: 1920, mediaHeight: 1080 },
    'vertical',
    9 / 16,
  ],
  ['YouTube, unknown media → Shorts', { platform: 'youtube', format: 'Reel' }, 'vertical', 9 / 16],
  [
    'YouTube 9:16 under 3 min → Shorts',
    { platform: 'youtube', format: 'Reel', mediaWidth: 1080, mediaHeight: 1920, durationSec: 59 },
    'vertical',
    9 / 16,
  ],
  [
    'YouTube 16:9 → long-form',
    { platform: 'youtube', format: 'Reel', mediaWidth: 1920, mediaHeight: 1080 },
    'landscape',
    16 / 9,
  ],
  [
    'YouTube 9:16 over 3 min → long-form',
    { platform: 'youtube', format: 'Reel', mediaWidth: 1080, mediaHeight: 1920, durationSec: 181 },
    'landscape',
    16 / 9,
  ],
  ['unknown platform previews as Instagram', { platform: 'threads', format: 'Post' }, 'feed', 1],
];

describe('resolvePreviewFrame', () => {
  for (const [label, input, kind, mediaAspect] of FRAME_ROWS) {
    it(label, () => {
      const frame = resolvePreviewFrame(input);
      expect(frame.kind).toBe(kind);
      expect(frame.mediaAspect).toBeCloseTo(mediaAspect, 5);
    });
  }
});

describe('previewFormat', () => {
  it('reads free-form generator formats loosely', () => {
    expect(previewFormat('FeedPost')).toBe('post');
    expect(previewFormat('Single image')).toBe('post');
    expect(previewFormat(undefined)).toBe('post');
    expect(previewFormat('Carousel')).toBe('carousel');
    expect(previewFormat('REEL')).toBe('reel');
    expect(previewFormat('Hyperframe')).toBe('reel');
    expect(previewFormat('Instagram stories')).toBe('story');
  });
});

describe('loadedMediaSize', () => {
  it('reads an image natural size and a video size + duration', () => {
    const img = { naturalWidth: 1080, naturalHeight: 1350, getAttribute: () => 'a.png' };
    expect(loadedMediaSize(img as unknown as EventTarget)).toEqual({
      src: 'a.png',
      width: 1080,
      height: 1350,
      durationSec: undefined,
    });
    const video = {
      videoWidth: 1920,
      videoHeight: 1080,
      duration: 240,
      getAttribute: () => 'v.mp4',
    };
    expect(loadedMediaSize(video as unknown as EventTarget)).toEqual({
      src: 'v.mp4',
      width: 1920,
      height: 1080,
      durationSec: 240,
    });
  });

  it('ignores a target that has not decoded a size yet', () => {
    expect(loadedMediaSize({ naturalWidth: 0, naturalHeight: 0 } as unknown as EventTarget)).toBe(
      null,
    );
    expect(loadedMediaSize(null)).toBe(null);
  });
});

type PostedRow = [
  label: string,
  post: Parameters<typeof postedPreviewInput>[0],
  format: string,
  kind: string,
  isVideo: boolean,
];

const POSTED_ROWS: PostedRow[] = [
  ['IG image', { platform: 'instagram', mediaType: 'IMAGE' }, 'post', 'feed', false],
  ['IG no media type', { platform: 'instagram' }, 'post', 'feed', false],
  [
    'IG carousel album',
    { platform: 'instagram', mediaType: 'CAROUSEL_ALBUM' },
    'carousel',
    'feed',
    false,
  ],
  ['IG reels', { platform: 'instagram', mediaType: 'REELS' }, 'reel', 'vertical', true],
  ['IG video', { platform: 'instagram', mediaType: 'video' }, 'reel', 'vertical', true],
  ['IG story', { platform: 'instagram', mediaType: 'STORY' }, 'story', 'story', false],
  ['FB photo', { platform: 'facebook', mediaType: 'PHOTO' }, 'post', 'feed', false],
  [
    'FB video post',
    { platform: 'facebook', mediaType: 'VIDEO', permalink: 'https://facebook.com/x/videos/1' },
    'post',
    'feed',
    true,
  ],
  [
    'FB video reel',
    { platform: 'facebook', mediaType: 'VIDEO', permalink: 'https://facebook.com/reel/1' },
    'reel',
    'vertical',
    true,
  ],
  ['FB reel', { platform: 'facebook', mediaType: 'REEL' }, 'reel', 'vertical', true],
  // Production Facebook analytics rows carry status_type as the media type.
  [
    'FB added_video behind a /reel/ link',
    {
      platform: 'facebook',
      mediaType: 'added_video',
      permalink: 'https://www.facebook.com/reel/1',
    },
    'reel',
    'vertical',
    true,
  ],
  [
    'FB added_video behind a /videos/ link',
    {
      platform: 'facebook',
      mediaType: 'added_video',
      permalink: 'https://www.facebook.com/123/videos/456/',
    },
    'post',
    'feed',
    true,
  ],
  [
    'FB added_photos',
    {
      platform: 'facebook',
      mediaType: 'added_photos',
      permalink: 'https://www.facebook.com/x/posts/1',
    },
    'post',
    'feed',
    false,
  ],
  [
    'FB mobile_status_update',
    { platform: 'facebook', mediaType: 'mobile_status_update' },
    'post',
    'feed',
    false,
  ],
  [
    'FB /reel/ link is a reel whatever its type',
    {
      platform: 'facebook',
      mediaType: 'mobile_status_update',
      permalink: 'https://facebook.com/reel/9',
    },
    'reel',
    'vertical',
    true,
  ],
  ['LinkedIn post', { platform: 'linkedin', mediaType: 'POST' }, 'post', 'feed', false],
  ['LinkedIn video', { platform: 'linkedin', mediaType: 'VIDEO' }, 'reel', 'feed', true],
  ['TikTok video', { platform: 'tiktok', mediaType: 'VIDEO' }, 'reel', 'vertical', true],
  [
    'YouTube short',
    { platform: 'youtube', mediaType: 'VIDEO', permalink: 'https://youtube.com/shorts/abc' },
    'reel',
    'vertical',
    true,
  ],
  [
    'YouTube long-form',
    { platform: 'youtube', mediaType: 'VIDEO', permalink: 'https://youtube.com/watch?v=abc' },
    'reel',
    'landscape',
    true,
  ],
  // Production shape: the analytics fetch links every YouTube video as watch?v= and
  // carries Shorts vs long-form only in the product type.
  [
    'YouTube SHORTS behind a watch URL',
    { platform: 'youtube', mediaType: 'SHORTS', permalink: 'https://www.youtube.com/watch?v=x' },
    'reel',
    'vertical',
    true,
  ],
  [
    'YouTube VIDEO behind a watch URL',
    { platform: 'youtube', mediaType: 'VIDEO', permalink: 'https://www.youtube.com/watch?v=x' },
    'reel',
    'landscape',
    true,
  ],
];

describe('postedPreviewInput', () => {
  for (const [label, post, format, kind, isVideo] of POSTED_ROWS) {
    it(label, () => {
      const preview = postedPreviewInput(post);
      expect(preview?.format).toBe(format);
      expect(preview?.frame.kind).toBe(kind);
      expect(preview?.isVideo).toBe(isVideo);
    });
  }

  it('shows a production IG reel that carries only its video file as that video', () => {
    // organic_published_posts REEL rows: media_urls {videoUrl}, no still anywhere.
    const reel = {
      platform: 'instagram' as const,
      mediaType: 'REEL',
      mediaUrl: 'https://ref.supabase.co/storage/v1/object/public/staging/reel.mp4',
      thumbnailUrl: null,
      mediaKind: 'video' as const,
    };
    const preview = postedPreviewInput(reel);
    expect(preview).toMatchObject({ format: 'reel', mediaKind: 'video', mediaUrl: reel.mediaUrl });
    expect(preview?.frame.kind).toBe('vertical');
    // A still always wins over the video file, and a kindless URL reads as a picture.
    expect(postedPreviewInput({ ...reel, thumbnailUrl: 'https://cdn/r.jpg' })).toMatchObject({
      mediaKind: 'image',
      mediaUrl: 'https://cdn/r.jpg',
    });
    expect(postedPreviewInput({ ...reel, mediaKind: undefined })?.mediaKind).toBe('image');
  });

  it('keeps no frame for a platform without a publisher', () => {
    expect(postedPreviewInput({ platform: 'threads' as 'instagram' })).toBe(null);
  });

  it('prefers the thumbnail and sizes feed media from the loaded image', () => {
    const preview = postedPreviewInput(
      { platform: 'instagram', mediaType: 'IMAGE', mediaUrl: 'm.jpg', thumbnailUrl: 't.jpg' },
      { width: 1080, height: 1350 },
    );
    expect(preview?.mediaUrl).toBe('t.jpg');
    expect(preview?.frame.mediaAspect).toBeCloseTo(4 / 5, 5);
    expect(postedPreviewInput({ platform: 'instagram', mediaUrl: 'm.jpg' })?.mediaUrl).toBe(
      'm.jpg',
    );
  });
});

describe('frameDayLabel', () => {
  it('names a planner day and nothing else', () => {
    expect(frameDayLabel('2026-10-24')).toBe('Sat, Oct 24');
    expect(frameDayLabel(null)).toBe(undefined);
    expect(frameDayLabel('not-a-day')).toBe(undefined);
  });
});

describe('frameFormatLabel', () => {
  it('calls a video what the frame it previews in calls it', () => {
    expect(frameFormatLabel('Reel', 'instagram', 'vertical')).toBe('Reel');
    expect(frameFormatLabel('Reel', 'facebook', 'vertical')).toBe('Reel');
    expect(frameFormatLabel('Reel', 'youtube', 'vertical')).toBe('Short');
    expect(frameFormatLabel('Reel', 'youtube', 'landscape')).toBe('Video');
    expect(frameFormatLabel('Reel', 'tiktok', 'vertical')).toBe('Video');
    expect(frameFormatLabel('Reel', 'linkedin', 'feed')).toBe('Video');
  });

  it('leaves every other format as it is', () => {
    expect(frameFormatLabel('Post', 'tiktok', 'vertical')).toBe('Post');
    expect(frameFormatLabel('Story', 'instagram', 'story')).toBe('Story');
    expect(frameFormatLabel('Carousel', 'facebook', 'feed')).toBe('Carousel');
  });
});
