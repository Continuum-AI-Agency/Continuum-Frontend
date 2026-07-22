import { describe, expect, it } from 'bun:test';

import { chartStatus, combinedChartStatus } from './chartStatus';

// The bug these guard: useOptimizerRead always returns a renderable `data`, so a
// failed read and an empty portfolio reach the chart identically. The chart then
// prints "…appears after a few scored cycles" over a request that errored —
// a confident claim about a cause it cannot observe.

describe('chartStatus', () => {
  it('reports error ahead of everything else', () => {
    expect(chartStatus({ isError: true, isLoading: true })).toBe('error');
    expect(chartStatus({ isError: true })).toBe('error');
  });

  it('reports loading while the read is in flight', () => {
    expect(chartStatus({ isLoading: true })).toBe('loading');
  });

  it('reports ready once the read settles, so the chart owns its own empty', () => {
    expect(chartStatus({ isLoading: false, isError: false })).toBe('ready');
    expect(chartStatus({})).toBe('ready');
  });
});

describe('combinedChartStatus', () => {
  it('takes the worst status across the reads feeding one chart', () => {
    expect(combinedChartStatus({ isLoading: true }, { isError: true })).toBe('error');
    expect(combinedChartStatus({}, { isLoading: true })).toBe('loading');
  });

  it('is ready only when every contributing read has settled', () => {
    expect(combinedChartStatus({}, {})).toBe('ready');
  });

  it('is ready with no reads at all', () => {
    expect(combinedChartStatus()).toBe('ready');
  });
});
