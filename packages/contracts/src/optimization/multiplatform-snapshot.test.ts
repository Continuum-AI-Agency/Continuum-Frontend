import { describe, expect, test } from 'bun:test';
import {
  MultiPlatformSnapshotSchema,
  MultiPlatformWindowMetricsSchema,
} from './multiplatform-snapshot';

const window = {
  spend: 965.56,
  purchases: 0,
  addToCarts: 0,
  clicks: 80,
  impressions: 2_100,
  // Google's data-driven attribution reports fractional conversions.
  leads: 3.5,
  conversionsValue: 0,
  conversionsByAction: { '7001': { count: 3.5, value: 0, category: 'SUBMIT_LEAD_FORM' } },
  delivery: { impressionShare: 0.709, budgetLostImpressionShare: 0.291 },
};

const campaignRef = {
  platform: 'google_ads',
  level: 'campaign',
  nativeLevel: 'campaign',
  id: '22000000001',
  accountId: '3710693645',
};

const snapshot = {
  platform: 'google_ads',
  level: 'campaign',
  native_level: 'campaign',
  id: '22000000001',
  accountId: '3710693645',
  name: 'Search Marca+Genérico',
  automation: 'manual',
  budget: {
    kind: 'daily',
    minor: 40_000,
    currency: 'MXN',
    shared: false,
    ownerRef: campaignRef,
    nativeBudgetId: '987',
  },
  bidding: { strategyType: 'MAXIMIZE_CONVERSIONS', targetCpaMicros: 61_200_000 },
  primaryStatus: 'ELIGIBLE',
  primaryStatusReasons: [],
  windows: { d3: window, d7: window, d14: window },
};

describe('MultiPlatformWindowMetricsSchema', () => {
  test('keeps fractional conversions, value, per-action counts and delivery', () => {
    const parsed = MultiPlatformWindowMetricsSchema.parse(window);
    expect(parsed.leads).toBe(3.5);
    expect(parsed.conversionsByAction?.['7001']?.category).toBe('SUBMIT_LEAD_FORM');
    expect(parsed.delivery?.impressionShare).toBe(0.709);
  });

  test('a Meta window carries reach and frequency instead of impression share', () => {
    const meta = {
      ...window,
      conversionsValue: undefined,
      delivery: { reach: 40_000, frequency: 1.8 },
    };
    expect(MultiPlatformWindowMetricsSchema.parse(meta).delivery?.frequency).toBe(1.8);
  });

  test('impression shares are fractions, and absent value is undefined, not 0', () => {
    expect(
      MultiPlatformWindowMetricsSchema.safeParse({ ...window, delivery: { impressionShare: 70.9 } })
        .success,
    ).toBe(false);
    const { conversionsValue: _omitted, ...withoutValue } = window;
    expect(MultiPlatformWindowMetricsSchema.parse(withoutValue).conversionsValue).toBeUndefined();
  });
});

describe('MultiPlatformSnapshotSchema', () => {
  test('parses a Google Search campaign', () => {
    const parsed = MultiPlatformSnapshotSchema.parse(snapshot);
    expect(parsed.native_level).toBe('campaign');
    expect(parsed.budget.nativeBudgetId).toBe('987');
  });

  test('a PMax asset group is a group whose native level is asset_group', () => {
    const assetGroup = {
      ...snapshot,
      level: 'group',
      native_level: 'asset_group',
      automation: 'pmax',
    };
    expect(MultiPlatformSnapshotSchema.safeParse(assetGroup).success).toBe(true);
    expect(
      MultiPlatformSnapshotSchema.safeParse({ ...assetGroup, native_level: 'adset' }).success,
    ).toBe(false);
  });

  test('automation must belong to the platform', () => {
    expect(
      MultiPlatformSnapshotSchema.safeParse({ ...snapshot, automation: 'smart_plus' }).success,
    ).toBe(false);
    expect(
      MultiPlatformSnapshotSchema.safeParse({ ...snapshot, automation: 'advantage_plus' }).success,
    ).toBe(false);
  });

  test('the budget must be owned on the same platform', () => {
    const metaOwner = { ...campaignRef, platform: 'meta' };
    const crossed = { ...snapshot, budget: { ...snapshot.budget, ownerRef: metaOwner } };
    expect(MultiPlatformSnapshotSchema.safeParse(crossed).success).toBe(false);
  });

  test('a TikTok ad group snapshot with secondary statuses as reasons', () => {
    const adGroupRef = {
      platform: 'tiktok_ads',
      level: 'group',
      nativeLevel: 'ad_group',
      id: '1800000000000000001',
      accountId: '7000000000000000001',
    };
    const tiktok = {
      ...snapshot,
      ...adGroupRef,
      native_level: 'ad_group',
      bidding: undefined,
      budget: {
        kind: 'daily',
        minor: 20_000,
        currency: 'MXN',
        shared: false,
        ownerRef: adGroupRef,
      },
      primaryStatus: 'STATUS_DELIVERY_OK',
      primaryStatusReasons: ['ADGROUP_STATUS_DELIVERY_OK'],
    };
    expect(MultiPlatformSnapshotSchema.parse(tiktok).id).toBe('1800000000000000001');
  });

  test('requires all three windows', () => {
    const missing = { ...snapshot, windows: { d3: window, d7: window } };
    expect(MultiPlatformSnapshotSchema.safeParse(missing).success).toBe(false);
  });
});
