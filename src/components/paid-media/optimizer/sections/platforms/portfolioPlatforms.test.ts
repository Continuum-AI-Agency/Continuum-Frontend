import { describe, expect, it } from 'bun:test';
import { portfolioMetricsFixture } from '../attribution/__fixtures__/portfolioMetricsFixture';
import { orderPlatforms } from './platformTabsModel';
import { memberPlatforms } from './portfolioPlatforms';

describe('memberPlatforms — the portfolio row reads its platforms as By platform does', () => {
  it('names every platform the portfolio holds members on, Meta then Google then TikTok', () => {
    const metrics = portfolioMetricsFixture();
    const reversed = { ...metrics, by_platform: [...metrics.by_platform].reverse() };
    expect(memberPlatforms({ status: 'ready', metrics: reversed }, 'meta')).toEqual([
      'meta',
      'google_ads',
      'tiktok_ads',
    ]);
  });

  it('names only the platforms with members', () => {
    const metrics = portfolioMetricsFixture({ platforms: ['google_ads', 'tiktok_ads'] });
    expect(memberPlatforms({ status: 'ready', metrics }, 'meta')).toEqual([
      'google_ads',
      'tiktok_ads',
    ]);
  });

  it('keeps the managed platform when the read is not deployed, failed, or holds no member', () => {
    expect(memberPlatforms({ status: 'unavailable' }, 'meta')).toEqual(['meta']);
    expect(memberPlatforms({ status: 'error' }, 'meta')).toEqual(['meta']);
    const empty = { ...portfolioMetricsFixture({ platforms: ['meta'] }), by_platform: [] };
    expect(memberPlatforms({ status: 'ready', metrics: empty }, 'meta')).toEqual(['meta']);
  });

  it('names no platform while the read is in flight, rather than a guess', () => {
    expect(memberPlatforms({ status: 'loading' }, 'meta')).toEqual([]);
    expect(memberPlatforms(undefined, 'meta')).toEqual([]);
  });
});

describe('orderPlatforms', () => {
  it('orders Meta, Google, TikTok and drops repeats', () => {
    expect(orderPlatforms(['tiktok_ads', 'meta', 'tiktok_ads', 'google_ads'])).toEqual([
      'meta',
      'google_ads',
      'tiktok_ads',
    ]);
  });
});
