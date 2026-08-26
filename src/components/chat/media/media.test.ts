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
  mediaListFromAdsetAd,
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
  it('reads a realized reel from the draft format when its signed URL says nothing', () => {
    const [media] = mediaFromPreviewUrls('preview', ['https://cdn/gen'], 'reel', 'realized');
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

  // The regression that made a reel concept show a grey letter tile: a storyboard frame is a
  // still, so putting it in a <video> because the DRAFT is a reel fails, finds no poster to
  // degrade to, and lands on the fallback glyph. Stage decides, not format.
  it('treats a storyboard frame as a still whatever the draft format claims', () => {
    const [media] = mediaFromPreviewUrls('concept', ['https://cdn/frame'], 'reel');
    expect(media.kind).toBe('image');
  });

  it('still reads a realized asset whose URL carries its own extension', () => {
    const [media] = mediaFromPreviewUrls('preview', ['https://cdn/final.mp4'], null, 'realized');
    expect(media.kind).toBe('video');
  });

  // A storyboard URL that IS a video is still a video — the stage suppresses the format's vote,
  // never the URL's own evidence.
  it('does not suppress a storyboard URL that says it is a video', () => {
    const [media] = mediaFromPreviewUrls('concept', ['https://cdn/clip.mp4'], 'reel');
    expect(media.kind).toBe('video');
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

describe('mediaListFromAdsetAd', () => {
  const CDN = 'https://scontent-lax3-1.xx.fbcdn.net';

  it('prefers the full image over Metas 64x64 thumbnail', () => {
    const media = mediaListFromAdsetAd({
      id: 'ad1',
      name: 'Ad One',
      thumbnailUrl: `${CDN}/tiny_p64x64.jpg`,
      creative: { format: 'image', imageUrl: `${CDN}/full.jpg` },
    });
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({ url: `${CDN}/full.jpg`, kind: 'image' });
  });

  it('renders a playable video as kind video with the poster attached', () => {
    const media = mediaListFromAdsetAd({
      id: 'ad1',
      thumbnailUrl: `${CDN}/tiny.jpg`,
      creative: { format: 'video', posterUrl: `${CDN}/poster.jpg`, videoUrl: `${CDN}/clip.mp4` },
    });
    expect(media[0]).toMatchObject({
      url: `${CDN}/clip.mp4`,
      kind: 'video',
      thumbnailUrl: `${CDN}/poster.jpg`,
    });
    expect(media[0]?.badge).toBeUndefined();
  });

  it('keeps an unplayable video as an image on its poster, badged Video', () => {
    const media = mediaListFromAdsetAd({
      id: 'ad1',
      thumbnailUrl: `${CDN}/tiny.jpg`,
      creative: { format: 'video', posterUrl: `${CDN}/poster.jpg`, videoUrl: null },
    });
    expect(media[0]).toMatchObject({ url: `${CDN}/poster.jpg`, kind: 'image', badge: 'Video' });
  });

  it('expands a carousel into one item per slide with k/N badges', () => {
    const media = mediaListFromAdsetAd({
      id: 'ad1',
      creative: {
        format: 'carousel',
        permalinkUrl: 'https://www.instagram.com/p/abc/',
        slides: [
          { index: 0, imageUrl: `${CDN}/1.jpg`, caption: 'First' },
          { index: 1, imageUrl: `${CDN}/2.jpg` },
          { index: 2, videoUrl: `${CDN}/3.mp4`, posterUrl: `${CDN}/3.jpg` },
        ],
      },
    });
    expect(media).toHaveLength(3);
    expect(media[0]).toMatchObject({ id: 'ad1:0', caption: 'First', kind: 'image' });
    // The carousel renders the k/N counter itself; slides must not duplicate it.
    expect(media[0]?.badge).toBeUndefined();
    expect(media[2]).toMatchObject({
      url: `${CDN}/3.mp4`,
      kind: 'video',
      thumbnailUrl: `${CDN}/3.jpg`,
    });
    expect(media[0]?.permalink).toBe('https://www.instagram.com/p/abc/');
  });

  it('applies the recovery override to the primary still only', () => {
    const media = mediaListFromAdsetAd(
      { id: 'ad1', thumbnailUrl: `${CDN}/expired.jpg`, creative: { format: 'image' } },
      `${CDN}/fresh.jpg`,
    );
    expect(media[0]?.url).toBe(`${CDN}/fresh.jpg`);
  });

  it('falls back to the bare thumbnail when the edge sent no creative at all', () => {
    const media = mediaListFromAdsetAd({ id: 'ad1', thumbnailUrl: `${CDN}/tiny.jpg` });
    expect(media[0]).toMatchObject({ url: `${CDN}/tiny.jpg`, kind: 'image' });
  });

  it('returns nothing usable rather than a broken tile', () => {
    expect(mediaListFromAdsetAd({ id: 'ad1', thumbnailUrl: null })).toEqual([]);
    expect(mediaListFromAdsetAd({ id: 'ad1', thumbnailUrl: 'not-a-url' })).toEqual([]);
  });
});
