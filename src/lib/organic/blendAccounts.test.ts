import { describe, expect, it } from 'bun:test';
import type { SnapshotAccountResult } from '@/lib/organic/brandOrganicSnapshot';
import {
  blendMetric,
  blendPlatformAccounts,
  blendTrendSeries,
  buildSeriesSet,
  platformBlendKey,
} from './blendAccounts';

function account(
  id: string,
  metrics: Record<string, number>,
  trends: Array<{ date: string; views?: number; reach?: number }>,
  comparison?: Record<string, { current: number; previous: number; percentageChange: number }>,
): SnapshotAccountResult {
  return {
    status: 'ok',
    platform: 'instagram',
    integrationAccountId: id,
    name: id,
    metrics,
    comparison: comparison ?? null,
    trends: trends as SnapshotAccountResult['trends'],
    range: { preset: 'last_7d', since: 'a', until: 'b' },
  };
}

describe('blendMetric', () => {
  it('sums summable totals across three Instagram accounts', () => {
    const accounts = [
      account('a', { views: 100, reach: 80 }, [], {
        views: { current: 100, previous: 50, percentageChange: 100 },
      }),
      account('b', { views: 200, reach: 90 }, [], {
        views: { current: 200, previous: 100, percentageChange: 100 },
      }),
      account('c', { views: 50, reach: 40 }, [], {
        views: { current: 50, previous: 50, percentageChange: 0 },
      }),
    ];
    const result = blendMetric(accounts, 'views');
    expect(result.kind).toBe('sum');
    if (result.kind !== 'sum') return;
    expect(result.total).toBe(350);
    expect(result.comparison?.previous).toBe(200);
    expect(result.comparison?.percentageChange).toBe(75);
  });

  it('returns unsupported for non-summable rates', () => {
    const accounts = [account('a', { hookRate: 40 }, [])];
    expect(blendMetric(accounts, 'hookRate').kind).toBe('unsupported');
  });

  it('is identity for a single account', () => {
    const accounts = [account('a', { views: 42 }, [{ date: '2026-07-01', views: 10 }])];
    const result = blendMetric(accounts, 'views');
    expect(result.kind).toBe('sum');
    if (result.kind !== 'sum') return;
    expect(result.total).toBe(42);
  });
});

describe('blendTrendSeries', () => {
  it('sums daily values and fills holes with zero contribution', () => {
    const accounts = [
      account('a', { views: 0 }, [
        { date: '2026-07-01', views: 10 },
        { date: '2026-07-02', views: 20 },
      ]),
      account('b', { views: 0 }, [
        { date: '2026-07-02', views: 5 },
        { date: '2026-07-03', views: 7 },
      ]),
    ];
    const trends = blendTrendSeries(accounts, 'views');
    expect(trends).toEqual([
      { date: '2026-07-01', value: 10 },
      { date: '2026-07-02', value: 25 },
      { date: '2026-07-03', value: 7 },
    ]);
  });
});

describe('buildSeriesSet', () => {
  const accounts = [
    account('a', { views: 100 }, [
      { date: '2026-07-01', views: 10 },
      { date: '2026-07-02', views: 20 },
    ]),
    account('b', { views: 50 }, [
      { date: '2026-07-01', views: 5 },
      { date: '2026-07-02', views: 15 },
    ]),
  ];

  it('decompose yields one series per account', () => {
    const { series } = buildSeriesSet({ accounts, metricId: 'views', mode: 'decompose' });
    expect(series.every((s) => s.kind === 'account')).toBe(true);
    expect(series).toHaveLength(2);
    expect(series.every((s) => !s.dashed)).toBe(true);
  });

  it('blend yields platform blend series', () => {
    const { series, chartRows } = buildSeriesSet({
      accounts,
      metricId: 'views',
      mode: 'blend',
    });
    expect(series.some((s) => s.kind === 'platform_blend')).toBe(true);
    expect(series.every((s) => s.dashed)).toBe(true);
    const key = platformBlendKey('instagram');
    const day2 = chartRows.find((r) => r.date === '2026-07-02');
    expect(day2?.[key]).toBe(35);
  });

  it('both includes account lines and platform blend when multi-account', () => {
    const { series } = buildSeriesSet({ accounts, metricId: 'views', mode: 'both' });
    expect(series.filter((s) => s.kind === 'account')).toHaveLength(2);
    expect(series.filter((s) => s.kind === 'platform_blend')).toHaveLength(1);
  });

  it('single account still yields series in blend mode (identity)', () => {
    const one = [accounts[0]!];
    const { series: decompose } = buildSeriesSet({
      accounts: one,
      metricId: 'views',
      mode: 'decompose',
    });
    const { series: blend } = buildSeriesSet({ accounts: one, metricId: 'views', mode: 'blend' });
    expect(decompose).toHaveLength(1);
    expect(decompose[0]?.kind).toBe('account');
    // Platform blend + selection blend identity for the one account
    expect(blend.length).toBeGreaterThanOrEqual(1);
    expect(blend.every((s) => s.kind === 'platform_blend' || s.kind === 'selection_blend')).toBe(
      true,
    );
    expect(blend[0]?.points[0]?.value).toBe(decompose[0]?.points[0]?.value);
  });
});

describe('blendPlatformAccounts', () => {
  it('blends only same-platform accounts when mixed input sneaks in', () => {
    const ig = account('a', { views: 10 }, []);
    const tt: SnapshotAccountResult = {
      ...account('t', { views: 100 }, []),
      platform: 'tiktok',
      integrationAccountId: 't',
      name: 't',
    };
    const result = blendPlatformAccounts([ig, tt], 'views');
    expect(result.kind).toBe('sum');
    if (result.kind !== 'sum') return;
    // First platform is instagram — only IG contributes
    expect(result.total).toBe(10);
  });
});
