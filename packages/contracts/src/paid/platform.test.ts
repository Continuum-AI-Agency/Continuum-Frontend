import { describe, expect, test } from 'bun:test';
import {
  BudgetRefSchema,
  currencyMinorOffset,
  EntityAutomationSchema,
  EntityRefSchema,
  fromPlatformBudget,
  isAutomationOfPlatform,
  LEGACY_PLATFORM_ALIASES,
  nativeLevelsFor,
  normalizePlatformId,
  type PlatformEntityRef,
  PlatformIdSchema,
  toPlatformBudget,
} from './platform';

describe('PlatformIdSchema', () => {
  test('accepts exactly the three canonical ids', () => {
    expect(PlatformIdSchema.options).toEqual(['meta', 'google_ads', 'tiktok_ads']);
    expect(PlatformIdSchema.safeParse('google-ads').success).toBe(false);
  });
});

describe('normalizePlatformId', () => {
  test('canonical ids pass through', () => {
    for (const id of PlatformIdSchema.options) expect(normalizePlatformId(id)).toBe(id);
  });

  test('every legacy literal in the repo maps to its canonical id', () => {
    expect(normalizePlatformId('meta_ads')).toBe('meta');
    expect(normalizePlatformId('google-ads')).toBe('google_ads');
    expect(normalizePlatformId('google')).toBe('google_ads');
    expect(normalizePlatformId('tiktok-ads')).toBe('tiktok_ads');
    expect(normalizePlatformId('tiktok_ads')).toBe('tiktok_ads');
    for (const [legacy, canonical] of Object.entries(LEGACY_PLATFORM_ALIASES)) {
      expect(normalizePlatformId(legacy)).toBe(canonical);
    }
  });

  test('tolerates case and surrounding whitespace', () => {
    expect(normalizePlatformId(' Google-Ads ')).toBe('google_ads');
    expect(normalizePlatformId('META')).toBe('meta');
  });

  test('throws on anything unknown, including the organic providers', () => {
    // 'tiktok' and 'facebook' are ORGANIC integration providers; reading one as an ads
    // platform would point a budget write at a creator account.
    for (const raw of ['tiktok', 'facebook', 'linkedin', '', 'googleads']) {
      expect(() => normalizePlatformId(raw)).toThrow(/Unknown ad platform/);
    }
  });
});

const metaAdset: PlatformEntityRef = {
  platform: 'meta',
  level: 'group',
  nativeLevel: 'adset',
  id: '120210000000000001',
  accountId: '1234567890',
};

describe('EntityRefSchema', () => {
  test('a Meta ad set is level group, native adset', () => {
    expect(EntityRefSchema.parse(metaAdset)).toEqual(metaAdset);
  });

  test('Google groups may be ad groups or PMax asset groups', () => {
    expect(nativeLevelsFor('google_ads', 'group')).toEqual(['ad_group', 'asset_group']);
    const assetGroup = { ...metaAdset, platform: 'google_ads', nativeLevel: 'asset_group' };
    expect(EntityRefSchema.safeParse(assetGroup).success).toBe(true);
  });

  test('a TikTok group is an ad_group, never an adset', () => {
    const tiktok = { ...metaAdset, platform: 'tiktok_ads', nativeLevel: 'adset' };
    expect(EntityRefSchema.safeParse(tiktok).success).toBe(false);
    expect(EntityRefSchema.safeParse({ ...tiktok, nativeLevel: 'ad_group' }).success).toBe(true);
  });

  test('refuses a native level from the wrong neutral level', () => {
    expect(EntityRefSchema.safeParse({ ...metaAdset, nativeLevel: 'campaign' }).success).toBe(
      false,
    );
  });

  test('keeps the optional name, refuses empty ids', () => {
    expect(EntityRefSchema.parse({ ...metaAdset, name: 'CAÑADAS BAU' }).name).toBe('CAÑADAS BAU');
    expect(EntityRefSchema.safeParse({ ...metaAdset, id: '' }).success).toBe(false);
    expect(EntityRefSchema.safeParse({ ...metaAdset, accountId: '' }).success).toBe(false);
  });
});

describe('EntityAutomationSchema', () => {
  test('each automated type belongs to exactly one platform; manual to all', () => {
    expect(EntityAutomationSchema.options).toEqual([
      'manual',
      'pmax',
      'advantage_plus',
      'smart_plus',
      'upgraded_smart_plus',
    ]);
    expect(isAutomationOfPlatform('google_ads', 'pmax')).toBe(true);
    expect(isAutomationOfPlatform('meta', 'pmax')).toBe(false);
    expect(isAutomationOfPlatform('meta', 'advantage_plus')).toBe(true);
    expect(isAutomationOfPlatform('tiktok_ads', 'upgraded_smart_plus')).toBe(true);
    expect(isAutomationOfPlatform('google_ads', 'smart_plus')).toBe(false);
    for (const p of PlatformIdSchema.options)
      expect(isAutomationOfPlatform(p, 'manual')).toBe(true);
  });
});

