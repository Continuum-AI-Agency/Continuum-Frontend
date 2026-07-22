import { describe, expect, it } from 'bun:test';

import type { OrganicMetrics, OrganicPost, OrganicTrendPoint } from '@/lib/schemas/organicMetrics';
import {
  buildOrganicReportCsv,
  countPostsWithoutInsights,
  summarizePostWindowBreakdown,
  summarizeReelsWatchTime,
} from './organic-report-utils';

const accountMetrics: OrganicMetrics = { reach: 1000, views: 5000 };

const trends: OrganicTrendPoint[] = [
  { date: '2026-06-02', reach: 100, views: 400, reelsViews: 200, comments: 5 },
  { date: '2026-06-03', reach: 120, views: 420, reelsViews: 210, comments: 6 },
];

function reel(id: string, metrics: OrganicPost['metrics'], timestamp: string): OrganicPost {
  return { id, mediaProductType: 'REELS', timestamp, metrics } as OrganicPost;
}

describe('buildOrganicReportCsv', () => {
  it('renders an account 7-day daily breakdown from trends', () => {
    const csv = buildOrganicReportCsv({
      platform: 'instagram',
      accountName: 'Acme',
      generatedAt: '2026-06-09',
      accountRangeSince: '2026-05-10',
      accountRangeUntil: '2026-06-09',
      accountMetrics,
      posts: [],
      trends,
    });
    expect(csv).toContain('Account 7-Day Daily Breakdown');
    expect(csv).toContain('2026-06-02');
    expect(csv).toContain('Avg Watch Time (s)');
  });

  it('writes watch-time seconds for a reel row', () => {
    const csv = buildOrganicReportCsv({
      platform: 'instagram',
      accountName: 'Acme',
      generatedAt: '2026-06-09',
      accountRangeSince: '2026-05-10',
      accountRangeUntil: '2026-06-09',
      accountMetrics,
      posts: [
        reel(
          'r1',
          { reach: 10, views: 50, reelsAvgWatchTime: 4200, reelsVideoViewTotalTime: 600000 },
          '2026-06-08T00:00:00Z',
        ),
      ],
    });
    // 4200ms -> 4s, 600000ms -> 600s
    expect(csv).toContain(',4,600,');
  });

  it('reports a footer count of posts with no insights', () => {
    const csv = buildOrganicReportCsv({
      platform: 'instagram',
      accountName: 'Acme',
      generatedAt: '2026-06-09',
      accountRangeSince: '2026-05-10',
      accountRangeUntil: '2026-06-09',
      accountMetrics,
      posts: [reel('z1', { reach: 0, views: 0 }, '2026-06-08T00:00:00Z')],
    });
    expect(csv).toContain('Posts with no insights available,1');
  });
});

describe('summarizeReelsWatchTime', () => {
  it('sums total and averages avg watch time for reels in the last 7 days', () => {
    const now = new Date('2026-06-09T00:00:00Z');
    const summary = summarizeReelsWatchTime(
      [
        reel(
          'a',
          { reelsAvgWatchTime: 4000, reelsVideoViewTotalTime: 100000 },
          '2026-06-08T00:00:00Z',
        ),
        reel(
          'b',
          { reelsAvgWatchTime: 2000, reelsVideoViewTotalTime: 50000 },
          '2026-06-07T00:00:00Z',
        ),
        reel(
          'old',
          { reelsAvgWatchTime: 9000, reelsVideoViewTotalTime: 999999 },
          '2026-01-01T00:00:00Z',
        ),
      ],
      now,
    );
    expect(summary.count).toBe(2);
    expect(summary.totalWatchMs).toBe(150000);
    expect(summary.avgWatchMs).toBe(3000);
  });
});

describe('summarizePostWindowBreakdown', () => {
  it('never silently substitutes the lifetime total under a windowed label when breakdown data is empty', () => {
    // No breakdown7d/24h/30d at all, but a real lifetime total — the windows
    // must read as zero, not mislabel the all-time figure as a 7d/24h/30d one.
    const post = reel(
      'no-breakdown',
      { reach: 5000, views: 9000, totalInteractions: 400, comments: 30 },
      '2026-06-08T00:00:00Z',
    );
    const windows = summarizePostWindowBreakdown(post);
    expect(windows.window24h).toEqual({ views: 0, reach: 0, engagement: 0, comments: 0 });
    expect(windows.window7d).toEqual({ views: 0, reach: 0, engagement: 0, comments: 0 });
    expect(windows.window30d).toEqual({ views: 0, reach: 0, engagement: 0, comments: 0 });
  });

  it('sums real breakdown points when they exist, never falling back to lifetime', () => {
    const post = {
      id: 'p1',
      metrics: { reach: 99999, views: 99999, totalInteractions: 99999, comments: 99999 },
      breakdown7d: [
        { date: '2026-06-07', reach: 10, views: 20, engagement: 1, comments: 0 },
        { date: '2026-06-08', reach: 15, views: 25, engagement: 2, comments: 1 },
      ],
    } as OrganicPost;
    const windows = summarizePostWindowBreakdown(post);
    expect(windows.window7d).toEqual({ views: 45, reach: 25, engagement: 3, comments: 1 });
  });
});

describe('countPostsWithoutInsights', () => {
  it('counts only all-zero posts', () => {
    const posts = [
      reel('good', { reach: 100, views: 200 }, '2026-06-08T00:00:00Z'),
      reel('empty', { reach: 0, views: 0 }, '2026-06-08T00:00:00Z'),
    ];
    expect(countPostsWithoutInsights(posts)).toBe(1);
  });
});
