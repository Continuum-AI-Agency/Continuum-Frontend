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
  const UTC = 'UTC';

  // PP-L3-last-7d-asks-eight-days-including-today: a "last 7 days" that ends today is eight
  // days, one of them half-written. Every rolling preset here is N complete days ending
  // yesterday — the window the truth calculator and Meta's own presets mean.
  it('builds the default custom range as the seven complete days ending yesterday', () => {
    expect(buildDefaultCustomRange(fixedNow, UTC)).toEqual({
      since: '2026-03-04',
      until: '2026-03-10',
    });
  });

  it('normalizes custom ranges by swapping inverted dates', () => {
    expect(normalizeCustomRange({ since: '2026-03-11', until: '2026-03-04' }, fixedNow)).toEqual({
      since: '2026-03-04',
      until: '2026-03-11',
    });
  });

  it('falls back to default custom range when custom dates are invalid', () => {
    expect(normalizeCustomRange({ since: 'invalid', until: '2026-03-11' }, fixedNow, UTC)).toEqual(
      {
        since: '2026-03-04',
        until: '2026-03-10',
      },
    );
  });

  it('resolves rolling presets into N complete days ending yesterday', () => {
    expect(resolveTimeRangeWindow({ preset: 'last_7d' }, fixedNow, UTC)).toEqual({
      since: '2026-03-04',
      until: '2026-03-10',
      dayCount: 7,
    });
    expect(resolveTimeRangeWindow({ preset: 'last_14d' }, fixedNow, UTC)).toEqual({
      since: '2026-02-25',
      until: '2026-03-10',
      dayCount: 14,
    });
  });

  it('asks the edge for a rolling preset as that explicit window, never as the preset', () => {
    expect(toMetricsRange({ preset: 'last_7d' }, fixedNow, UTC)).toEqual({
      preset: 'custom',
      since: '2026-03-04',
      until: '2026-03-10',
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
