import { describe, expect, it } from 'bun:test';

import { resolveSeriesKey, resolveTrendState } from './PostQuickLook';

describe('resolveSeriesKey', () => {
  it('picks the first chartable primary metric', () => {
    expect(resolveSeriesKey(['views', undefined, undefined])).toBe('views');
    expect(resolveSeriesKey(['reach', 'views', 'engagement'])).toBe('reach');
  });

  it('defaults to views when no primary metric is chartable', () => {
    expect(resolveSeriesKey([undefined, undefined])).toBe('views');
    expect(resolveSeriesKey(['saved'])).toBe('views');
  });
});

describe('resolveTrendState', () => {
  it('prefers the per-post series when it has enough points', () => {
    expect(resolveTrendState(3, 0)).toBe('post');
    expect(resolveTrendState(2, 5)).toBe('post');
  });

  it('falls back to the account trend, then empty', () => {
    expect(resolveTrendState(1, 2)).toBe('account');
    expect(resolveTrendState(0, 5)).toBe('account');
    expect(resolveTrendState(1, 1)).toBe('empty');
    expect(resolveTrendState(0, 0)).toBe('empty');
  });
});
