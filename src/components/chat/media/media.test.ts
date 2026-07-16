import { describe, expect, it } from 'bun:test';
import {
  mediaFromCompetitorAdSnapshot,
  mediaFromCreative,
  mediaFromCreativeAd,
  mediaFromFetchedPost,
  mediaFromJainaMediaEntry,
  mediaFromPaidVerdict,
  mediaFromPersistedAttachments,
  mediaFromPreviewUrls,
  resolveMediaKind,
} from './media';

describe('resolveMediaKind', () => {
  it('trusts an explicit mime type first', () => {
    expect(resolveMediaKind({ mimeType: 'video/mp4', url: 'x.png' })).toBe('video');
    expect(resolveMediaKind({ mimeType: 'image/png', url: 'x.mp4' })).toBe('image');
  });

  it('reads the library asset kind', () => {
    expect(resolveMediaKind({ kind: 'video' })).toBe('video');
    expect(resolveMediaKind({ kind: 'image' })).toBe('image');
  });

  // The regression this guards: every chat renderer was an <img>, so these formats rendered an MP4
  // URL into an image tag and simply appeared broken.
  it('treats reels, stories and video formats as video', () => {
    expect(resolveMediaKind({ format: 'reel' })).toBe('video');
    expect(resolveMediaKind({ format: 'video' })).toBe('video');
    expect(resolveMediaKind({ format: 'STORY' })).toBe('video');
  });

  it('treats a carousel as an image', () => {
    expect(resolveMediaKind({ format: 'carousel' })).toBe('image');
  });

  it('falls back to the URL extension when nothing else says', () => {
    expect(resolveMediaKind({ url: 'https://cdn/x/clip.MP4?token=1' })).toBe('video');
    expect(resolveMediaKind({ url: 'https://cdn/x/shot.png' })).toBe('image');
  });

  it('is a file when it has a mime type it does not understand', () => {
    expect(resolveMediaKind({ mimeType: 'application/pdf', url: 'brief.pdf' })).toBe('file');
  });
});

describe('mediaFromCreative', () => {
  it('renders a video ad as video, with its thumbnail as the poster', () => {
    const media = mediaFromCreative({
      id: 'c1',
      url: 'https://cdn/ad.mp4',
      thumbnail_url: 'https://cdn/ad.jpg',
      format: 'video',
      headline: 'Spring sale',
    });

    expect(media.kind).toBe('video');
    expect(media.thumbnailUrl).toBe('https://cdn/ad.jpg');
    expect(media.badge).toBe('Video');
  });

  it('leaves an image ad alone', () => {
    const media = mediaFromCreative({ id: 'c2', url: 'https://cdn/ad.jpg', format: 'image' });
    expect(media.kind).toBe('image');
    expect(media.badge).toBeUndefined();
  });
});

describe('mediaFromFetchedPost', () => {
  it('renders a reel as video and keeps its permalink', () => {
    const media = mediaFromFetchedPost({
      postId: 'p1',
      mediaUrl: 'https://cdn/reel.mp4',
      caption: 'hello',
      permalink: 'https://instagram.com/p/1',
      format: 'reel',
      rank: 2,
    });

    expect(media?.kind).toBe('video');
    expect(media?.permalink).toBe('https://instagram.com/p/1');
    expect(media?.badge).toBe('#2');
  });

  it('drops a post with no media rather than rendering an empty tile', () => {
    expect(
      mediaFromFetchedPost({
        postId: 'p2',
        mediaUrl: null,
        caption: null,
        permalink: null,
        format: 'post',
      }),
    ).toBeNull();
  });
});

describe('mediaFromPreviewUrls', () => {
  it('reads a generated reel from the draft format', () => {
    const [media] = mediaFromPreviewUrls('preview', ['https://cdn/gen'], 'reel');
    expect(media.kind).toBe('video');
  });

  it('keeps carousel slides as stills even though the draft format is a carousel', () => {
    const media = mediaFromPreviewUrls(
      'preview',
      ['https://cdn/a.png', 'https://cdn/b.png'],
      'reel',
    );
    expect(media.map((item) => item.kind)).toEqual(['image', 'image']);
  });
});

