import { describe, expect, it } from 'bun:test';

import { cpaSeriesTrend } from './__fixtures__/optimizerFixtures';
import type { CpaTrendPoint } from './chartData';
import {
  adSetRoasSeries,
  bindTimelineEvents,
  buildConfidenceRadar,
  buildConversionFunnel,
  buildCpaHeroPoints,
  buildCpaProjection,
  goldilocksZone,
  mergeAdDailyByMetric,
  pacingSnapshot,
  projectionEndpoint,
  roasBreakevenSeries,
  sumFunnelWindow,
  summarizeTimelineEvents,
  timelineEventSummary,
} from './vizData';

function trendPoint(date: string, over: Record<string, number | null>) {
  return {
    date,
    spend: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    cpa: 0,
    roas: 0,
    purchases: 0,
    purchase_value: 0,
    ...over,
  };
}

describe('buildConversionFunnel', () => {
  it('builds the purchase funnel with step conversion % and a heat color per step past the top', () => {
    const stages = buildConversionFunnel(
      { impressions: 10_000, clicks: 500, addToCarts: 100, purchases: 25 },
      'purchase',
    );
    expect(stages.map((s) => s.label)).toEqual([
      'Impressions',
      'Clicks',
      'Add to cart',
      'Purchases',
    ]);
    expect(stages.map((s) => s.value)).toEqual([10_000, 500, 100, 25]);
    // Every stage labels its absolute count on the chart.
    expect(stages.map((s) => s.displayValue)).toEqual(['10,000', '500', '100', '25']);
    // Top stage carries no step rate and no heat color.
    expect(stages[0].stepPct).toBeNull();
    expect(stages[0].color).toBeUndefined();
    // Downstream stages carry the step conversion rate and a heat fill.
    expect(stages[1].stepPct).toBeCloseTo(0.05); // 500 / 10000
    expect(stages[2].stepPct).toBeCloseTo(0.2); // 100 / 500
    expect(stages[3].stepPct).toBeCloseTo(0.25); // 25 / 100
    expect(stages[1].color).toContain('color-mix');
  });

  it('is objective-aware — awareness is impressions → reach', () => {
    const stages = buildConversionFunnel({ impressions: 8000, reach: 6000 }, 'awareness');
    expect(stages.map((s) => s.label)).toEqual(['Impressions', 'Reach']);
    expect(stages[1].displayValue).toBe('6,000');
    expect(stages[1].stepPct).toBeCloseTo(0.75);
  });

  it('renders a zero-upstream stage honestly instead of dividing by zero', () => {
    const stages = buildConversionFunnel(
      { impressions: 0, clicks: 0, addToCarts: 0, purchases: 0 },
      'purchase',
    );
    expect(stages).toHaveLength(4);
    expect(stages[1].stepPct).toBe(0);
    expect(stages[1].displayValue).toBe('0');
  });

  // This used to assert the PURCHASE funnel, which is what the code did and what was wrong:
  // an objective the map had forgotten was drawn an "Add to cart → Purchases" chart of zeros.
  // That is not an absence of data, it is a claim about the business — and six objectives
  // (conversations, link_clicks, thruplays, post_engagement, clicks, custom) were landing on
  // it. Impressions and clicks exist for every objective, so they are the honest floor.
  it('gives an unknown objective the shared floor, never an e-commerce funnel of zeros', () => {
    const stages = buildConversionFunnel({ impressions: 100, clicks: 10 }, 'mystery');
    expect(stages.map((s) => s.label)).toEqual(['Impressions', 'Clicks']);
  });

  it('draws a messaging account the thing it actually buys', () => {
    const stages = buildConversionFunnel(
      { impressions: 1000, clicks: 100, conversations: 12 },
      'conversations',
    );
    expect(stages.map((s) => s.label)).toEqual(['Impressions', 'Clicks', 'Conversations']);
    expect(stages[2].displayValue).toBe('12');
  });
});

