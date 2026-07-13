import { describe, expect, it } from 'bun:test';
import {
  mediaFromCreative,
  mediaFromFetchedPost,
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
