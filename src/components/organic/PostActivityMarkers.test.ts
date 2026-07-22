import { describe, expect, it } from 'bun:test';

import { buildPostActivityDays, classifyPostContentType } from './PostActivityMarkers';

describe('classifyPostContentType', () => {
  it('maps Instagram product types', () => {
    expect(classifyPostContentType({ id: '1', mediaProductType: 'REELS' })).toBe('reel');
    expect(classifyPostContentType({ id: '2', mediaProductType: 'FEED' })).toBe('post');
    expect(classifyPostContentType({ id: '3', mediaProductType: 'STORY' })).toBe('story');
  });

  it('maps YouTube SHORTS and VIDEO product types', () => {
    expect(
      classifyPostContentType({ id: 's', mediaType: 'VIDEO', mediaProductType: 'SHORTS' }),
    ).toBe('short');
    expect(
      classifyPostContentType({ id: 'v', mediaType: 'VIDEO', mediaProductType: 'VIDEO' }),
    ).toBe('video');
  });

  it('maps LinkedIn and Facebook product types to post', () => {
    expect(classifyPostContentType({ id: 'li', mediaProductType: 'LINKEDIN_POST' })).toBe('post');
    expect(classifyPostContentType({ id: 'fb', mediaProductType: 'POST' })).toBe('post');
  });

  it('treats bare VIDEO mediaType as video (TikTok / incomplete product type)', () => {
    expect(classifyPostContentType({ id: 'tt', mediaType: 'VIDEO' })).toBe('video');
  });

  it('defaults unknown shapes to post', () => {
    expect(classifyPostContentType({ id: 'x', mediaType: 'IMAGE' })).toBe('post');
    expect(classifyPostContentType({ id: 'y' })).toBe('post');
  });
});

describe('buildPostActivityDays', () => {
  it('keeps only axis days that have posts, regardless of platform shape', () => {
    const trends = [
      { date: '2026-06-29', reach: 10 },
      { date: '2026-06-30', reach: 20 },
    ];
    const posts = [
      {
        id: 'yt-short',
        timestamp: '2026-06-30T12:00:00Z',
        mediaType: 'VIDEO',
        mediaProductType: 'SHORTS',
      },
      {
        id: 'off-axis',
        timestamp: '2026-07-01T12:00:00Z',
        mediaProductType: 'VIDEO',
      },
    ];
    const days = buildPostActivityDays(trends, posts, new Set(['2026-06-29', '2026-06-30']));
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-06-30');
    expect(days[0].postCount).toBe(1);
    expect(classifyPostContentType(days[0].publishedPosts[0])).toBe('short');
  });
});
