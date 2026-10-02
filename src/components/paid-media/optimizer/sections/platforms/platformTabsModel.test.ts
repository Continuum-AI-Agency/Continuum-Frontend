import { describe, expect, it } from 'bun:test';
import type { AdAccount } from '@continuum/contracts';
import {
  accountsOn,
  connectedPlatforms,
  parsePlatformTab,
  platformTabLabel,
  rendersManagedOverview,
} from './platformTabsModel';

const account = (platform: string, id: string): AdAccount => ({
  platform,
  account_id: id,
  name: null,
  status: null,
  currency: null,
});

describe('parsePlatformTab', () => {
  it('reads the canonical ids and opens All for anything else', () => {
    expect(parsePlatformTab('meta')).toBe('meta');
    expect(parsePlatformTab('google_ads')).toBe('google_ads');
    expect(parsePlatformTab('tiktok_ads')).toBe('tiktok_ads');
    expect(parsePlatformTab('google')).toBe('all');
    expect(parsePlatformTab(null)).toBe('all');
  });

  it('labels the tabs in product English', () => {
    expect(
      ['all', 'meta', 'google_ads', 'tiktok_ads'].map((t) => platformTabLabel(parsePlatformTab(t))),
    ).toEqual(['All', 'Meta', 'Google', 'TikTok']);
  });
});

describe('connectedPlatforms', () => {
  it('reads list_brand_ad_accounts spellings, and never connects TikTok', () => {
    const accounts = [account('meta_ads', 'act_1'), account('google_ads', '3710693645')];
    expect(connectedPlatforms(accounts)).toEqual({
      meta: true,
      google_ads: true,
      tiktok_ads: false,
    });
    expect(accountsOn(accounts, 'google_ads').map((a) => a.account_id)).toEqual(['3710693645']);
    expect(connectedPlatforms([])).toEqual({ meta: false, google_ads: false, tiktok_ads: false });
  });
});

describe('rendersManagedOverview', () => {
  it('serves All and Meta from the O1 overview', () => {
    expect(rendersManagedOverview('all')).toBe(true);
    expect(rendersManagedOverview('meta')).toBe(true);
    expect(rendersManagedOverview('google_ads')).toBe(false);
    expect(rendersManagedOverview('tiktok_ads')).toBe(false);
  });
});