describe('buildConfidenceRadar', () => {
  it('scales the 0–1 sub-scores onto the radar 0–100 domain', () => {
    const radar = buildConfidenceRadar({
      score: 0.72,
      predictiveness: 0.88,
      sampleSize: 0.5,
      consistency: 0.61,
      band: 'high',
    });
    expect(radar).not.toBeNull();
    expect(radar?.metrics.map((m) => m.key)).toEqual([
      'predictiveness',
      'sampleSize',
      'consistency',
      'score',
    ]);
    expect(radar?.data[0].values).toEqual({
      predictiveness: 88,
      sampleSize: 50,
      consistency: 61,
      score: 72,
    });
  });

  it('returns null when the run carries no confidence signal at all', () => {
    expect(buildConfidenceRadar(null)).toBeNull();
    expect(buildConfidenceRadar({ band: 'medium' })).toBeNull();
  });
});

describe('roasBreakevenSeries', () => {
  it('shifts ROAS to a P&L number vs the break-even baseline and sorts chronologically', () => {
    const series = roasBreakevenSeries([
      { date: '2026-07-03', roas: 0.8 },
      { date: '2026-07-01', roas: 2.5 },
    ]);
    expect(series.map((p) => p.date.toISOString().slice(0, 10))).toEqual([
      '2026-07-01',
      '2026-07-03',
    ]);
    expect(series[0].pnl).toBeCloseTo(1.5); // 2.5 - 1
    expect(series[1].pnl).toBeCloseTo(-0.2); // 0.8 - 1
  });

  it('honors a custom break-even target', () => {
    const [point] = roasBreakevenSeries([{ date: '2026-07-01', roas: 3 }], 2);
    expect(point.pnl).toBeCloseTo(1); // 3 - 2
  });
});

describe('buildCpaProjection', () => {
  const points: CpaTrendPoint[] = [
    { date: new Date('2026-07-01'), cpa: 20 },
    { date: new Date('2026-07-02'), cpa: 18 },
    { date: new Date('2026-07-03'), cpa: 16 },
  ];

  it('needs at least two points', () => {
    expect(buildCpaProjection([points[0]])).toEqual([]);
  });

  it('extends the recent trend downward when no target is given', () => {
    const projection = buildCpaProjection(points);
    expect(projection.length).toBeGreaterThanOrEqual(2);
    expect(projection[0].value).toBe(16); // anchor = last actual
    expect(projection.at(-1)?.value).toBeLessThan(16); // falling CPA continues down
  });

  it('heads for the target CPA when one is provided', () => {
    const projection = buildCpaProjection(points, { targetCpa: 10 });
    expect(projectionEndpoint(projection)).toBe(10);
  });
});

describe('goldilocksZone', () => {
  it('returns a 0→target band when the portfolio set a positive target', () => {
    expect(goldilocksZone(40)).toEqual({ y1: 0, y2: 40 });
  });

  it('stays null when the target is unset, zero, or non-finite', () => {
    expect(goldilocksZone(null)).toBeNull();
    expect(goldilocksZone(undefined)).toBeNull();
    expect(goldilocksZone(0)).toBeNull();
    expect(goldilocksZone(-12)).toBeNull();
    expect(goldilocksZone(Number.NaN)).toBeNull();
  });
});

