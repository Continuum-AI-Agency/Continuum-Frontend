import { describe, expect, it } from 'bun:test';

import type { OrganicPost } from '@/lib/schemas/organicMetrics';
import {
  buildDateAlignedSeries,
  calculateHookRate,
  countNumericTrendPoints,
  dayOverDayComparisonFromTrends,
  enumerateDates,
  filterPostsByYoutubeType,
  formatWatchTime,
  isTrendKeyGraphable,
  isYouTubeShort,
  latestNumericDate,
  MIN_GRAPHABLE_TREND_POINTS,
  normalizeDailyBreakdown,
  POST_GALLERY_MAX_DAYS,
  postPeriodComparisons,
  postWindowDays,
  postWindowRange,
  resolveReportViewState,
  summarizeYoutubeTypeMetrics,
  trendLineShape,
  windowEndingOn,
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

describe('trendLineShape', () => {
  it('keeps a sparse series straight and marks every real point', () => {
    expect(trendLineShape(2)).toEqual({ curve: 'linear', showDots: true });
    expect(trendLineShape(1)).toEqual({ curve: 'linear', showDots: true });
    expect(trendLineShape(0)).toEqual({ curve: 'linear', showDots: true });
  });

  it('smooths only once the series carries enough points to imply a shape', () => {
    expect(trendLineShape(MIN_GRAPHABLE_TREND_POINTS)).toEqual({
      curve: 'monotone',
      showDots: false,
    });
    expect(trendLineShape(12)).toEqual({ curve: 'monotone', showDots: false });
  });

  it('honors a custom threshold', () => {
    expect(trendLineShape(2, 2)).toEqual({ curve: 'monotone', showDots: false });
  });
});

describe('trendLineShape applied to a 2-point series via the graphable gate', () => {
  const twoPoints = [
    { date: '2026-07-24', reach: 40 },
    { date: '2026-07-25', reach: 10 },
  ];

  it('a 2-point reach series is not smoothed — spline would invent a bell curve', () => {
    expect(isTrendKeyGraphable(twoPoints, 'reach')).toBe(false);
    const shape = trendLineShape(countNumericTrendPoints(twoPoints, 'reach'));
    expect(shape.curve).toBe('linear');
    expect(shape.showDots).toBe(true);
  });
});

describe('enumerateDates', () => {
  it('lists every calendar day in the window, inclusive of both ends', () => {
    expect(enumerateDates('2026-07-20', '2026-07-23')).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
    ]);
  });

  it('returns the single day when both ends match', () => {
    expect(enumerateDates('2026-07-20', '2026-07-20')).toEqual(['2026-07-20']);
  });

  it('crosses month and year boundaries', () => {
    expect(enumerateDates('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('returns nothing for an inverted or unparseable window', () => {
    expect(enumerateDates('2026-07-23', '2026-07-20')).toEqual([]);
    expect(enumerateDates('', '2026-07-20')).toEqual([]);
  });
});

describe('windowEndingOn', () => {
  it('derives the window from the range end, not from today', () => {
    expect(windowEndingOn('2026-07-25', 7)).toEqual({
      since: '2026-07-19',
      until: '2026-07-25',
    });
  });

  it('derives a 30-day window the same way', () => {
    expect(windowEndingOn('2026-07-25', 30)).toEqual({
      since: '2026-06-26',
      until: '2026-07-25',
    });
  });
});

describe('buildDateAlignedSeries', () => {
  // Two metrics whose newest reported day differs. Positional slicing gave each
  // its own axis (19-25 vs 20-26 July under one shared label); date alignment
  // must give both the identical axis and show the shortfall as a gap.
  const trends = [
    { date: '2026-07-23', reach: 100, views: 900, boosted: false },
    { date: '2026-07-25', reach: 120, views: 950, boosted: true },
    { date: '2026-07-26', views: 980, boosted: false },
  ];

  it('spans every day of the window regardless of how many points a metric has', () => {
    const reach = buildDateAlignedSeries({
      trends,
      trendKey: 'reach',
      since: '2026-07-23',
      until: '2026-07-26',
    });
    const views = buildDateAlignedSeries({
      trends,
      trendKey: 'views',
      since: '2026-07-23',
      until: '2026-07-26',
    });

    expect(reach.map((point) => point.date)).toEqual(views.map((point) => point.date));
    expect(reach.map((point) => point.date)).toEqual([
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
    ]);
  });

  it('leaves an unreported day as a gap instead of plotting it as zero', () => {
    const reach = buildDateAlignedSeries({
      trends,
      trendKey: 'reach',
      since: '2026-07-23',
      until: '2026-07-26',
    });
    expect(reach.map((point) => point.value)).toEqual([100, undefined, 120, undefined]);
  });

  it('carries the boosted flag through on the days that have one', () => {
    const reach = buildDateAlignedSeries({
      trends,
      trendKey: 'reach',
      since: '2026-07-23',
      until: '2026-07-26',
    });
    expect(reach.map((point) => point.boosted)).toEqual([false, false, true, false]);
  });

  it('ignores trend points outside the window', () => {
    const series = buildDateAlignedSeries({
      trends,
      trendKey: 'reach',
      since: '2026-07-25',
      until: '2026-07-26',
    });
    expect(series).toEqual([
      { date: '2026-07-25', value: 120, boosted: true },
      { date: '2026-07-26', value: undefined, boosted: false },
    ]);
  });

  it('returns an empty series for an unmapped trend key', () => {
    expect(
      buildDateAlignedSeries({
        trends,
        trendKey: undefined,
        since: '2026-07-23',
        until: '2026-07-26',
      }),
    ).toEqual([]);
  });
});

describe('latestNumericDate', () => {
  it('names the last day that actually reported a value (the platform lag)', () => {
    expect(
      latestNumericDate([
        { date: '2026-07-24', value: 10 },
        { date: '2026-07-25', value: 12 },
        { date: '2026-07-26', value: undefined },
      ]),
    ).toBe('2026-07-25');
  });

  it('is undefined when nothing reported', () => {
    expect(latestNumericDate([{ date: '2026-07-26', value: undefined }])).toBeUndefined();
    expect(latestNumericDate([])).toBeUndefined();
  });
});

describe('dayOverDayComparisonFromTrends', () => {
  it('compares the two most recent days when they are genuinely adjacent', () => {
    const trends = [
      { date: '2026-07-24', views: 100 },
      { date: '2026-07-25', views: 130 },
    ];
    expect(dayOverDayComparisonFromTrends(trends, 'views')).toEqual({
      current: 130,
      previous: 100,
      percentageChange: 30,
    });
  });

  it('refuses to compare two non-adjacent days that gap filtering made neighbours', () => {
    const trends = [
      { date: '2026-07-18', views: 100 },
      { date: '2026-07-19' },
      { date: '2026-07-25', views: 10 },
    ];
    expect(dayOverDayComparisonFromTrends(trends, 'views')).toBeUndefined();
  });

  it('suppresses the comparison when the prior day was zero (no valid percentage)', () => {
    const trends = [
      { date: '2026-07-24', views: 0 },
      { date: '2026-07-25', views: 10 },
    ];
    expect(dayOverDayComparisonFromTrends(trends, 'views')).toBeUndefined();
  });

  it('needs at least two numeric points and a mapped key', () => {
    expect(dayOverDayComparisonFromTrends([{ date: '2026-07-25', views: 10 }], 'views')).toBeUndefined();
    expect(dayOverDayComparisonFromTrends([{ date: '2026-07-25', views: 10 }], undefined)).toBeUndefined();
  });
});

describe('normalizeDailyBreakdown', () => {
  it('preserves an unreported metric as absent rather than coercing it to zero', () => {
    const points = normalizeDailyBreakdown([
      { date: '2026-07-25', views: 10 },
      { date: '2026-07-26', views: 12, reach: 8 },
    ]);
    expect(points).toEqual([
      {
        date: '2026-07-25',
        reach: undefined,
        views: 10,
        engagement: undefined,
        comments: undefined,
        likes: undefined,
        shares: undefined,
        saved: undefined,
      },
      {
        date: '2026-07-26',
        reach: 8,
        views: 12,
        engagement: undefined,
        comments: undefined,
        likes: undefined,
        shares: undefined,
        saved: undefined,
      },
    ]);
  });

  it('keeps a real zero as a real zero', () => {
    const [point] = normalizeDailyBreakdown([{ date: '2026-07-25', views: 0 }]);
    expect(point?.views).toBe(0);
  });

  it('drops points with no date and sorts ascending', () => {
    const points = normalizeDailyBreakdown([
      { date: '2026-07-26', views: 2 },
      { views: 9 },
      { date: '2026-07-25', views: 1 },
    ]);
    expect(points.map((point) => point.date)).toEqual(['2026-07-25', '2026-07-26']);
  });
});

describe('post gallery window labelling', () => {
  const now = new Date('2026-07-27T12:00:00.000Z');

  it('states the next window in absolute dates, not as a bare day delta', () => {
    // postWindowDays(1) is 23 — a cumulative-depth arithmetic result that reads
    // as a contradiction against the "last 7d" filter. The absolute range does not.
    expect(postWindowDays(1)).toBe(23);
    expect(postWindowRange(1, now)).toEqual({ from: '2026-06-28', to: '2026-07-20' });
  });
});

describe('resolveReportViewState', () => {
  // The bug this encodes: 'idle' means two different things, and the empty state
  // picked the wrong one. With an account selected it means "the load has not
  // started"; only without one does it mean "choose an account".
  it('shows the loading skeleton while idle with an account already selected', () => {
    expect(resolveReportViewState({ status: 'idle', hasAccount: true, hasData: false })).toBe(
      'loading',
    );
  });

  it('asks for an account only when none is selected', () => {
    expect(resolveReportViewState({ status: 'idle', hasAccount: false, hasData: false })).toBe(
      'chooseAccount',
    );
    expect(resolveReportViewState({ status: 'loading', hasAccount: false, hasData: false })).toBe(
      'chooseAccount',
    );
    expect(resolveReportViewState({ status: 'error', hasAccount: false, hasData: false })).toBe(
      'chooseAccount',
    );
  });

  it('shows the skeleton while loading', () => {
    expect(resolveReportViewState({ status: 'loading', hasAccount: true, hasData: false })).toBe(
      'loading',
    );
  });

  it('surfaces an error over stale data', () => {
    expect(resolveReportViewState({ status: 'error', hasAccount: true, hasData: true })).toBe(
      'error',
    );
  });

  it('renders the report once data is assembled', () => {
    expect(resolveReportViewState({ status: 'success', hasAccount: true, hasData: true })).toBe(
      'ready',
    );
  });

  it('keeps the skeleton when the fetch succeeded but data is not assembled yet', () => {
    expect(resolveReportViewState({ status: 'success', hasAccount: true, hasData: false })).toBe(
      'loading',
    );
  });
});
