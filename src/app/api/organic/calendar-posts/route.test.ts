import { describe, expect, it } from 'bun:test';
import { fetchPublishedPostPages } from './publishedPostPages';
import { dedupePosts, durableMedia, mapAnalyticsPost, mapPublishedPost, readMedia } from './postedContent';

const SIGNED = 'https://ref.supabase.co/storage/v1/object/sign';
const PUBLIC = 'https://ref.supabase.co/storage/v1/object/public';

describe('fetchPublishedPostPages', () => {
  it('reads every page beyond Supabase’s default 1000 row limit', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({ id: index }));
    const secondPage = [{ id: 1000 }, { id: 1001 }];
    const ranges: Array<[number, number]> = [];
    const fetchPage = async (from: number, to: number) => {
      ranges.push([from, to]);
      return {
        data: (from === 0 ? firstPage : secondPage) as never,
        error: null,
      };
    };

    const result = await fetchPublishedPostPages(fetchPage);

    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(result.rows).toHaveLength(1002);
    expect(result.error).toBeNull();
  });

  it('stops after the first partial page and preserves query errors', async () => {
    let calls = 0;
    const result = await fetchPublishedPostPages(async () => {
      calls += 1;
      return { data: [{ id: 'one' }] as never, error: null };
    });
    expect(calls).toBe(1);
    expect(result.rows).toHaveLength(1);

    const failed = await fetchPublishedPostPages(async () => ({
      data: null,
      error: { message: 'database unavailable' },
    }));
    expect(failed).toEqual({ rows: [], error: { message: 'database unavailable' } });
  });
});

describe('mapAnalyticsPost', () => {
  // The exact shape fetch-organic-analytics/lib/youtube.ts mapVideosToPosts emits.
  const youtubePost = (mediaProductType: string) => ({
    id: 'x',
    title: 'Launch day',
    caption: 'Launch day\nThe full description',
    permalink: 'https://www.youtube.com/watch?v=x',
    timestamp: '2026-10-14T15:00:00Z',
    mediaType: 'VIDEO',
    mediaProductType,
    mediaUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
    thumbnailUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
  });
  const map = (post: Parameters<typeof mapAnalyticsPost>[0]['post'], platform = 'youtube') =>
    mapAnalyticsPost({
      post,
      platform: platform as 'youtube',
      integrationAccountId: 'acct-1',
      timeZone: 'UTC',
    });

  it('carries a YouTube Short as SHORTS although its permalink is a watch URL', () => {
    expect(map(youtubePost('SHORTS'))?.mediaType).toBe('SHORTS');
    expect(map(youtubePost('VIDEO'))?.mediaType).toBe('VIDEO');
  });

  it('lets only a shape-naming product type override mediaType', () => {
    const reel = { id: 'r', timestamp: '2026-10-14T15:00:00Z', mediaType: 'VIDEO' };
    expect(map({ ...reel, mediaProductType: 'REELS' }, 'instagram')?.mediaType).toBe('REELS');
    expect(map({ ...reel, mediaProductType: 'STORY' }, 'instagram')?.mediaType).toBe('STORY');
    expect(
      map({ ...reel, mediaType: 'CAROUSEL_ALBUM', mediaProductType: 'FEED' }, 'instagram')
        ?.mediaType,
    ).toBe('CAROUSEL_ALBUM');
    expect(map({ id: 'n', timestamp: '2026-10-14T15:00:00Z' }, 'instagram')?.mediaType).toBe(
      undefined,
    );
  });
});