describe('pacingSnapshot', () => {
  it('classifies pace from the ratio', () => {
    expect(pacingSnapshot({ pacingRatio: 1.3 }).status).toBe('overpacing');
    expect(pacingSnapshot({ pacingRatio: 0.7 }).status).toBe('underpacing');
    expect(pacingSnapshot({ pacingRatio: 1.0 }).status).toBe('on_track');
    expect(pacingSnapshot({}).status).toBe('unknown');
  });

  it('derives the ratio from actual vs ideal when not given', () => {
    expect(pacingSnapshot({ actualSpendToDate: 500, idealCumulative: 1000 }).ratio).toBeCloseTo(
      0.5,
    );
  });

  it('computes the gauge share of budget and the projected end-of-period spend', () => {
    const snapshot = pacingSnapshot({
      actualSpendToDate: 300,
      periodBudget: 1000,
      dayIndex: 10,
      periodDays: 30,
    });
    expect(snapshot.pctSpent).toBeCloseTo(30);
    expect(snapshot.projectedEndSpend).toBe(900); // (300 / 10) * 30
    // A real period budget is not flagged estimated.
    expect(snapshot.estimated).toBe(false);
    expect(snapshot.periodBudget).toBe(1000);
  });

  it('estimates the period budget from the daily total when none is set (never blanks)', () => {
    const snapshot = pacingSnapshot({
      actualSpendToDate: 1500,
      dailyTotal: 100,
      periodDays: 30,
    });
    // 100 × 30 = 3000 → 1500 is 50% of the estimated budget.
    expect(snapshot.estimated).toBe(true);
    expect(snapshot.periodBudget).toBe(3000);
    expect(snapshot.pctSpent).toBeCloseTo(50);
  });

  it('defaults to a 30-day period when estimating without an explicit periodDays', () => {
    const snapshot = pacingSnapshot({ actualSpendToDate: 300, dailyTotal: 100 });
    expect(snapshot.estimated).toBe(true);
    expect(snapshot.periodBudget).toBe(3000); // 100 × DEFAULT 30
  });

  it('prefers a real period budget over the daily-total estimate', () => {
    const snapshot = pacingSnapshot({ periodBudget: 6000, dailyTotal: 100, periodDays: 30 });
    expect(snapshot.estimated).toBe(false);
    expect(snapshot.periodBudget).toBe(6000);
  });

  it('returns a null budget only when neither a period nor a daily budget is known', () => {
    const snapshot = pacingSnapshot({ actualSpendToDate: 500 });
    expect(snapshot.periodBudget).toBeNull();
    expect(snapshot.pctSpent).toBeNull();
    expect(snapshot.estimated).toBe(false);
  });
});

describe('buildCpaHeroPoints', () => {
  it('enriches each cycle with the spend/conversions behind the CPA and attaches actions by ts', () => {
    const event = {
      ts: '2026-06-22T00:00:00.000Z',
      kind: 'cycle' as const,
      label: 'Reallocated · ↑2 ↓1',
      count: 1,
    };
    const points = buildCpaHeroPoints(cpaSeriesTrend, {
      '2026-06-22T00:00:00.000Z': [event],
    });
    expect(points).toHaveLength(4);
    const last = points.at(-1);
    expect(last?.cpa).toBe(25); // 500 / 20
    expect(last?.spend).toBe(500);
    expect(last?.conv).toBe(20);
    expect(last?.events).toEqual([event]);
    // Earlier cycles carry no events.
    expect(points[0].events).toEqual([]);
  });

  it('uses the supplied multiplier when an objective is priced as CPM', () => {
    const [point] = buildCpaHeroPoints([cpaSeriesTrend[0]], {}, 1_000);
    expect(point?.cpa).toBe(40_000); // $800 / 20 impressions × 1,000
  });
});

describe('bindTimelineEvents', () => {
  const points = [
    { ts: '2026-06-20T06:00:00.000Z' },
    { ts: '2026-06-21T06:00:00.000Z' },
    { ts: '2026-06-22T06:00:00.000Z' },
  ];
  const event = (ts: string, label: string) => ({ ts, kind: 'config' as const, label, count: 1 });

  // Events do not land ON cycle timestamps — a human edits a budget at 14:32, the cycle ran
  // at 06:00 — so an exact-ts join drops nearly all of them.
  it('binds an event to the last cycle at or before it', () => {
    const map = bindTimelineEvents(points, [event('2026-06-21T14:32:00.000Z', 'budget changed')]);
    expect(map['2026-06-21T06:00:00.000Z']?.[0].label).toBe('budget changed');
  });

  it('binds an event landing exactly on a cycle to that cycle', () => {
    const map = bindTimelineEvents(points, [event('2026-06-22T06:00:00.000Z', 'ran')]);
    expect(map['2026-06-22T06:00:00.000Z']).toHaveLength(1);
  });

  // There is no point on the chart such an event could explain.
  it('drops events that precede the first plotted cycle', () => {
    expect(bindTimelineEvents(points, [event('2026-06-01T00:00:00.000Z', 'ancient')])).toEqual({});
  });

  it('groups several events onto the same cycle', () => {
    const map = bindTimelineEvents(points, [
      event('2026-06-22T08:00:00.000Z', 'one'),
      event('2026-06-22T09:00:00.000Z', 'two'),
    ]);
    expect(map['2026-06-22T06:00:00.000Z']).toHaveLength(2);
  });

  it('ignores an unparseable timestamp instead of throwing', () => {
    expect(bindTimelineEvents(points, [event('not-a-date', 'bad')])).toEqual({});
  });

  it('is empty with no points or no events', () => {
    expect(bindTimelineEvents([], [event('2026-06-22T06:00:00.000Z', 'x')])).toEqual({});
    expect(bindTimelineEvents(points, [])).toEqual({});
  });
});

