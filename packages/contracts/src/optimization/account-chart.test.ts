import { describe, expect, it } from 'bun:test';
import {
  accountChartSchema,
  CHART_SHAPE_BY_DETECTOR,
  CHART_SHAPE_READING,
  CHART_SHAPES,
  chartAgreesWithImpact,
  chartShapeFor,
} from './account-chart';
import { accountDetectorSchema, reallocationSaving } from './account-strategy';

describe('one shape per detector', () => {
  it('gives all 25 detectors a shape, and uses every shape it declares', () => {
    const detectors = accountDetectorSchema.options;
    for (const detector of detectors) {
      expect(CHART_SHAPES).toContain(CHART_SHAPE_BY_DETECTOR[detector]);
    }
    const used = new Set(detectors.map((d) => CHART_SHAPE_BY_DETECTOR[d]));
    // A declared shape nothing uses is a shape nobody maintains.
    expect([...used].sort()).toEqual([...CHART_SHAPES].sort());
  });

  it('draws the five detectors that share one formula the same way', () => {
    // They are the same arithmetic on different axes, so they are the same picture.
    for (const detector of [
      'portfolio_reallocation',
      'placement_mix',
      'format_gap',
      'market_allocation',
      'optimization_event',
    ] as const) {
      expect(chartShapeFor(detector)).toBe('transfer');
    }
  });

  it('says in one line what each shape is showing', () => {
    for (const shape of CHART_SHAPES) {
      expect(CHART_SHAPE_READING[shape].length).toBeGreaterThan(10);
    }
  });
});

describe('the picture cannot contradict the sentence', () => {
  const transfer = (over: Record<string, unknown> = {}) =>
    accountChartSchema.parse({
      shape: 'transfer',
      from: { label: 'Prospecting', cost_per_result: 80, spend_per_day: 900 },
      to: { label: 'Retargeting', cost_per_result: 60, spend_per_day: 300 },
      movable_per_day: 400,
      saving_per_day: 100,
      ...over,
    });

  it('accepts a transfer whose saving follows from its own costs', () => {
    const chart = transfer();
    // The same number the detector's own helper computes.
    expect(
      reallocationSaving({ moved: 400, sourceCostPerResult: 80, destinationCostPerResult: 60 }),
    ).toBe(100);
    expect(chartAgreesWithImpact(chart, 100)).toBe(true);
  });

  it('rejects a transfer drawn with costs that do not produce its saving', () => {
    // The card would say $100/day while the columns show a $40 difference.
    expect(chartAgreesWithImpact(transfer({ saving_per_day: 40 }), 40)).toBe(false);
  });

  it('rejects a chart that disagrees with the impact the card shows', () => {
    expect(chartAgreesWithImpact(transfer(), 250)).toBe(false);
  });

  it('rejects a transfer with nothing movable or a missing cost', () => {
    expect(chartAgreesWithImpact(transfer({ movable_per_day: 0 }), 0)).toBe(false);
    expect(
      chartAgreesWithImpact(
        transfer({ from: { label: 'Prospecting', cost_per_result: 0, spend_per_day: 900 } }),
        100,
      ),
    ).toBe(false);
  });

  it('leaves the other shapes to their own validators', () => {
    const interval = accountChartSchema.parse({
      shape: 'interval',
      estimate: null,
      low: 40,
      high: 900,
      reference: 70,
      reference_label: 'target',
      at_stake_per_day: 120,
      no_results: true,
    });
    expect(chartAgreesWithImpact(interval, 120)).toBe(true);
  });
});

describe('the shapes parse the data a detector actually emits', () => {
  it('reads a threshold chart where the parts are short and the whole clears', () => {
    const chart = accountChartSchema.parse({
      shape: 'threshold',
      bars: [
        { label: 'Lookalike 1%', value: 18 },
        { label: 'Lookalike 3%', value: 21 },
        { label: 'Interest mix', value: 16 },
      ],
      threshold: 50,
      threshold_label: 'learning',
      combined: { label: 'Combined', value: 55 },
    });
    expect(chart.shape === 'threshold' && chart.combined?.value).toBe(55);
  });

  it('reads a rates chart with a projection that starts where the facts end', () => {
    const chart = accountChartSchema.parse({
      shape: 'rates',
      unit: 'currency',
      points: [
        { t: '2026-09-18', a: 1200, b: 1400 },
        { t: '2026-09-19', a: 1250, b: 1400 },
        { t: '2026-09-20', a: 1180, b: 1400 },
      ],
      a_label: 'spent',
      b_label: 'plan',
      projected_from: '2026-09-20',
      gap_per_day: 220,
    });
    expect(chart.shape === 'rates' && chart.projected_from).toBe('2026-09-20');
  });

  it('refuses a rates chart with a single point, which draws no rate at all', () => {
    expect(() =>
      accountChartSchema.parse({
        shape: 'rates',
        points: [{ t: '2026-09-20', a: 1, b: 2 }],
        a_label: 'a',
        b_label: 'b',
      }),
    ).toThrow();
  });
});
