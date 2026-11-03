import { describe, expect, it } from 'bun:test';
import {
  HOME_CREATIVE_SPOTLIGHT_DEFAULT_LIMIT,
  HOME_CREATIVE_SPOTLIGHT_MAX_LIMIT,
  homeCreativeSpotlightAdSchema,
  homeCreativeSpotlightQuerySchema,
  homeCreativeSpotlightReadSchema,
} from './creativeSpotlight';

const BRAND = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';

const videoAd = {
  adId: '120252021696220236',
  adAccountId: 'act_521903353286118',
  adName: 'ALEIRA // PRIMER MES $12 (3) // AGOSTO',
  title: 'Primer mes $12',
  format: 'video' as const,
  thumbnailUrl: 'https://scontent.example/thumb.jpg',
  permalinkUrl: 'https://www.instagram.com/p/Dbvw2jnMDIR/',
  firstSeenAt: '2026-09-02T10:00:00.000Z',
  spend: 1200.5,
  spendShare: 0.31,
  impressions: 40000,
  costPerResult: {
    value: 23.72,
    results: 51,
    kpi: 'conversations',
    label: 'cost per conversation',
  },
  hookRate: 0.18,
  hookRateUnavailable: null,
  frequency: 1.4,
  verdict: 'winner' as const,
  verdictWhy: 'Cost per conversation 23.72 beats the BOF cohort median (29.76) by 20% over 14d.',
  intelVerdict: 'scale' as const,
  intelReason: 'Cost per conversation $23.72 beats the BOF cohort median ($29.76) by 20% over 14d.',
};

const ready = {
  state: 'ready' as const,
  brandId: BRAND,
  generatedAt: '2026-11-03T12:00:00.000Z',
  data: {
    window: '7d' as const,
    currency: 'MXN',
    asOf: '2026-11-03T05:06:37.606Z',
    ageDays: 0,
    totalSpend: 3872.4,
    adsWithSpend: 35,
    ads: [videoAd],
    otherCurrencies: [{ currency: 'USD', adsWithSpend: 2 }],
    source: { kind: 'paid_media.ads', ref: null, since: '2026-10-27', until: '2026-11-02' },
  },
};

describe('homeCreativeSpotlightReadSchema', () => {
  it('accepts a ready answer carrying ranked ads', () => {
    expect(homeCreativeSpotlightReadSchema.safeParse(ready).success).toBe(true);
  });

  it('accepts a missing answer', () => {
    const missing = {
      state: 'missing',
      brandId: BRAND,
      generatedAt: '2026-11-03T12:00:00.000Z',
      missing: { reason: 'no_data', detail: 'Ads were last synced 20 days ago.' },
    };
    expect(homeCreativeSpotlightReadSchema.safeParse(missing).success).toBe(true);
  });

  it('an image ad has no hook rate, and says why', () => {
    const image = { ...videoAd, format: 'image', hookRate: null, hookRateUnavailable: 'not_video' };
    expect(homeCreativeSpotlightAdSchema.safeParse(image).success).toBe(true);
  });

  it('refuses a null hook rate that does not say why', () => {
    const silent = { ...videoAd, hookRate: null, hookRateUnavailable: null };
    expect(homeCreativeSpotlightAdSchema.safeParse(silent).success).toBe(false);
  });

  it('refuses a hook rate that also claims to be unavailable', () => {
    const both = { ...videoAd, hookRate: 0.2, hookRateUnavailable: 'not_reported' };
    expect(homeCreativeSpotlightAdSchema.safeParse(both).success).toBe(false);
  });

  it('a cost per result with zero results is null, never zero', () => {
    const none = {
      ...videoAd,
      costPerResult: { ...videoAd.costPerResult, value: null, results: 0 },
    };
    expect(homeCreativeSpotlightAdSchema.safeParse(none).success).toBe(true);
    const fake = { ...videoAd, costPerResult: { ...videoAd.costPerResult, value: 0, results: 0 } };
    expect(homeCreativeSpotlightAdSchema.safeParse(fake).success).toBe(false);
  });

  it('refuses a spend share above one', () => {
    expect(homeCreativeSpotlightAdSchema.safeParse({ ...videoAd, spendShare: 1.2 }).success).toBe(
      false,
    );
  });
});

describe('homeCreativeSpotlightQuerySchema', () => {
  it('defaults to the top 8 over 7 days', () => {
    expect(homeCreativeSpotlightQuerySchema.parse({})).toEqual({
      limit: HOME_CREATIVE_SPOTLIGHT_DEFAULT_LIMIT,
      window: '7d',
    });
    expect(HOME_CREATIVE_SPOTLIGHT_DEFAULT_LIMIT).toBe(8);
  });

  it('reads limit and window from the query string', () => {
    expect(homeCreativeSpotlightQuerySchema.parse({ limit: '12', window: '14d' })).toEqual({
      limit: 12,
      window: '14d',
    });
  });

  it('refuses a limit outside 1..20 and an unknown window', () => {
    expect(homeCreativeSpotlightQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(
      homeCreativeSpotlightQuerySchema.safeParse({
        limit: String(HOME_CREATIVE_SPOTLIGHT_MAX_LIMIT + 1),
      }).success,
    ).toBe(false);
    expect(homeCreativeSpotlightQuerySchema.safeParse({ window: '30d' }).success).toBe(false);
  });
});
