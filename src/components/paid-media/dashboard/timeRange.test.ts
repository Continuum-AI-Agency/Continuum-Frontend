import { describe, expect, it } from 'bun:test';

import {
  buildDefaultCustomRange,
  normalizeCustomRange,
  type PaidMediaTimeRange,
  resolveTimeRangeWindow,
  toMetricsRange,
} from './timeRange';

describe('paid-media time range utilities', () => {
  const fixedNow = new Date('2026-03-11T18:30:00.000Z');

  it('builds default custom range from now', () => {
    expect(buildDefaultCustomRange(fixedNow)).toEqual({
      since: '2026-03-04',
      until: '2026-03-11',
    });
  });

  it('normalizes custom ranges by swapping inverted dates', () => {
    expect(normalizeCustomRange({ since: '2026-03-11', until: '2026-03-04' }, fixedNow)).toEqual({
      since: '2026-03-04',
      until: '2026-03-11',
    });
  });

  it('falls back to default custom range when custom dates are invalid', () => {
    expect(normalizeCustomRange({ since: 'invalid', until: '2026-03-11' }, fixedNow)).toEqual({
      since: '2026-03-04',
      until: '2026-03-11',
    });
  });

  it('resolves rolling presets into concrete windows', () => {
    const range: PaidMediaTimeRange = { preset: 'last_14d' };
    expect(resolveTimeRangeWindow(range, fixedNow)).toEqual({
      since: '2026-02-25',
      until: '2026-03-11',
      dayCount: 14,
    });
  });

  it('keeps valid custom ranges and computes day count', () => {
    const range: PaidMediaTimeRange = {
      preset: 'custom',
      since: '2026-03-01',
      until: '2026-03-10',
    };
    expect(resolveTimeRangeWindow(range, fixedNow)).toEqual({
      since: '2026-03-01',
      until: '2026-03-10',
      dayCount: 10,
    });
  });

  it('maps custom range to paid-metrics payload', () => {
    const range: PaidMediaTimeRange = {
      preset: 'custom',
      since: '2026-03-01',
      until: '2026-03-10',
    };
    expect(toMetricsRange(range)).toEqual({
      preset: 'custom',
      since: '2026-03-01',
      until: '2026-03-10',
    });
  });
});
