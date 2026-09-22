import { describe, expect, it } from 'bun:test';
import type { BriefCandidate } from '@continuum/contracts';
import { accountChartSchema, chartArgues } from '@continuum/contracts';
import { heroChart, heroChartReading } from './heroChart';
import type { RecapDay } from './recapModel';

const days = (costs: Array<number | null>): RecapDay[] =>
  costs.map((cost, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    spend: cost == null ? 40 : cost * 2,
    results: cost == null ? 0 : 2,
  }));

const cand = (over: Partial<BriefCandidate>): BriefCandidate =>
  ({
    id: 'rec:1',
    module: 'budget',
    kind: 'budget_move',
    trigger: 'solver',
    adset_id: null,
    adset_name: null,
    impact_per_day: 80,
    impact_unit: 'currency',
    results_per_day: null,
    impact_basis: 'two budget moves this cycle',
    reason: null,
    cta: { kind: 'manage', target_id: null },
    ...over,
  }) as BriefCandidate;

describe('heroChart — what it refuses to draw', () => {
  it('draws nothing from a window with fewer than two priceable days', () => {
    expect(
      heroChart({ candidate: cand({}), series: days([12]), target: 10, resultLabel: 'Leads' }),
    ).toBeNull();
    expect(heroChart({ candidate: null, series: [], target: 10, resultLabel: 'Leads' })).toBeNull();
  });

  it('drops days that bought nothing instead of calling them free', () => {
    const chart = heroChart({
      candidate: null,
      series: days([12, null, 14, null, 16]),
      target: 10,
      resultLabel: 'Leads',
    });
    expect(chart?.shape).toBe('rates');
    if (chart?.shape !== 'rates') throw new Error('shape');
    // five days in, three priceable — a zero would have asserted two free days
    expect(chart.points).toHaveLength(3);
    expect(chart.points.every((p) => p.a > 0)).toBe(true);
  });

  it('gives a budget candidate the growth read, never an invented transfer', () => {
    const chart = heroChart({
      candidate: cand({ module: 'budget' }),
      series: days([12, 14, 16]),
      target: 10,
      resultLabel: 'Leads',
    });
    expect(chart?.shape).toBe('rates');
  });
});

describe('heroChart — the candidate’s own argument wins', () => {
  it('draws a pause as an unbounded interval against the target', () => {
    const chart = heroChart({
      candidate: cand({ module: 'pause', impact_per_day: 210, results_per_day: 0 }),
      series: days([12, 14, 16]),
      target: 10,
      resultLabel: 'Leads',
    });
    expect(chart?.shape).toBe('interval');
    if (chart?.shape !== 'interval') throw new Error('shape');
    expect(chart.no_results).toBe(true);
    expect(chart.estimate).toBeNull();
    expect(chart.at_stake_per_day).toBe(210);
    expect(chart.reference).toBe(10);
    // The axis is named by the producer, in the objective's own word, so the view never has
    // to work out what the numbers along it are.
    expect(chart.value_label).toBe('Cost per leads');
  });

  it('names the interval axis the same quantity the growth read names', () => {
    const interval = heroChart({
      candidate: cand({ module: 'pause', impact_per_day: 210, results_per_day: 0 }),
      series: days([12, 14]),
      target: 10,
      resultLabel: 'Conversations',
    });
    const rates = heroChart({
      candidate: null,
      series: days([12, 14]),
      target: 10,
      resultLabel: 'Conversations',
    });
    if (interval?.shape !== 'interval' || rates?.shape !== 'rates') throw new Error('shape');
    // Both are a cost per result against the same target. Two names for one quantity is how
    // a reader ends up believing they are looking at two different things.
    expect(interval.value_label).toBe(rates.a_label);
  });

  it('falls back to the growth read for a pause that DID produce results', () => {
    const chart = heroChart({
      candidate: cand({ module: 'pause', impact_per_day: 210, results_per_day: 4 }),
      series: days([12, 14, 16]),
      target: 10,
      resultLabel: 'Leads',
    });
    expect(chart?.shape).toBe('rates');
  });
});

describe('heroChart — it speaks the objective’s own language', () => {
  it('labels the axis with the objective’s result word', () => {
    const chart = heroChart({
      candidate: null,
      series: days([30, 31, 29]),
      target: null,
      resultLabel: 'Conversations',
    });
    if (chart?.shape !== 'rates') throw new Error('shape');
    expect(chart.a_label).toBe('Cost per conversations');
    expect(chart.b_label).toBe('No target set');
  });

  it('carries the recommendation’s money as the gap, when there is one', () => {
    const chart = heroChart({
      candidate: cand({ impact_per_day: 80 }),
      series: days([12, 14]),
      target: 10,
      resultLabel: 'Leads',
    });
    if (chart?.shape !== 'rates') throw new Error('shape');
    expect(chart.gap_per_day).toBe(80);
  });
});

describe('heroChart — every chart it emits is a valid one', () => {
  it('parses against the shared schema, both shapes', () => {
    const rates = heroChart({
      candidate: null,
      series: days([12, 14, 16]),
      target: 10,
      resultLabel: 'Leads',
    });
    const interval = heroChart({
      candidate: cand({ module: 'pause', impact_per_day: 210, results_per_day: 0 }),
      series: days([12, 14]),
      target: 10,
      resultLabel: 'Leads',
    });
    expect(() => accountChartSchema.parse(rates)).not.toThrow();
    expect(() => accountChartSchema.parse(interval)).not.toThrow();
  });

  it('gives a reading line for what it drew, and none for nothing', () => {
    const chart = heroChart({
      candidate: null,
      series: days([12, 14]),
      target: 10,
      resultLabel: 'Leads',
    });
    expect(heroChartReading(chart)).toContain('cost per result');
    expect(heroChartReading(null)).toBeNull();
  });
});

describe('heroChart — the news card draws a chart only when it argues', () => {
  it('emits nothing that does not argue, whatever it is given', () => {
    const cases = [
      heroChart({ candidate: null, series: days([12, 14, 16]), target: 10, resultLabel: 'Leads' }),
      heroChart({
        candidate: cand({ module: 'pause', impact_per_day: 210, results_per_day: 0 }),
        series: days([12, 14]),
        target: 10,
        resultLabel: 'Leads',
      }),
      heroChart({ candidate: cand({}), series: days([12]), target: 10, resultLabel: 'Leads' }),
    ];
    for (const chart of cases) {
      if (chart === null) continue;
      expect(chartArgues(chart)).toBe(true);
    }
    // and the RETURN TYPE says so: heroChart hands back `ArguingChart | null`, so the gate
    // cannot be taken out without the Frontend ceasing to compile.
    expect(cases.filter((c) => c === null)).toHaveLength(1);
  });

  it('refuses the five shapes that only redraw the arithmetic', () => {
    for (const shape of ['transfer', 'threshold', 'share', 'headroom', 'quadrant'] as const) {
      expect(chartArgues({ shape } as never)).toBe(false);
    }
    expect(chartArgues(null)).toBe(false);
    expect(chartArgues(undefined)).toBe(false);
  });
});
