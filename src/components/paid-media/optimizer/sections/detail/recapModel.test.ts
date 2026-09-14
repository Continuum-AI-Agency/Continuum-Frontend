import { describe, expect, it } from 'bun:test';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { resolveRange } from './rangeModel';
import { buildRecap } from './recapModel';

const TODAY = '2026-09-11';
const lead = getOptimizationMetricDefinition('lead');
const awareness = getOptimizationMetricDefinition('awareness');

function day(date: string, spend: number, leads: number, impressions = 1000, clicks = 10) {
  return { date, spend, leads, impressions, clicks };
}

describe('buildRecap', () => {
  it('sums the daily series inside the range and the prior window for deltas', () => {
    const range = resolveRange({ kind: 'preset', preset: 'd3' }, null, TODAY); // 09-09..09-11
    const snapshots = [
      {
        id: 'a',
        daily: [
          day('2026-09-06', 100, 5),
          day('2026-09-07', 100, 5),
          day('2026-09-08', 100, 5),
          day('2026-09-09', 200, 4),
          day('2026-09-10', 200, 4),
          day('2026-09-11', 200, 2),
        ],
      },
      { id: 'not-enrolled', daily: [day('2026-09-10', 9999, 99)] },
    ];
    const recap = buildRecap({ snapshots, enrolledIds: ['a'], range, metric: lead, target: 50 });
    expect(recap.source).toBe('daily');
    expect(recap.current.spend).toBe(600);
    expect(recap.current.results).toBe(10);
    expect(recap.current.costPerResult).toBe(60);
    expect(recap.previous?.spend).toBe(300);
    expect(recap.previous?.results).toBe(15);
    expect(recap.previous?.costPerResult).toBe(20);
    expect(recap.delta.spend).toBeCloseTo(1, 6);
    expect(recap.delta.results).toBeCloseTo(-1 / 3, 6);
    expect(recap.delta.costPerResult).toBeCloseTo(2, 6);
    expect(recap.vsTarget).toBeCloseTo(0.2, 6);
    expect(recap.series.map((d) => d.spend)).toEqual([200, 200, 200]);
    expect(recap.current.daysCovered).toBe(3);
  });

  it('fills gaps in the series with zero days so sparklines keep their time axis', () => {
    const range = resolveRange({ kind: 'preset', preset: 'd3' }, null, TODAY);
    const recap = buildRecap({
      snapshots: [{ id: 'a', daily: [day('2026-09-09', 50, 1), day('2026-09-11', 50, 1)] }],
      enrolledIds: ['a'],
      range,
      metric: lead,
      target: null,
    });
    expect(recap.series.map((d) => d.spend)).toEqual([50, 0, 50]);
    expect(recap.delta.spend).toBeNull();
    expect(recap.vsTarget).toBeNull();
  });

  it('prices awareness as CPM through the metric multiplier', () => {
    const range = resolveRange({ kind: 'preset', preset: 'd3' }, null, TODAY);
    const recap = buildRecap({
      snapshots: [
        { id: 'a', daily: [{ date: '2026-09-11', spend: 20, impressions: 4000, clicks: 0 }] },
      ],
      enrolledIds: ['a'],
      range,
      metric: awareness,
      target: 4,
    });
    expect(recap.current.results).toBe(4000);
    expect(recap.current.costPerResult).toBe(5);
    expect(recap.vsTarget).toBeCloseTo(0.25, 6);
  });

  it('falls back to the nearest engine window when no daily series exists, and says which', () => {
    const range = resolveRange({ kind: 'preset', preset: 'd14' }, null, TODAY);
    const recap = buildRecap({
      snapshots: [
        {
          id: 'a',
          windows: {
            d7: { spend: 70, leads: 7, impressions: 700, clicks: 7 },
            d14: { spend: 140, leads: 14, impressions: 1400, clicks: 14 },
          },
        },
      ],
      enrolledIds: ['a'],
      range,
      metric: lead,
      target: 10,
    });
    expect(recap.source).toBe('window');
    expect(recap.windowUsed).toBe('d14');
    expect(recap.current.spend).toBe(140);
    expect(recap.current.costPerResult).toBe(10);
    expect(recap.vsTarget).toBeCloseTo(0, 6);
    expect(recap.previous).toBeNull();
  });

  it('is honestly empty with nothing to sum', () => {
    const range = resolveRange({ kind: 'preset', preset: 'd7' }, null, TODAY);
    const recap = buildRecap({
      snapshots: [],
      enrolledIds: ['a'],
      range,
      metric: lead,
      target: 10,
    });
    expect(recap.source).toBe('none');
    expect(recap.current.spend).toBe(0);
    expect(recap.current.costPerResult).toBeNull();
  });
});
