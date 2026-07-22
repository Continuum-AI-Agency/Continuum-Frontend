import { describe, expect, it } from 'bun:test';
import type { OrganicAwarenessReportPayload } from '@continuum/contracts';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';

import { buildOrganicCreativeRows, extractAwarenessHookRates } from './organic-creative-rows';

function post(params: {
  id: string;
  reach?: number;
  hookRate?: number;
  caption?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  impressions?: number;
  views?: number;
  comments?: number;
}): OrganicPost {
  return {
    id: params.id,
    caption: params.caption,
    mediaProductType: 'REELS',
    mediaUrl: params.mediaUrl,
    thumbnailUrl: params.thumbnailUrl,
    metrics: {
      reach: params.reach,
      hookRate: params.hookRate,
      impressions: params.impressions,
      views: params.views,
      comments: params.comments,
    },
  };
}

describe('buildOrganicCreativeRows', () => {
  it('ranks by reach desc and resolves the thumbnail', () => {
    const rows = buildOrganicCreativeRows({
      metric: 'reach',
      posts: [
        post({ id: 'low', reach: 100, mediaUrl: 'u-low.jpg' }),
        post({ id: 'high', reach: 9000, mediaUrl: 'u-high.jpg' }),
      ],
    });
    expect(rows[0]?.id).toBe('high');
    expect(rows[0]?.thumbnailUrl).toBe('u-high.jpg');
    expect(rows[0]?.metricValue).toBe(9000);
  });

  it('prefers thumbnailUrl over mediaUrl (mediaUrl is an unrenderable .mp4 for video posts)', () => {
    const rows = buildOrganicCreativeRows({
      metric: 'reach',
      posts: [
        post({
          id: 'reel',
          reach: 500,
          mediaUrl: 'https://cdn.example.com/reel.mp4',
          thumbnailUrl: 'https://cdn.example.com/reel-thumb.jpg',
        }),
      ],
    });
    expect(rows[0]?.thumbnailUrl).toBe('https://cdn.example.com/reel-thumb.jpg');
  });

  it('does not coerce missing reach into a ranked zero', () => {
    const rows = buildOrganicCreativeRows({
      metric: 'reach',
      posts: [
        post({ id: 'missing', mediaUrl: 'missing.jpg' }),
        post({ id: 'real', reach: 1200, mediaUrl: 'real.jpg' }),
      ],
    });
    expect(rows.map((row) => row.id)).toEqual(['real']);
    expect(rows[0]?.metricValue).toBe(1200);
  });

  it('derives a hook-rate-vs-average insight line when no awareness data', () => {
    const rows = buildOrganicCreativeRows({
      metric: 'reach',
      posts: [
        post({ id: 'a', reach: 5000, hookRate: 40 }),
        post({ id: 'b', reach: 3000, hookRate: 20 }),
      ],
    });
    // account avg hook rate = 30; post a = 40 → +33% vs average.
    expect(rows[0]?.id).toBe('a');
    expect(rows[0]?.hookRate).toBe(40);
    expect(rows[0]?.insightLine).toContain('40% hook rate');
    expect(rows[0]?.insightLine).toContain('vs your average');
  });

  it('prefers the awareness hook rate over the client-derived one', () => {
    const byId = new Map<string, number>([['a', 55]]);
    const rows = buildOrganicCreativeRows({
      metric: 'reach',
      posts: [post({ id: 'a', reach: 5000, hookRate: 40 })],
      awarenessHookRateById: byId,
    });
    expect(rows[0]?.hookRate).toBe(55);
    expect(rows[0]?.insightLine).toContain('55% hook rate');
  });

  it('omits the insight line for a post with no hook rate', () => {
    const rows = buildOrganicCreativeRows({
      metric: 'reach',
      posts: [post({ id: 'noreel', reach: 1000 })],
    });
    expect(rows[0]?.hookRate).toBeUndefined();
    expect(rows[0]?.insightLine).toBeUndefined();
  });

  it('carries impressions, views, and comments through from post metrics', () => {
    const rows = buildOrganicCreativeRows({
      metric: 'reach',
      posts: [post({ id: 'a', reach: 5000, impressions: 7000, views: 6200, comments: 18 })],
    });
    expect(rows[0]?.impressions).toBe(7000);
    expect(rows[0]?.views).toBe(6200);
    expect(rows[0]?.comments).toBe(18);
  });

  it('leaves impressions, views, and comments undefined when metrics omit them', () => {
    const rows = buildOrganicCreativeRows({
      metric: 'reach',
      posts: [post({ id: 'a', reach: 5000 })],
    });
    expect(rows[0]?.impressions).toBeUndefined();
    expect(rows[0]?.views).toBeUndefined();
    expect(rows[0]?.comments).toBeUndefined();
  });
});

describe('extractAwarenessHookRates', () => {
  it('reads hook rates from the top_posts block', () => {
    const awareness = {
      windowStart: '2026-06-10',
      windowEnd: '2026-06-17',
      summary: { posts: 12 },
      blocks: [
        { category: 'summary', title: 'Summary', data: {} },
        {
          category: 'top_posts',
          title: 'Top posts',
          data: [
            { id: 'p1', hookRate: 42 },
            { id: 'p2', hookRate: 31 },
          ],
        },
      ],
    } as unknown as OrganicAwarenessReportPayload;

    const map = extractAwarenessHookRates(awareness);
    expect(map.get('p1')).toBe(42);
    expect(map.get('p2')).toBe(31);
  });

  it('returns an empty map when awareness is null', () => {
    expect(extractAwarenessHookRates(null).size).toBe(0);
  });
});
