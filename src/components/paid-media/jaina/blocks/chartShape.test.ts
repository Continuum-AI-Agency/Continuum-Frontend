import { describe, expect, it } from 'bun:test';
import {
  CHART_MIN_ENTITIES,
  CHART_MIN_POINTS,
  chartHeight,
  chartShapeOf,
  MAX_TICK_AREA_PX,
  tickAreaHeight,
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
});

describe('the chart is as tall as its ticks need, not 380px', () => {
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
