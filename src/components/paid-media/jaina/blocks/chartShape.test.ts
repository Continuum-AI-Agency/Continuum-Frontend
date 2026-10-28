import { describe, expect, it } from 'bun:test';
import { CHART_CASES } from './chartCases.fixture';
import {
  CHART_MIN_ENTITIES,
  CHART_MIN_POINTS,
  chartHeight,
  chartShapeOf,
  fitTickLabel,
  horizontalChartHeight,
  MAX_TICK_AREA_PX,
  tickAreaHeight,
  tickLineBudget,
  wrapTickLabel,
} from './chartShape';

const rows = (count: number, keys: string[] = ['spend']) =>
  Array.from({ length: count }, (_, index) => ({
    day: `2026-09-${String(index + 1).padStart(2, '0')}`,
    ...Object.fromEntries(keys.map((key) => [key, index])),
  }));
const config = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, { label: key }]));

describe('chartShapeOf — a chart shows a trend or a comparison', () => {
  it('holds the thresholds the design names: a week of points, three entities', () => {
    expect(CHART_MIN_POINTS).toBe(7);
    expect(CHART_MIN_ENTITIES).toBe(3);
  });

  it('degrades a three-point line to tiles and keeps a seven-point one', () => {
    const three = chartShapeOf({
      chart_type: 'line',
      data: rows(3),
      chart_config: config(['spend']),
    });
    expect(three).toEqual({ points: 3, entities: 1, earnsChart: false });
    const seven = chartShapeOf({
      chart_type: 'line',
      data: rows(7),
      chart_config: config(['spend']),
    });
    expect(seven).toEqual({ points: 7, entities: 1, earnsChart: true });
  });

  it('counts a temporal chart’s entities as its series', () => {
    const shape = chartShapeOf({
      chart_type: 'area',
      data: rows(3, ['a', 'b', 'c']),
      chart_config: config(['a', 'b', 'c']),
    });
    expect(shape).toEqual({ points: 3, entities: 3, earnsChart: true });
  });

  it('counts a categorical chart’s entities as its rows', () => {
    const two = chartShapeOf({ chart_type: 'bar', data: rows(2), chart_config: config(['spend']) });
    expect(two).toEqual({ points: 2, entities: 2, earnsChart: false });
    const three = chartShapeOf({
      chart_type: 'bar',
      data: rows(3),
      chart_config: config(['spend']),
    });
    expect(three.earnsChart).toBe(true);
    const pie = chartShapeOf({ chart_type: 'pie', data: rows(2), chart_config: {} });
    expect(pie.earnsChart).toBe(false);
  });

  it('counts a stacked bar as rows or series, whichever is more: two periods by four platforms is a chart', () => {
    const case11 = CHART_CASES.find((entry) => entry.id === 'case-11')?.block;
    if (!case11) throw new Error('case-11 is missing');
    expect(chartShapeOf(case11)).toEqual({ points: 2, entities: 4, earnsChart: true });
    const pair = chartShapeOf({
      chart_type: 'stacked_bar',
      data: rows(2, ['a', 'b']),
      chart_config: config(['a', 'b']),
    });
    expect(pair).toEqual({ points: 2, entities: 2, earnsChart: false });
  });

  it('counts a waterfall’s causes and its two totals, and a funnel’s stages, as entities', () => {
    const oneCause = {
      chart_type: 'waterfall' as const,
      data: rows(1),
      chart_config: config(['spend']),
    };
    expect(chartShapeOf(oneCause)).toEqual({ points: 1, entities: 1, earnsChart: false });
    const withTotals = chartShapeOf({
      ...oneCause,
      start: { label: 'Before', value: 10 },
      end: { label: 'After', value: 10 },
    });
    expect(withTotals).toEqual({ points: 1, entities: 3, earnsChart: true });
    const funnel = chartShapeOf({
      chart_type: 'funnel',
      data: rows(3),
      chart_config: config(['spend']),
    });
    expect(funnel).toEqual({ points: 3, entities: 3, earnsChart: true });
  });

  it('draws every §12 chart case as a chart', () => {
    for (const { id, block } of CHART_CASES) {
      expect(chartShapeOf(block).earnsChart, id).toBe(true);
    }
  });
});

describe('the chart is as tall as its ticks need, not 380px', () => {
  it('wraps a category at a narrower width when asked', () => {
    expect(wrapTickLabel('PROVIDENCIA // MENSAJES', 16)).toEqual(['PROVIDENCIA //', 'MENSAJES']);
  });

  it('grows a chart on its side with its rows and its bars per row', () => {
    expect(horizontalChartHeight(4, 1)).toBe(40 + 4 * 48);
    expect(horizontalChartHeight(5, 3)).toBe(40 + 5 * 66);
  });

  it('wraps a category on word boundaries at 18 characters', () => {
    expect(wrapTickLabel('Family lunch')).toEqual(['Family lunch']);
    expect(wrapTickLabel('Product quality and transparent pricing')).toEqual([
      'Product quality',
      'and transparent',
      'pricing',
    ]);
  });

  it('sizes the axis area to the tallest wrapped tick, capped', () => {
    expect(tickAreaHeight(['2026-09-01', '2026-09-02'])).toBe(31);
    expect(tickAreaHeight(['Product quality and transparent pricing'])).toBe(61);
    expect(tickAreaHeight(['a '.repeat(80)])).toBe(MAX_TICK_AREA_PX);
  });

  it('is a 240px plot plus that area', () => {
    expect(chartHeight(['2026-09-01'])).toBe(271);
    expect(chartHeight(['2026-09-01'])).toBeLessThan(380);
  });
});

describe('fitTickLabel — a category under its bar fits the band it has', () => {
  it('prints at a wide band exactly what wrapTickLabel does', () => {
    for (const name of ['Semana pasada', 'Product quality and transparent pricing', 'CPM']) {
      expect(fitTickLabel(name, 200, 6)).toEqual(wrapTickLabel(name));
    }
  });

  it('wraps to a narrow band and cuts a word wider than it, at 375px', () => {
    expect(fitTickLabel('Tasa de conversación', 49, 2)).toEqual(['Tasa de', 'conver…']);
  });

  it('cuts a name longer than its lines on the last one', () => {
    expect(fitTickLabel('Mezcla de campañas', 49, 2)).toEqual(['Mezcla', 'de…']);
    expect(fitTickLabel('Mezcla de campañas', 49, 3)).toEqual(['Mezcla', 'de', 'campañ…']);
  });
});

describe('tickLineBudget — lines a tick may take', () => {
  it('gives entities two lines to wrap onto, and dates only what they need', () => {
    expect(tickLineBudget(['CPM', 'CTR'], true)).toBe(2);
    expect(tickLineBudget(['CPM', 'CTR'])).toBe(1);
    expect(tickLineBudget(['Product quality and transparent pricing'], true)).toBe(3);
  });

  it('sizes the axis area for those lines', () => {
    expect(tickAreaHeight(['CPM', 'CTR'], true)).toBe(46);
    expect(tickAreaHeight(['CPM', 'CTR'])).toBe(31);
  });
});