// Every shape below is a real production shape, read (structure only) from
// organic.organic_published_posts on 2026-10-17: media_urls is ONE OBJECT per post type, never a
// URL list, and all three published IG reels carry only a {videoUrl}.
describe('readMedia', () => {
  it('reads the production media_urls object of each post type, keeping its kind', () => {
    expect(readMedia({ videoUrl: `${PUBLIC}/organic-content-staging/b/reel.mp4` })).toEqual({
      url: `${PUBLIC}/organic-content-staging/b/reel.mp4`,
      kind: 'video',
    });
    expect(readMedia({ imageUrl: `${SIGNED}/media-library/b/post.png?token=t` })).toEqual({
      url: `${SIGNED}/media-library/b/post.png?token=t`,
      kind: 'image',
    });
    expect(
      readMedia({
        items: [{ imageUrl: 'https://cdn/s1.png' }, { imageUrl: 'https://cdn/s2.png' }],
      }),
    ).toEqual({
      url: 'https://cdn/s1.png',
      kind: 'image',
    });
  });

  it('reads the older string and list shapes, typing a bare URL by its extension', () => {
    expect(readMedia([{ videoUrl: 'https://cdn/v.mp4' }])).toEqual({
      url: 'https://cdn/v.mp4',
      kind: 'video',
    });
    expect(readMedia(['', 'https://cdn/a.png'])).toEqual({
      url: 'https://cdn/a.png',
      kind: 'image',
    });
    expect(readMedia(`${SIGNED}/b/v.mp4?token=t`)?.kind).toBe('video');
    expect(readMedia({ url: 'https://cdn/clip', mimeType: 'video/mp4' })?.kind).toBe('video');
  });

  it('prefers a still when a row carries both, and finds nothing in an empty row', () => {
    expect(readMedia({ videoUrl: 'https://cdn/v.mp4', imageUrl: 'https://cdn/p.jpg' })?.kind).toBe(
      'image',
    );
    expect(readMedia(null)).toBe(null);
    expect(readMedia({})).toBe(null);
    expect(readMedia({ items: [] })).toBe(null);
  });
});

describe('durableMedia', () => {
  it('re-signs the image publishing asset first', () => {
    expect(
      durableMedia({
        publishingAssets: [
          { kind: 'video', storagePath: 'b/v.mp4', bucket: 'media-library' },
          { kind: 'image', storagePath: 'b/i.png', bucket: 'media-library' },
        ],
      }),
    ).toEqual({ kind: 'image', ref: { path: 'b/i.png', bucket: 'media-library' } });
  });

  it('falls back to a production reel with no still: the video asset, then the reel path', () => {
    // Prod reel A: a video asset + reel {bucket, url, thumbnailUrl: null, signedUrl, …}.
    expect(
      durableMedia({
        publishingAssets: [{ kind: 'video', storagePath: 'lib/reel.mp4', bucket: 'media-library' }],
        creative: {
          mediaSuggestion: {
            kind: 'reel',
            url: null,
            reel: {
              bucket: 'media-library',
              url: 'lib/reel.mp4',
              thumbnailUrl: null,
              signedUrl: `${SIGNED}/media-library/lib/reel.mp4?token=old`,
            },
          },
        },
      }),
    ).toEqual({ kind: 'video', ref: { path: 'lib/reel.mp4', bucket: 'media-library' } });
    // Prod reel B: no publishing assets, only reel {bucket, url, generated}.
    expect(
      durableMedia({
        creative: {
          mediaSuggestion: {
            reel: { bucket: 'brand-profile-assets', url: 'gen/reel.mp4', generated: true },
          },
        },
      }),
    ).toEqual({ kind: 'video', ref: { path: 'gen/reel.mp4', bucket: 'brand-profile-assets' } });
  });

  it('takes a reel poster over the video, whether a storage path or a URL', () => {
    const reel = { bucket: 'media-library', url: 'lib/reel.mp4' };
    expect(
      durableMedia({
        creative: { mediaSuggestion: { reel: { ...reel, thumbnailUrl: 'lib/poster.jpg' } } },
      }),
    ).toEqual({ kind: 'image', ref: { path: 'lib/poster.jpg', bucket: 'media-library' } });
    expect(
      durableMedia({
        creative: {
          mediaSuggestion: { reel: { ...reel, thumbnailUrl: 'https://cdn/poster.jpg' } },
        },
      }),
    ).toEqual({ kind: 'image', url: 'https://cdn/poster.jpg' });
  });

  it('types the media suggestion path, reads a hyperframe cover, and skips http and gs URLs', () => {
    expect(
      durableMedia({
        creative: {
          mediaSuggestion: { url: 'b/clip.mp4', bucket: 'media-library', mimeType: 'video/mp4' },
        },
      }),
    ).toEqual({ kind: 'video', ref: { path: 'b/clip.mp4', bucket: 'media-library' } });
    expect(
      durableMedia({
        creative: {
          mediaSuggestion: { hyperframe: { coverPath: 'hf/cover.png', bucket: 'renders' } },
        },
      }),
    ).toEqual({ kind: 'image', ref: { path: 'hf/cover.png', bucket: 'renders' } });
    expect(
      durableMedia({
        creative: {
          mediaSuggestion: {
            reel: { bucket: 'gs://renders', url: 'https://storage.cloud.google.com/renders/r.mp4' },
          },
        },
      }),
    ).toBe(null);
    expect(durableMedia({})).toBe(null);
  });
});

