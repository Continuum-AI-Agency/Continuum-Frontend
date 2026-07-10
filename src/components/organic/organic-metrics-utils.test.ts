import { describe, expect, it } from 'bun:test';

import type { OrganicPost } from '@/lib/schemas/organicMetrics';
import {
  calculateHookRate,
  countNumericTrendPoints,
  filterPostsByYoutubeType,
  formatWatchTime,
  isTrendKeyGraphable,
  isYouTubeShort,
  MIN_GRAPHABLE_TREND_POINTS,
  POST_GALLERY_MAX_DAYS,
  postPeriodComparisons,
  postWindowDays,
  postWindowRange,
  summarizeYoutubeTypeMetrics,
} from './organic-metrics-utils';

function reel(metrics: OrganicPost['metrics']): OrganicPost {
  return { id: 'r1', mediaProductType: 'REELS', metrics } as OrganicPost;
}

describe('calculateHookRate', () => {
  it('returns the native edge-provided hookRate (100 - reels_skip_rate)', () => {
    expect(calculateHookRate(reel({ hookRate: 72 }))).toBe(72);
  });

  it('does NOT derive a watch-time proxy — native skip rate only', () => {
    expect(calculateHookRate(reel({ reelsAvgWatchTime: 1500 }))).toBeUndefined();
    expect(calculateHookRate(reel({ reelsAvgWatchTime: 9000 }))).toBeUndefined();
  });

  it('is undefined for non-reels and for reels without a hook rate', () => {
    expect(
      calculateHookRate({ id: 'p', mediaType: 'IMAGE', metrics: {} } as OrganicPost),
    ).toBeUndefined();
    expect(calculateHookRate(reel({}))).toBeUndefined();
  });
});

describe('formatWatchTime', () => {
  it('formats sub-minute as seconds', () => {
    expect(formatWatchTime(4200)).toBe('4.2s');
  });

  it('formats minutes and hours', () => {
    expect(formatWatchTime(90_000)).toBe('1m 30s');
    expect(formatWatchTime(5_000_000)).toBe('1h 23m');
  });

  it('returns a dash for missing/zero', () => {
    expect(formatWatchTime(0)).toBe('-');
    expect(formatWatchTime(undefined)).toBe('-');
  });
});

describe('postPeriodComparisons', () => {
  // The FE no longer derives comparisons itself — it's a pass-through read of
  // the backend-computed period-over-period field (periodComparisonFromBreakdown
  // in fetch-organic-analytics/lib/post-snapshots.ts). Reach is never a key
  // here: it's a unique-viewer count and can't be validly summed across days.
  it('reads the backend-computed comparison map straight off the post', () => {
    const post = {
      id: 'p1',
      comparison: {
        views: { current: 260, previous: 200, percentageChange: 30 },
        likes: { current: 12, previous: 8, percentageChange: 50 },
      },
    } as unknown as OrganicPost;

    const deltas = postPeriodComparisons(post);
    expect(deltas.views).toEqual({ current: 260, previous: 200, percentageChange: 30 });
    expect(deltas.likes).toEqual({ current: 12, previous: 8, percentageChange: 50 });
  });

  it('returns {} when the post has no comparison yet (insufficient history)', () => {
    expect(postPeriodComparisons({ id: 'x' } as OrganicPost)).toEqual({});
  });

  it('returns {} when comparison is explicitly null', () => {
    expect(postPeriodComparisons({ id: 'x', comparison: null } as unknown as OrganicPost)).toEqual(
      {},
    );
  });

  it('returns {} for a null post', () => {
    expect(postPeriodComparisons(null)).toEqual({});
  });
});

function yt(id: string, mediaProductType: string, metrics?: OrganicPost['metrics']): OrganicPost {
  return { id, mediaType: 'VIDEO', mediaProductType, metrics } as OrganicPost;
}

describe('isYouTubeShort', () => {
  it('is true only when mediaProductType is SHORTS (case-insensitive)', () => {
    expect(isYouTubeShort(yt('a', 'SHORTS'))).toBe(true);
    expect(isYouTubeShort(yt('b', 'shorts'))).toBe(true);
    expect(isYouTubeShort(yt('c', 'VIDEO'))).toBe(false);
    expect(isYouTubeShort({ id: 'd', metrics: {} } as OrganicPost)).toBe(false);
  });
});

describe('filterPostsByYoutubeType', () => {
  const posts = [yt('s1', 'SHORTS'), yt('v1', 'VIDEO'), yt('s2', 'SHORTS')];

  it("returns every post for the 'all' filter", () => {
    expect(filterPostsByYoutubeType(posts, 'all')).toHaveLength(3);
  });

  it('narrows to Shorts only', () => {
    expect(filterPostsByYoutubeType(posts, 'shorts').map((p) => p.id)).toEqual(['s1', 's2']);
  });

  it('narrows to Videos only', () => {
    expect(filterPostsByYoutubeType(posts, 'videos').map((p) => p.id)).toEqual(['v1']);
  });
});