describe('mergeAdDailyByMetric', () => {
  it('pivots per-ad daily series into wide rows keyed by date, one column per ad', () => {
    const trends = [
      {
        ad_id: 'a',
        ad_name: 'A',
        series: [trendPoint('2026-07-01', { spend: 10 }), trendPoint('2026-07-02', { spend: 12 })],
      },
      { ad_id: 'b', ad_name: 'B', series: [trendPoint('2026-07-02', { spend: 5 })] },
    ] as unknown as Parameters<typeof mergeAdDailyByMetric>[0];

    const { rows, adIds } = mergeAdDailyByMetric(trends, 'spend');
    expect(adIds).toEqual(['a', 'b']);
    expect(rows).toHaveLength(2);
    expect(rows[0].a).toBe(10);
    expect(rows[1].a).toBe(12);
    expect(rows[1].b).toBe(5);
  });

  // A day with no conversions has no cost-per-conversion. Zero is not that
  // number — on a "lower is better" axis zero is the BEST possible value, so
  // coercing to it renders a creative that bought nothing as the cheapest one on
  // the chart. Null keeps the day out of the series and the line breaks there.
  it('leaves a null cost-per-event day null rather than plotting it as zero', () => {
    const trends = [
      {
        ad_id: 'a',
        ad_name: null,
        series: [trendPoint('2026-07-01', { cpa: null }), trendPoint('2026-07-02', { cpa: 20 })],
      },
    ] as unknown as Parameters<typeof mergeAdDailyByMetric>[0];

    const { rows } = mergeAdDailyByMetric(trends, 'cpa');
    expect(rows[0].a).toBeNull();
    expect(rows[1].a).toBe(20);
  });

  it('treats a non-finite cost-per-event as absent, not as a plottable number', () => {
    const trends = [
      {
        ad_id: 'a',
        ad_name: null,
        series: [
          trendPoint('2026-07-01', { cpa: Number.POSITIVE_INFINITY }),
          trendPoint('2026-07-02', { cpa: Number.NaN }),
        ],
      },
    ] as unknown as Parameters<typeof mergeAdDailyByMetric>[0];

    const { rows } = mergeAdDailyByMetric(trends, 'cpa');
    expect(rows[0].a).toBeNull();
    expect(rows[1].a).toBeNull();
  });
});

describe('sumFunnelWindow', () => {
  it('sums the 7-day window of only the enrolled ad sets', () => {
    const snapshots = [
      { id: 'enrolled_1', windows: { d7: { impressions: 1000, clicks: 50, purchases: 5 } } },
      { id: 'enrolled_2', windows: { d7: { impressions: 500, clicks: 30, purchases: 3 } } },
      { id: 'not_enrolled', windows: { d7: { impressions: 9999, clicks: 999, purchases: 99 } } },
    ];
    const window = sumFunnelWindow(snapshots, ['enrolled_1', 'enrolled_2']);
    expect(window.impressions).toBe(1500);
    expect(window.clicks).toBe(80);
    expect(window.purchases).toBe(8);
  });
});

describe('adSetRoasSeries', () => {
  it('aggregates per-ad daily trends into one Σvalue/Σspend series per day', () => {
    const trends = [
      {
        ad_id: 'a',
        ad_name: 'A',
        series: [
          trendPoint('2026-07-01', { spend: 100, purchase_value: 250 }),
          trendPoint('2026-07-02', { spend: 50, purchase_value: 40 }),
        ],
      },
      {
        ad_id: 'b',
        ad_name: 'B',
        series: [trendPoint('2026-07-01', { spend: 100, purchase_value: 150 })],
      },
    ] as unknown as Parameters<typeof adSetRoasSeries>[0];

    const series = adSetRoasSeries(trends);
    expect(series.map((p) => p.date)).toEqual(['2026-07-01', '2026-07-02']);
    expect(series[0].roas).toBeCloseTo(2); // (250 + 150) / (100 + 100)
    expect(series[1].roas).toBeCloseTo(0.8); // 40 / 50
  });
});