describe('mapPublishedPost', () => {
  // Prod reel C: no content_snapshot, permalink null, media_urls {videoUrl} on a public URL.
  const reelRow = {
    brand_id: 'brand',
    caption: 'Fresh roast drops Friday',
    content_snapshot: null,
    created_at: '2026-07-15T15:00:00Z',
    draft_id: null,
    ig_user_id: 'ig',
    instagram_post_id: '1790',
    media_urls: { videoUrl: `${PUBLIC}/organic-content-staging/b/reel.mp4` },
    permalink: null,
    platform: 'instagram',
    platform_account_id: 'acct',
    platform_post_id: '1790',
    post_type: 'REEL',
    published_at: '2026-07-15T15:00:00Z',
  };

  it('carries a video-only reel as video media with no still, so the frame can paint its first frame', () => {
    const post = mapPublishedPost(reelRow, null, 'UTC');
    expect(post).toMatchObject({
      source: 'published_posts',
      mediaType: 'REEL',
      mediaUrl: `${PUBLIC}/organic-content-staging/b/reel.mp4`,
      thumbnailUrl: null,
      mediaKind: 'video',
    });
    expect(post.permalink).toBeUndefined();
  });

  it('prefers the freshly signed durable media over the publish-time URL', () => {
    const fresh = { url: `${SIGNED}/media-library/lib/reel.mp4?token=new`, kind: 'video' as const };
    expect(mapPublishedPost(reelRow, fresh, 'UTC').mediaUrl).toBe(fresh.url);
    const still = mapPublishedPost(
      { ...reelRow, post_type: 'POST', media_urls: { imageUrl: 'https://cdn/old.png' } },
      { url: 'https://cdn/fresh.png', kind: 'image' },
      'UTC',
    );
    expect(still).toMatchObject({
      mediaUrl: 'https://cdn/fresh.png',
      thumbnailUrl: 'https://cdn/fresh.png',
      mediaKind: 'image',
    });
  });

  it('reads a carousel row from its first item', () => {
    const post = mapPublishedPost(
      {
        ...reelRow,
        post_type: 'CAROUSEL',
        media_urls: { items: [{ imageUrl: 'https://cdn/s1.png' }] },
      },
      null,
      'UTC',
    );
    expect(post).toMatchObject({ thumbnailUrl: 'https://cdn/s1.png', mediaKind: 'image' });
  });
});