describe('mediaFromPersistedAttachments', () => {
  it('gives every attachment a stable id and reads its media type', () => {
    const media = mediaFromPersistedAttachments('m1', [
      { url: 'https://s/a.png', name: 'a.png', mediaType: 'image/png' },
      { url: 'https://s/b.mp4', name: 'b.mp4', mediaType: 'video/mp4' },
    ]);

    expect(media.map((item) => item.id)).toEqual(['m1:attachment:0', 'm1:attachment:1']);
    expect(media.map((item) => item.kind)).toEqual(['image', 'video']);
  });

  it('returns nothing when the turn had no attachments', () => {
    expect(mediaFromPersistedAttachments('m1', undefined)).toEqual([]);
  });
});

describe('mediaFromCreativeAd', () => {
  it('renders a video-format ad as an image with a Video badge — Meta hands the dashboard stills only', () => {
    const media = mediaFromCreativeAd({
      id: 'ad1',
      name: 'Ad one',
      creative: {
        id: 'cr1',
        title: 'Hook headline',
        thumbnailUrl: 'https://cdn.fbcdn.net/thumb.jpg',
        format: 'video',
        videoId: 'v1',
      },
    });
    expect(media).toMatchObject({
      id: 'ad1',
      url: 'https://cdn.fbcdn.net/thumb.jpg',
      kind: 'image',
      badge: 'Video',
      name: 'Hook headline',
    });
  });

  it('falls back to imageUrl and omits the badge for static ads', () => {
    const media = mediaFromCreativeAd({
      id: 'ad2',
      name: 'Ad two',
      creative: { id: 'cr2', imageUrl: 'https://cdn/img.jpg' },
    });
    expect(media).toMatchObject({ url: 'https://cdn/img.jpg', kind: 'image', name: 'Ad two' });
    expect(media?.badge).toBeUndefined();
  });

  it('returns null when the creative has no still at all', () => {
    expect(mediaFromCreativeAd({ id: 'ad3', creative: { id: 'cr3' } })).toBeNull();
    expect(mediaFromCreativeAd({ id: 'ad4', creative: null })).toBeNull();
  });
});

describe('mediaFromPaidVerdict', () => {
  it('absorbs the http guard and carries the permalink', () => {
    const media = mediaFromPaidVerdict({
      adId: 'a1',
      adName: 'Winner',
      thumbnailUrl: 'https://cdn/th.jpg',
      permalinkUrl: 'https://facebook.com/ad',
    });
    expect(media).toMatchObject({
      id: 'a1',
      url: 'https://cdn/th.jpg',
      kind: 'image',
      permalink: 'https://facebook.com/ad',
    });
  });

  it('returns null for a missing or non-http thumbnail', () => {
    expect(
      mediaFromPaidVerdict({ adId: 'a2', adName: null, thumbnailUrl: null, permalinkUrl: null }),
    ).toBeNull();
    expect(
      mediaFromPaidVerdict({
        adId: 'a3',
        adName: null,
        thumbnailUrl: 'data:image/png;base64,x',
        permalinkUrl: null,
      }),
    ).toBeNull();
  });
});

describe('mediaFromCompetitorAdSnapshot', () => {
  it('resolves video from the signed storage URL extension', () => {
    const media = mediaFromCompetitorAdSnapshot(
      { snapshotId: 's1', competitorName: 'Rival', snapshotUrl: 'https://meta/ad' },
      'https://proj.supabase.co/storage/v1/object/sign/creatives/s1.mp4?token=t',
    );
    expect(media).toMatchObject({ id: 's1', kind: 'video', permalink: 'https://meta/ad' });
  });

  it('renders image snapshots as images and null without a URL', () => {
    const media = mediaFromCompetitorAdSnapshot(
      { snapshotId: 's2', competitorName: 'Rival' },
      'https://proj.supabase.co/storage/v1/object/sign/creatives/s2.jpg?token=t',
    );
    expect(media?.kind).toBe('image');
    expect(
      mediaFromCompetitorAdSnapshot({ snapshotId: 's3', competitorName: 'Rival' }, null),
    ).toBeNull();
  });
});

describe('mediaFromJainaMediaEntry', () => {
  it('prefers the thumbnail and stays a still', () => {
    const media = mediaFromJainaMediaEntry({
      entity_type: 'ad',
      entity_id: '123',
      image_url: 'https://cdn/full.jpg',
      thumbnail_url: 'https://cdn/th.jpg',
    });
    expect(media).toMatchObject({ id: 'ad:123', url: 'https://cdn/th.jpg', kind: 'image' });
  });

  it('returns null when the entry has no URL', () => {
    expect(
      mediaFromJainaMediaEntry({ entity_type: 'ad', entity_id: '1', image_url: null }),
    ).toBeNull();
  });
});
