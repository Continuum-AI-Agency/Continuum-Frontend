import { describe, expect, it } from 'bun:test';
import {
  countOf,
  platformLabelsOf,
  platformOfLiveChange,
  platformOfSource,
} from './platformLabels';

describe('platformLabelsOf: one view, each platform its own words', () => {
  it('Meta says campaign, ad set, ad', () => {
    const labels = platformLabelsOf('meta');
    expect(labels.level).toEqual({ campaign: 'Campaign', adset: 'Ad set', ad: 'Ad' });
    expect(labels.chip).toBe('Meta');
    expect(labels.hasAds).toBe(true);
  });

  it('Google Search and TikTok say ad group', () => {
    for (const platform of ['google_search', 'tiktok'] as const) {
      const labels = platformLabelsOf(platform);
      expect(labels.level).toEqual({ campaign: 'Campaign', adset: 'Ad group', ad: 'Ad' });
      expect(labels.hasAds).toBe(true);
    }
    expect(platformLabelsOf('google_search').chip).toBe('Google Search');
    expect(platformLabelsOf('tiktok').chip).toBe('TikTok');
  });

  it('Performance Max says asset group and assets, and has no ads', () => {
    const labels = platformLabelsOf('google_pmax');
    expect(labels.level).toEqual({ campaign: 'Campaign', adset: 'Asset group', ad: 'Assets' });
    expect(labels.hasAds).toBe(false);
    expect(labels.chip).toBe('Google PMax');
  });

  it('counts in the singular and the plural', () => {
    expect(countOf(platformLabelsOf('meta'), 'adset', 1)).toBe('1 ad set');
    expect(countOf(platformLabelsOf('google_search'), 'adset', 3)).toBe('3 ad groups');
    expect(countOf(platformLabelsOf('google_pmax'), 'adset', 2)).toBe('2 asset groups');
  });
});

describe('the platform of a source', () => {
  it('is Meta when the source names none — every scaffold and live change today', () => {
    expect(platformOfSource({})).toBe('meta');
    expect(platformOfSource(null)).toBe('meta');
    expect(platformOfLiveChange({ toolName: 'change_meta_budget_bid' })).toBe('meta');
  });

  it('reads Google with its channel, and TikTok', () => {
    expect(platformOfSource({ platform: 'google', channel: 'SEARCH' })).toBe('google_search');
    expect(platformOfSource({ platform: 'google', channel: 'PERFORMANCE_MAX' })).toBe(
      'google_pmax',
    );
    expect(
      platformOfSource({ platform: 'google_ads', advertisingChannelType: 'PERFORMANCE_MAX' }),
    ).toBe('google_pmax');
    expect(platformOfSource({ platform: 'google' })).toBe('google_search');
    expect(platformOfSource({ platform: 'TikTok' })).toBe('tiktok');
  });

  it('falls back to the proposing tool when the payload names no platform', () => {
    expect(platformOfLiveChange({ toolName: 'google_ads_change_budget' })).toBe('google_search');
    expect(
      platformOfLiveChange({ toolName: 'google_ads_change_budget', channel: 'PERFORMANCE_MAX' }),
    ).toBe('google_pmax');
    expect(platformOfLiveChange({ toolName: 'tiktok_pause_ad_group' })).toBe('tiktok');
    expect(platformOfLiveChange({ toolName: 'tiktok_x', platform: 'meta' })).toBe('meta');
  });
});