describe('mapAnalyticsPost media and titles', () => {
  const map = (post: Parameters<typeof mapAnalyticsPost>[0]['post'], platform: string) =>
    mapAnalyticsPost({
      post,
      platform: platform as 'youtube',
      integrationAccountId: 'a',
      timeZone: 'UTC',
    });

  it('keeps the YouTube title (snippet.title) apart from the caption (snippet.description)', () => {
    const post = map(
      {
        id: 'yt',
        title: 'How we roast',
        caption: 'Twelve ratios, one winner.\nFull method below.',
        timestamp: '2026-10-14T15:00:00Z',
        mediaType: 'VIDEO',
        mediaProductType: 'VIDEO',
        mediaUrl: 'https://i.ytimg.com/vi/yt/hqdefault.jpg',
        thumbnailUrl: 'https://i.ytimg.com/vi/yt/hqdefault.jpg',
      },
      'youtube',
    );
    expect(post).toMatchObject({
      title: 'How we roast',
      caption: 'Twelve ratios, one winner.\nFull method below.',
      mediaKind: 'image',
    });
  });

  it("types an Instagram VIDEO's media_url as the video, and never puts it in thumbnailUrl", () => {
    const reel = {
      id: 'r',
      timestamp: '2026-10-14T15:00:00Z',
      mediaType: 'VIDEO',
      mediaProductType: 'REELS',
      mediaUrl: 'https://scontent.cdninstagram.com/o1/v/r.mp4?stp=x',
    };
    expect(map(reel, 'instagram')).toMatchObject({
      mediaType: 'REELS',
      mediaKind: 'video',
      thumbnailUrl: null,
    });
    expect(map({ ...reel, thumbnailUrl: 'https://cdn/r.jpg' }, 'instagram')).toMatchObject({
      mediaKind: 'video',
      thumbnailUrl: 'https://cdn/r.jpg',
    });
  });

  it('carries Facebook status_type as the media type with full_picture as the still', () => {
    for (const statusType of ['added_video', 'added_photos', 'mobile_status_update']) {
      expect(
        map(
          {
            id: 'fb',
            timestamp: '2026-10-14T15:00:00Z',
            mediaType: statusType,
            mediaProductType: statusType,
            mediaUrl: 'https://scontent.xx.fbcdn.net/full.jpg',
            thumbnailUrl: 'https://scontent.xx.fbcdn.net/full.jpg',
            permalink: 'https://www.facebook.com/123/videos/456/',
          },
          'facebook',
        ),
      ).toMatchObject({
        mediaType: statusType,
        mediaKind: 'image',
        thumbnailUrl: 'https://scontent.xx.fbcdn.net/full.jpg',
      });
    }
  });
});

describe('dedupePosts', () => {
  const base = {
    platform: 'instagram' as const,
    timestamp: '2026-07-15T15:00:00Z',
    dayId: '2026-07-15',
    timeLabel: '3:00 PM',
    title: 'Reel',
  };
  const ours = {
    ...base,
    id: 'published:instagram:1790',
    source: 'published_posts' as const,
    externalPostId: '1790',
  };
  const theirs = {
    ...base,
    id: 'external:instagram:1790',
    source: 'external' as const,
    externalPostId: '1790',
    permalink: 'https://www.instagram.com/reel/abc/',
    mediaUrl: 'https://cdn/r.mp4',
    thumbnailUrl: 'https://cdn/r.jpg',
    mediaKind: 'video' as const,
  };

  it('matches our permalink-less row to its analytics copy by platform id and borrows its media', () => {
    for (const order of [
      [ours, theirs],
      [theirs, ours],
    ]) {
      const posts = dedupePosts(order);
      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({
        id: 'published:instagram:1790',
        source: 'published_posts',
        permalink: 'https://www.instagram.com/reel/abc/',
        mediaUrl: 'https://cdn/r.mp4',
        thumbnailUrl: 'https://cdn/r.jpg',
        mediaKind: 'video',
      });
    }
  });

  it('keeps our own media when we have it, and still matches on the permalink', () => {
    const withMedia = {
      ...ours,
      permalink: theirs.permalink,
      externalPostId: 'other',
      thumbnailUrl: 'https://cdn/ours.png',
      mediaKind: 'image' as const,
    };
    const [post] = dedupePosts([theirs, withMedia]);
    expect(post).toMatchObject({
      id: 'published:instagram:1790',
      thumbnailUrl: 'https://cdn/ours.png',
    });
    expect(
      dedupePosts([ours, { ...theirs, externalPostId: '2', id: 'external:instagram:2' }]),
    ).toHaveLength(2);
  });
});
