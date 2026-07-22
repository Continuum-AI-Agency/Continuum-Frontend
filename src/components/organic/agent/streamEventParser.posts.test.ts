import { describe, expect, it } from 'bun:test';

import { normalizePostToolResult } from './streamEventParser';

describe('normalizePostToolResult — getCompetitorInstagramTopPosts', () => {
  const basePost = {
    id: 'post_123',
    captionSnippet: 'Check this out',
    permalink: 'https://www.instagram.com/p/abc/',
    timestamp: '2026-06-01T10:00:00Z',
    mediaType: 'IMAGE',
    likes: 400,
    comments: 12,
    engagement: 0.05,
  };

  it('extracts mediaUrl from creative.thumbnailUrl', () => {
    const result = {
      found: true,
      posts: [
        {
          ...basePost,
          creative: {
            thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
            mediaUrl: null,
            children: [],
          },
        },
      ],
    };
    const posts = normalizePostToolResult('getCompetitorInstagramTopPosts', result);
    expect(posts).toHaveLength(1);
    expect(posts[0].mediaUrl).toBe('https://cdn.example.com/thumb.jpg');
    expect(posts[0].postId).toBe('post_123');
    expect(posts[0].source).toBe('instagram');
    expect(posts[0].platform).toBe('instagram');
    expect(posts[0].caption).toBe('Check this out');
    expect(posts[0].permalink).toBe('https://www.instagram.com/p/abc/');
    expect(posts[0].metrics).toEqual({ likes: 400, comments: 12, engagement: 0.05 });
  });

  it('prefers first carousel child mediaUrl over creative.thumbnailUrl', () => {
    const result = {
      found: true,
      posts: [
        {
          ...basePost,
          creative: {
            thumbnailUrl: 'https://cdn.example.com/parent-thumb.jpg',
            mediaUrl: null,
            children: [
              { mediaUrl: 'https://cdn.example.com/child0.jpg', thumbnailUrl: null },
              { mediaUrl: 'https://cdn.example.com/child1.jpg', thumbnailUrl: null },
            ],
          },
        },
      ],
    };
    const posts = normalizePostToolResult('getCompetitorInstagramTopPosts', result);
    expect(posts[0].mediaUrl).toBe('https://cdn.example.com/child0.jpg');
  });

  it('falls back to child thumbnailUrl when child has no mediaUrl', () => {
    const result = {
      found: true,
      posts: [
        {
          ...basePost,
          creative: {
            thumbnailUrl: 'https://cdn.example.com/parent-thumb.jpg',
            mediaUrl: null,
            children: [{ mediaUrl: null, thumbnailUrl: 'https://cdn.example.com/child-thumb.jpg' }],
          },
        },
      ],
    };
    const posts = normalizePostToolResult('getCompetitorInstagramTopPosts', result);
    expect(posts[0].mediaUrl).toBe('https://cdn.example.com/child-thumb.jpg');
  });

  it('falls back to creative.mediaUrl when no children', () => {
    const result = {
      found: true,
      posts: [
        {
          ...basePost,
          creative: {
            thumbnailUrl: null,
            mediaUrl: 'https://cdn.example.com/media.mp4',
            children: [],
          },
        },
      ],
    };
    const posts = normalizePostToolResult('getCompetitorInstagramTopPosts', result);
    expect(posts[0].mediaUrl).toBe('https://cdn.example.com/media.mp4');
  });

  it('returns empty array when found=false', () => {
    const posts = normalizePostToolResult('getCompetitorInstagramTopPosts', {
      found: false,
      posts: [],
    });
    expect(posts).toHaveLength(0);
  });

  it('skips posts without an id', () => {
    const result = {
      found: true,
      posts: [{ captionSnippet: 'no id', creative: null }],
    };
    const posts = normalizePostToolResult('getCompetitorInstagramTopPosts', result);
    expect(posts).toHaveLength(0);
  });

  it('handles null creative gracefully (mediaUrl=null)', () => {
    const result = {
      found: true,
      posts: [{ ...basePost, creative: null }],
    };
    const posts = normalizePostToolResult('getCompetitorInstagramTopPosts', result);
    expect(posts).toHaveLength(1);
    expect(posts[0].mediaUrl).toBeNull();
  });
});

describe('normalizePostToolResult — getTopPosts thumbnail_url', () => {
  it('reads thumbnail_url from row data', () => {
    const result = {
      ok: true,
      platform: 'instagram',
      rows: [
        {
          post_id: 'p1',
          permalink: 'https://www.instagram.com/p/xyz/',
          caption_snippet: 'My top post',
          posted_at: '2026-05-01T12:00:00Z',
          thumbnail_url: 'https://cdn.example.com/p1-thumb.jpg',
          rank: 1,
          metric_value: 1200,
          metrics: { reach: 1200 },
        },
      ],
    };
    const posts = normalizePostToolResult('getTopPosts', result);
    expect(posts).toHaveLength(1);
    expect(posts[0].mediaUrl).toBe('https://cdn.example.com/p1-thumb.jpg');
    expect(posts[0].postId).toBe('p1');
  });

  it('returns null mediaUrl when thumbnail_url is absent', () => {
    const result = {
      ok: true,
      platform: 'instagram',
      rows: [
        {
          post_id: 'p2',
          permalink: null,
          caption_snippet: null,
          posted_at: null,
          rank: 2,
          metric_value: 500,
          metrics: {},
        },
      ],
    };
    const posts = normalizePostToolResult('getTopPosts', result);
    expect(posts[0].mediaUrl).toBeNull();
  });
});