describe('summarizeYoutubeTypeMetrics', () => {
  it('sums counts/views/likes/comments and averages only present hook rates', () => {
    const posts = [
      yt('s1', 'SHORTS', { views: 1000, likes: 100, comments: 10, hookRate: 80 }),
      yt('s2', 'SHORTS', { views: 500, likes: 50, comments: 5, hookRate: 60 }),
      yt('s3', 'SHORTS', { views: 200, likes: 20, comments: 2 }),
    ];
    expect(summarizeYoutubeTypeMetrics(posts)).toEqual({
      count: 3,
      views: 1700,
      likes: 170,
      comments: 17,
      avgHookRate: 70,
    });
  });

  it('reports undefined avgHookRate when no post carries one', () => {
    expect(
      summarizeYoutubeTypeMetrics([yt('v1', 'VIDEO', { views: 10 })]).avgHookRate,
    ).toBeUndefined();
  });

  it('zeroes an empty set', () => {
    expect(summarizeYoutubeTypeMetrics([])).toEqual({
      count: 0,
      views: 0,
      likes: 0,
      comments: 0,
      avgHookRate: undefined,
    });
  });
});

describe('countNumericTrendPoints', () => {
  const trends = [
    { date: '2026-06-01', reach: 100, avgRetentionRate: 42 },
    { date: '2026-06-02', reach: 0 }, // zero is still a real numeric point
    { date: '2026-06-03', reach: 120, avgRetentionRate: 55 },
    { date: '2026-06-04' }, // missing reach
    { date: '2026-06-05', reach: null as unknown as number }, // null is not numeric
  ];

  it('counts only points where the trend key is a number (zero counts)', () => {
    expect(countNumericTrendPoints(trends, 'reach')).toBe(3);
  });

  it('counts a sparse synthesized series correctly', () => {
    expect(countNumericTrendPoints(trends, 'avgRetentionRate')).toBe(2);
  });

  it('returns 0 for an unmapped/undefined trend key', () => {
    expect(countNumericTrendPoints(trends, undefined)).toBe(0);
  });

  it('returns 0 for a key never present on any point', () => {
    expect(countNumericTrendPoints(trends, 'hookRate')).toBe(0);
  });

  it('returns 0 for empty/undefined trends', () => {
    expect(countNumericTrendPoints([], 'reach')).toBe(0);
    expect(countNumericTrendPoints(undefined, 'reach')).toBe(0);
  });
});

describe('isTrendKeyGraphable', () => {
  it('defaults to requiring MIN_GRAPHABLE_TREND_POINTS numeric points', () => {
    expect(MIN_GRAPHABLE_TREND_POINTS).toBe(3);
    const enough = [
      { date: 'a', reach: 1 },
      { date: 'b', reach: 2 },
      { date: 'c', reach: 3 },
    ];
    expect(isTrendKeyGraphable(enough, 'reach')).toBe(true);
  });

  it('is not graphable while a sparse series is still accruing (below threshold)', () => {
    const twoDays = [
      { date: 'a', avgRetentionRate: 40 },
      { date: 'b', avgRetentionRate: 45 },
    ];
    expect(isTrendKeyGraphable(twoDays, 'avgRetentionRate')).toBe(false);
  });

  it('honors a custom minimum', () => {
    const oneDay = [{ date: 'a', avgRetentionRate: 40 }];
    expect(isTrendKeyGraphable(oneDay, 'avgRetentionRate', 1)).toBe(true);
  });

  it('is never graphable for an unmapped key', () => {
    expect(isTrendKeyGraphable([{ date: 'a', reach: 1 }], undefined)).toBe(false);
  });
});

describe('post gallery scroll windows', () => {
  // Fixed so the assertions read as literal dates rather than arithmetic.
  const now = new Date('2026-07-09T12:00:00.000Z');

  it('opens on the last 7 days, inclusive of today', () => {
    expect(postWindowDays(0)).toBe(7);
    expect(postWindowRange(0, now)).toEqual({ from: '2026-07-03', to: '2026-07-09' });
  });

  it('deepens to the rest of the month, then two more months', () => {
    expect(postWindowDays(1)).toBe(23);
    expect(postWindowRange(1, now)).toEqual({ from: '2026-06-10', to: '2026-07-02' });

    expect(postWindowDays(2)).toBe(30);
    expect(postWindowRange(2, now)).toEqual({ from: '2026-05-11', to: '2026-06-09' });

    expect(postWindowDays(3)).toBe(30);
    expect(postWindowRange(3, now)).toEqual({ from: '2026-04-11', to: '2026-05-10' });
  });

  it('ends the feed past the history cap', () => {
    expect(postWindowDays(4)).toBeNull();
    expect(postWindowRange(4, now)).toBeNull();
    expect(postWindowRange(-1, now)).toBeNull();
  });

  it('tiles the history with no overlap and no skipped day', () => {
    const windows = [0, 1, 2, 3].map((offset) => postWindowRange(offset, now));
    for (const window of windows) expect(window).not.toBeNull();

    // Each deeper window must end exactly the day before the shallower one starts.
    for (let offset = 1; offset < windows.length; offset += 1) {
      const shallower = windows[offset - 1]!;
      const deeper = windows[offset]!;
      const dayBeforeShallower = new Date(`${shallower.from}T00:00:00.000Z`);
      dayBeforeShallower.setUTCDate(dayBeforeShallower.getUTCDate() - 1);
      expect(deeper.to).toBe(dayBeforeShallower.toISOString().slice(0, 10));
    }

    // The deepest window reaches exactly the documented cap.
    const oldest = new Date(now);
    oldest.setUTCDate(oldest.getUTCDate() - (POST_GALLERY_MAX_DAYS - 1));
    expect(windows[windows.length - 1]!.from).toBe(oldest.toISOString().slice(0, 10));
  });

  it('sums the tiers to the history cap', () => {
    const total = [0, 1, 2, 3].reduce((sum, offset) => sum + (postWindowDays(offset) ?? 0), 0);
    expect(total).toBe(POST_GALLERY_MAX_DAYS);
  });
});