describe('sumFunnelRange', () => {
  const { sumFunnelRange } = require('./vizData') as typeof import('./vizData');
  const snapshots = [
    {
      id: 'a',
      daily: [
        { date: '2026-09-01', impressions: 100, clicks: 10, leads: 1 },
        { date: '2026-09-02', impressions: 100, clicks: 10, leads: 1 },
        { date: '2026-09-03', impressions: 100, clicks: 10, leads: 1 },
      ],
    },
    { id: 'b', daily: [{ date: '2026-09-02', impressions: 50, clicks: 5, leads: 0 }] },
    {
      id: 'not-enrolled',
      daily: [{ date: '2026-09-02', impressions: 9999, clicks: 999, leads: 99 }],
    },
  ];
  it('sums enrolled ad sets inside the range only', () => {
    const w = sumFunnelRange(snapshots, ['a', 'b'], '2026-09-02', '2026-09-03');
    expect(w).toMatchObject({ impressions: 250, clicks: 25, leads: 2 });
  });
  it('is null when no enrolled snapshot has a daily series', () => {
    expect(sumFunnelRange([{ id: 'a' }], ['a'], '2026-09-01', '2026-09-03')).toBeNull();
  });
});

describe('pacingSnapshot — source', () => {
  it('marks a placeholder-source row estimated even with a budget figure', () => {
    const { pacingSnapshot } = require('./vizData') as typeof import('./vizData');
    const real = pacingSnapshot({ source: 'pacing', periodBudget: 1000, actualSpendToDate: 300 });
    expect(real.estimated).toBe(false);
    const placeholder = pacingSnapshot({
      source: 'observed',
      periodBudget: 1000,
      actualSpendToDate: 300,
    });
    expect(placeholder.estimated).toBe(true);
  });
});

describe('summarizeTimelineEvents', () => {
  const ev = (
    kind: 'cycle' | 'applied' | 'status' | 'config',
    label: string,
    ts: string,
    adset_id: string | null = null,
  ) => ({ ts, kind, label, detail: null, adset_id, count: 1 });

  it('collapses identical events into one row with a count, money moves first', () => {
    const groups = summarizeTimelineEvents([
      ev('cycle', 'Optimizer cycle', '2026-09-17T06:00:00Z'),
      ev('config', 'apply item requested changed', '2026-09-17T12:56:00Z', 'a1'),
      ev('config', 'apply item requested changed', '2026-09-17T13:12:00Z', 'a2'),
      ev('config', 'apply item requested changed', '2026-09-17T13:12:00Z', 'a2'),
      ev('applied', 'Budget applied to 3 ad sets', '2026-09-17T13:20:00Z'),
      ev('config', 'apply mode changed', '2026-09-17T14:00:00Z'),
    ]);
    expect(groups.map((g) => [g.kind, g.label, g.count])).toEqual([
      ['applied', 'Budget applied to 3 ad sets', 1],
      ['config', 'apply item requested changed', 3],
      ['config', 'apply mode changed', 1],
      ['cycle', 'Optimizer cycle', 1],
    ]);
    expect(groups[1].ts).toBe('2026-09-17T13:12:00Z');
    expect(groups[1].adsetIds).toEqual(['a1', 'a2']);
  });

  it('keeps events with different detail apart and honours a pre-aggregated count', () => {
    const groups = summarizeTimelineEvents([
      { ...ev('config', 'max daily minor changed', '2026-09-17T09:00:00Z'), detail: '100 → 200' },
      { ...ev('config', 'max daily minor changed', '2026-09-17T10:00:00Z'), detail: '200 → 300' },
      { ...ev('status', '2 ad sets paused', '2026-09-17T11:00:00Z'), count: 2 },
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0].count).toBe(2);
  });

  it('renders the one-line form with ×N only where it counts', () => {
    const line = timelineEventSummary([
      ev('config', 'apply item requested changed', '2026-09-17T12:56:00Z'),
      ev('config', 'apply item requested changed', '2026-09-17T13:12:00Z'),
      ev('config', 'apply mode changed', '2026-09-17T14:00:00Z'),
    ]);
    expect(line).toBe('apply item requested changed ×2 · apply mode changed');
  });
});