describe('currencyMinorOffset (ISO 4217, not Meta)', () => {
  test('two-digit currencies', () => {
    for (const iso of ['MXN', 'USD', 'EUR', 'HUF', 'TWD'])
      expect(currencyMinorOffset(iso)).toBe(100);
  });

  test('zero-digit currencies', () => {
    for (const iso of ['JPY', 'KRW', 'CLP', 'VND', 'PYG', 'ISK'])
      expect(currencyMinorOffset(iso)).toBe(1);
  });

  test('three-digit dinars, where Meta says 100', () => {
    for (const iso of ['KWD', 'BHD', 'JOD', 'OMR', 'TND'])
      expect(currencyMinorOffset(iso)).toBe(1000);
  });

  test('is case-insensitive and throws on a malformed code rather than guessing', () => {
    expect(currencyMinorOffset('mxn')).toBe(100);
    for (const bad of ['', 'MX', 'MXNN', '$']) {
      expect(() => currencyMinorOffset(bad)).toThrow(/ISO 4217/);
    }
  });
});

describe('toPlatformBudget / fromPlatformBudget', () => {
  // 400 MXN, 25 USD, 3,000 JPY, 50,000 KRW — in ISO minor units.
  const cases = [
    { currency: 'MXN', minor: 40_000, meta: 40_000, google: 400_000_000, tiktok: 400 },
    { currency: 'USD', minor: 2_550, meta: 2_550, google: 25_500_000, tiktok: 25.5 },
    { currency: 'JPY', minor: 3_000, meta: 3_000, google: 3_000_000_000, tiktok: 3_000 },
    { currency: 'KRW', minor: 50_000, meta: 50_000, google: 50_000_000_000, tiktok: 50_000 },
  ];

  for (const c of cases) {
    test(`${c.currency}: Meta minor units round-trip`, () => {
      expect(toPlatformBudget('meta', c.minor, c.currency)).toBe(c.meta);
      expect(fromPlatformBudget('meta', c.meta, c.currency)).toBe(c.minor);
    });

    test(`${c.currency}: Google micros round-trip`, () => {
      expect(toPlatformBudget('google_ads', c.minor, c.currency)).toBe(c.google);
      expect(fromPlatformBudget('google_ads', c.google, c.currency)).toBe(c.minor);
    });

    test(`${c.currency}: TikTok major units round-trip`, () => {
      expect(toPlatformBudget('tiktok_ads', c.minor, c.currency)).toBe(c.tiktok);
      expect(fromPlatformBudget('tiktok_ads', c.tiktok, c.currency)).toBe(c.minor);
    });
  }

  test('Meta uses its own offset where it differs from ISO (HUF, KWD)', () => {
    // 1,000 HUF: ISO 100,000 minor; Meta treats HUF as zero-decimal.
    expect(toPlatformBudget('meta', 100_000, 'HUF')).toBe(1_000);
    expect(fromPlatformBudget('meta', 1_000, 'HUF')).toBe(100_000);
    // 12.500 KWD: ISO 12,500 minor; Meta writes 1,250.
    expect(toPlatformBudget('meta', 12_500, 'KWD')).toBe(1_250);
    expect(fromPlatformBudget('meta', 1_250, 'KWD')).toBe(12_500);
  });

  test('Google micros round to the billable unit of the currency', () => {
    // A JPY budget of 3,000 with a 1-yen billable unit stays on the unit.
    expect(toPlatformBudget('google_ads', 3_000, 'JPY', { billableUnitMicros: 1_000_000 })).toBe(
      3_000_000_000,
    );
    // A coarser billable unit (10 currency units) rounds to the nearest multiple.
    expect(toPlatformBudget('google_ads', 40_049, 'MXN', { billableUnitMicros: 10_000_000 })).toBe(
      400_000_000,
    );
    expect(toPlatformBudget('google_ads', 40_600, 'MXN', { billableUnitMicros: 10_000_000 })).toBe(
      410_000_000,
    );
  });

  test('a fractional Google amount comes back as whole ledger minor units', () => {
    expect(fromPlatformBudget('google_ads', 400_004_000, 'MXN')).toBe(40_000);
    expect(fromPlatformBudget('tiktok_ads', 200.006, 'MXN')).toBe(20_001);
  });

  test('refuses a ledger amount that is not a whole, non-negative number of minor units', () => {
    expect(() => toPlatformBudget('meta', 10.5, 'USD')).toThrow(/minor/);
    expect(() => toPlatformBudget('google_ads', -1, 'USD')).toThrow(/minor/);
    expect(() => fromPlatformBudget('tiktok_ads', Number.NaN, 'USD')).toThrow(/amount/);
    expect(() => toPlatformBudget('google_ads', 100, 'USD', { billableUnitMicros: 0 })).toThrow(
      /billable/,
    );
  });
});

describe('BudgetRefSchema', () => {
  const budget = {
    kind: 'daily',
    minor: 40_000,
    currency: 'MXN',
    shared: false,
    ownerRef: { ...metaAdset, platform: 'google_ads', level: 'campaign', nativeLevel: 'campaign' },
  };

  test('parses a daily campaign budget with its native budget id', () => {
    expect(BudgetRefSchema.parse({ ...budget, nativeBudgetId: '987' }).nativeBudgetId).toBe('987');
  });

  test('ledger minor units are whole and the currency is an ISO code', () => {
    expect(BudgetRefSchema.safeParse({ ...budget, minor: 1.5 }).success).toBe(false);
    expect(BudgetRefSchema.safeParse({ ...budget, currency: 'mxn' }).success).toBe(false);
    expect(BudgetRefSchema.safeParse({ ...budget, kind: 'monthly' }).success).toBe(false);
  });
});
