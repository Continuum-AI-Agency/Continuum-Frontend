import { describe, expect, it } from 'bun:test';
import { curveLinear } from 'd3-shape';

import {
  computeSeriesPathPoints,
  interpolateSeriesPathPoints,
  seriesPathFromPoints,
} from './series-path-utils';

// A row that carries no numeric value for a series is a GAP. The y fallback for
// such a row is pixel 0, which in SVG is the TOP of the plot — the highest value
// on the chart. So without an explicit `defined` flag, a missing day renders as a
// peak, and on a cost-per-result chart an absence of results reads as the best
// day in the window. These tests pin the flag, not the pixel math.

const xAccessor = (datum: Record<string, unknown>) => datum.date as Date;
const xScale = (value: Date) => value.getTime() / 1000;
const yScale = (value: number) => 100 - value;

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('computeSeriesPathPoints', () => {
  it('marks numeric rows defined and non-numeric rows undefined', () => {
    const points = computeSeriesPathPoints(
      [
        { date: day('2026-07-01'), cpa: 20 },
        { date: day('2026-07-02'), cpa: null },
        { date: day('2026-07-03'), cpa: 40 },
      ],
      xAccessor,
      xScale,
      yScale,
      'cpa',
    );

    expect(points.map((point) => point.defined)).toEqual([true, false, true]);
  });

  it('treats NaN and Infinity as absent rather than as coordinates', () => {
    const points = computeSeriesPathPoints(
      [
        { date: day('2026-07-01'), cpa: Number.NaN },
        { date: day('2026-07-02'), cpa: Number.POSITIVE_INFINITY },
      ],
      xAccessor,
      xScale,
      yScale,
      'cpa',
    );

    expect(points.every((point) => point.defined)).toBe(false);
  });

  it('marks a row defined when the value is a legitimate zero', () => {
    const points = computeSeriesPathPoints(
      [{ date: day('2026-07-01'), spend: 0 }],
      xAccessor,
      xScale,
      yScale,
      'spend',
    );

    expect(points[0].defined).toBe(true);
  });
});

describe('seriesPathFromPoints', () => {
  it('breaks the path at an undefined point instead of drawing through it', () => {
    const points = computeSeriesPathPoints(
      [
        { date: day('2026-07-01'), cpa: 20 },
        { date: day('2026-07-02'), cpa: null },
        { date: day('2026-07-03'), cpa: 40 },
      ],
      xAccessor,
      xScale,
      yScale,
      'cpa',
    );

    // Two subpaths => d3 lifted the pen over the gap. One "M" would mean the
    // line was drawn straight through the missing day.
    const path = seriesPathFromPoints(points, curveLinear);
    expect(path.match(/M/g)).toHaveLength(2);
  });

  it('emits a single continuous subpath when every point is present', () => {
    const points = computeSeriesPathPoints(
      [
        { date: day('2026-07-01'), cpa: 20 },
        { date: day('2026-07-02'), cpa: 30 },
        { date: day('2026-07-03'), cpa: 40 },
      ],
      xAccessor,
      xScale,
      yScale,
      'cpa',
    );

    expect(seriesPathFromPoints(points, curveLinear).match(/M/g)).toHaveLength(1);
  });

  it('returns an empty string for no points', () => {
    expect(seriesPathFromPoints([], curveLinear)).toBe('');
  });
});

describe('interpolateSeriesPathPoints', () => {
  const from = computeSeriesPathPoints(
    [
      { date: day('2026-07-01'), cpa: 20 },
      { date: day('2026-07-02'), cpa: 30 },
    ],
    xAccessor,
    xScale,
    yScale,
    'cpa',
  );

  it('carries the target definedness through a mid-flight frame', () => {
    const to = computeSeriesPathPoints(
      [
        { date: day('2026-07-01'), cpa: 20 },
        { date: day('2026-07-02'), cpa: null },
      ],
      xAccessor,
      xScale,
      yScale,
      'cpa',
    );

    // A point that just went missing must not animate back into the line for the
    // duration of the tween.
    const mid = interpolateSeriesPathPoints(from, to, 0.5);
    expect(mid.map((point) => point.defined)).toEqual([true, false]);
  });

  it('carries definedness for points with no matching source row', () => {
    const to = computeSeriesPathPoints(
      [
        { date: day('2026-07-03'), cpa: null },
        { date: day('2026-07-04'), cpa: 50 },
      ],
      xAccessor,
      xScale,
      yScale,
      'cpa',
    );

    expect(interpolateSeriesPathPoints(from, to, 0.5).map((point) => point.defined)).toEqual([
      false,
      true,
    ]);
  });

  it('returns the target verbatim once progress completes', () => {
    expect(interpolateSeriesPathPoints(from, from, 1)).toBe(from);
  });
});
