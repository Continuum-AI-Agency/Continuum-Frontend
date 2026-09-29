import { describe, expect, it } from 'bun:test';
import {
  type AccountChart,
  type AccountChartShape,
  accountChartSchema,
  CHART_SHAPE_BY_DETECTOR,
  CHART_SHAPE_READING,
  CHART_SHAPES,
  chartAgreesWithImpact,
  chartMarks,
  chartShapeFor,
  headlineAgreesWithChart,
} from './account-chart';
import {
  accountDetectorSchema,
  candidateHeadlineSchema,
  reallocationSaving,
} from './account-strategy';

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

// ---------------------------------------------------------------------------
// The four candidates below are VERBATIM from the live Easy Fit account
// (act_521903353286118, brand 6f597f42…, read of 2026-09-21), captured by running the real
// detectors over the real gathered packet. They are the whole reason this check exists: three
// of them draw the figure they lead with and one does not, and no test written from
// imagination would have produced that mixture.
// ---------------------------------------------------------------------------

const LIVE = {
  portfolio_reallocation: {
    headline: {
      kind: 'efficiency',
      value: 33,
      unit: 'percent',
      label: 'cheaper per result',
      from: 60.85,
      to: 40.56,
    },
    chart: {
      shape: 'transfer',
      unit: 'currency',
      from: { label: 'FORMULARIOS // TODOS', cost_per_result: 60.85, spend_per_day: 226.03 },
      to: { label: 'MENSAJES // TODOS', cost_per_result: 40.56, spend_per_day: 2317.48 },
      movable_per_day: 64.8,
      saving_per_day: 21.61,
    },
  },
  dead_tail: {
    headline: {
      kind: 'avoided',
      value: 69.75,
      unit: 'currency_per_day',
      label: 'a day buying nothing',
      from: null,
      to: null,
    },
    chart: {
      shape: 'interval',
      unit: 'currency',
      estimate: null,
      low: 188.19,
      high: 376.38,
      reference: 35,
      reference_label: 'target',
      at_stake_per_day: 69.75,
      no_results: true,
    },
  },
  post_click: {
    headline: {
      kind: 'efficiency',
      value: 57,
      unit: 'percent',
      label: 'below the median rate',
      from: 11.43,
      to: 26.65,
    },
    chart: {
      shape: 'quadrant',
      x_label: 'click rate %',
      y_label: 'conversion rate %',
      x_split: 0.51,
      y_split: 26.65,
      points: [
        { label: 'CAÑADAS // AGOSTO - BAU', x: 0.8, y: 11.43, weight: 20.06 },
        { label: 'ITESO // AGOSTO - LKL', x: 0.79, y: 16.67, weight: 25.99 },
      ],
      focus_corner: 'x_high_y_low',
    },
  },
  testing_discipline: {
    headline: {
      kind: 'share',
      value: 0,
      unit: 'percent',
      label: 'of spend on anything new',
      from: null,
      to: 10,
    },
    chart: {
      shape: 'share',
      slices: [
        { label: 'Testing', share: 0, value: 0 },
        { label: 'Exploiting', share: 1, value: 2644.69 },
      ],
      focus_label: 'Testing',
      band: { low: 0.1, high: 0.3 },
      band_label: 'a working test budget',
    },
  },
} as const;

/** One minimal chart per shape, so `chartMarks` cannot quietly return nothing for one. */
const SAMPLE_BY_SHAPE: Record<AccountChartShape, AccountChart> = {
  transfer: accountChartSchema.parse(LIVE.portfolio_reallocation.chart),
  interval: accountChartSchema.parse(LIVE.dead_tail.chart),
  quadrant: accountChartSchema.parse(LIVE.post_click.chart),
  share: accountChartSchema.parse(LIVE.testing_discipline.chart),
  threshold: accountChartSchema.parse({
    shape: 'threshold',
    bars: [{ label: 'a', value: 18 }],
    threshold: 50,
    threshold_label: 'learning',
    combined: { label: 'together', value: 62 },
  }),
  rates: accountChartSchema.parse({
    shape: 'rates',
    points: [
      { t: '2026-09-19', a: 3, b: 7 },
      { t: '2026-09-20', a: 4, b: 7 },
    ],
    a_label: 'arrived',
    b_label: 'fatiguing',
  }),
  headroom: accountChartSchema.parse({
    shape: 'headroom',
    gauges: [{ label: 'cost', value: 42, ceiling: 70, good_when_low: true }],
  }),
};

const live = (key: keyof typeof LIVE) => ({
  headline: candidateHeadlineSchema.parse(LIVE[key].headline),
  chart: accountChartSchema.parse(LIVE[key].chart),
});

describe('the message has to agree with the reasoning', () => {
  it('holds when the pair IS the chart — the two bars of a transfer', () => {
    const { headline, chart } = live('portfolio_reallocation');
    expect(chartMarks(chart)).toEqual([60.85, 40.56]);
    expect(headlineAgreesWithChart(headline, chart)).toBe(true);
  });

  it('holds when the pair is a point and the line it is read against', () => {
    // 11.43 is one ad set's conversion rate; 26.65 is the median the quadrant splits on.
    const { headline, chart } = live('post_click');
    expect(headlineAgreesWithChart(headline, chart)).toBe(true);
  });

  it('holds when only one side is declared and it is the band edge', () => {
    const { headline, chart } = live('testing_discipline');
    expect(chartMarks(chart)).toContain(10);
    expect(headlineAgreesWithChart(headline, chart)).toBe(true);
  });

  it('CATCHES the live mismatch: dead_tail leads with money a day and draws a cost band', () => {
    // 69.75 is spend per day across three ad sets. 188.19 → 376.38 is the worst ad set's
    // seven-day spend, doubled. 35 is a cost per RESULT. Three quantities, one card.
    const { headline, chart } = live('dead_tail');
    expect(chartMarks(chart)).toEqual([188.19, 376.38, 35]);
    expect(headlineAgreesWithChart(headline, chart)).toBe(false);
  });

  it('does not let an annotation stand in for a mark', () => {
    // `at_stake_per_day` carries exactly the headline's figure. No renderer draws it, so it
    // cannot be the thing the reader sees agreeing — which is the hole this closes.
    const { chart } = live('dead_tail');
    expect(chart.shape === 'interval' && chart.at_stake_per_day).toBe(69.75);
    expect(chartMarks(chart)).not.toContain(69.75);
  });

  it('recognises a figure across display rounding, and only that far', () => {
    const { chart } = live('post_click');
    const at = (value: number) =>
      headlineAgreesWithChart(
        candidateHeadlineSchema.parse({
          kind: 'efficiency',
          value: 1,
          unit: 'percent',
          label: 'x',
          from: value,
          to: 26.65,
        }),
        chart,
      );
    expect(at(11.4312)).toBe(true);
    expect(at(11.9)).toBe(false);
  });

  it('is silent when there is no second claim to contradict', () => {
    const { headline, chart } = live('dead_tail');
    expect(headlineAgreesWithChart(null, chart)).toBe(true);
    expect(headlineAgreesWithChart(headline, null)).toBe(true);
  });

  it('places marks for every shape, so no shape is silently exempt', () => {
    for (const shape of CHART_SHAPES) {
      const chart = SAMPLE_BY_SHAPE[shape];
      expect(chartMarks(chart).length).toBeGreaterThan(0);
    }
  });
});
