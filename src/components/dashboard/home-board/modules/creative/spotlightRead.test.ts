import { describe, expect, it } from 'bun:test';
import type { HomeCreativeSpotlightAd, HomeCreativeSpotlightData } from '@continuum/contracts';
import {
  spotlightAgeLine,
  spotlightCostLine,
  spotlightFormatLabel,
  spotlightHookLine,
  spotlightName,
  spotlightVerdictLine,
} from './spotlightRead';

const ad = (over: Partial<HomeCreativeSpotlightAd> = {}): HomeCreativeSpotlightAd => ({
  adId: '1',
  adAccountId: 'act_1',
  adName: 'CAÑADAS // 2 VIDEO',
  title: '¡Primer mes a $31 pesos!',
  format: 'video',
  thumbnailUrl: null,
  permalinkUrl: null,
  firstSeenAt: '2026-10-17T17:10:14Z',
  spend: 4159.16,
  spendShare: 0.216,
  impressions: 130_171,
  costPerResult: {
    value: 28.29,
    results: 147,
    kpi: 'conversations',
    label: 'cost per conversation',
  },
  hookRate: 0.0164,
  hookRateUnavailable: null,
  frequency: 1.427,
  verdict: 'winner',
  verdictWhy: 'Beats its cohort.',
  intelVerdict: 'scale',
  intelReason: null,
  ...over,
});

const data = (over: Partial<HomeCreativeSpotlightData> = {}): HomeCreativeSpotlightData => ({
  window: '7d',
  currency: 'MXN',
  asOf: '2026-11-04T05:05:36Z',
  ageDays: 0,
  totalSpend: 19000,
  adsWithSpend: 35,
  ads: [ad()],
  otherCurrencies: [],
  source: { kind: 'paid_media.ads', ref: null, since: null, until: null },
  ...over,
});

describe('spotlightHookLine', () => {
  it('prints the measured hook rate', () => {
    expect(spotlightHookLine(ad())).toBe('Hook rate 1.6%');
  });

  it('says why there is none: not a video, or never reported, never a zero', () => {
    expect(
      spotlightHookLine(ad({ format: 'image', hookRate: null, hookRateUnavailable: 'not_video' })),
    ).toBe('No hook rate: not a video');
    expect(spotlightHookLine(ad({ hookRate: null, hookRateUnavailable: 'not_reported' }))).toBe(
      'Hook rate not reported',
    );
  });
});

describe('spotlightFormatLabel', () => {
  it('names the formats, and an unknown one stays unknown', () => {
    expect(spotlightFormatLabel('video')).toBe('Video');
    expect(spotlightFormatLabel('carousel')).toBe('Carousel');
    expect(spotlightFormatLabel('unknown')).toBe('Format unknown');
  });
});

describe('spotlightCostLine', () => {
  it('prints the cost in the read’s currency and its own words', () => {
    expect(spotlightCostLine(ad(), 'MXN')).toBe('$28.29 MXN cost per conversation');
  });

  it('an ad with no result says so', () => {
    expect(
      spotlightCostLine(
        ad({ costPerResult: { value: null, results: 0, kpi: 'leads', label: 'cost per lead' } }),
        'MXN',
      ),
    ).toBe('No result yet');
  });

  it('a currency the account never reported stays out', () => {
    expect(spotlightCostLine(ad(), null)).toBe('28.29 cost per conversation');
  });
});

describe('spotlightVerdictLine', () => {
  it('counts the verdicts it holds, fading first', () => {
    const line = spotlightVerdictLine(
      data({
        ads: [
          ad({ adId: '1', verdict: 'winner' }),
          ad({ adId: '2', verdict: 'fading' }),
          ad({ adId: '3', verdict: 'fading' }),
          ad({ adId: '4', verdict: 'new' }),
          ad({ adId: '5', verdict: 'steady' }),
        ],
      }),
    );
    expect(line).toBe('2 fading · 1 winner · 1 new · 1 steady');
  });
});

describe('spotlightAgeLine', () => {
  it('dates the read and says when it is old', () => {
    expect(spotlightAgeLine(data())).toBe('As of Nov 4');
    expect(spotlightAgeLine(data({ asOf: '2026-10-14T05:00:00Z', ageDays: 21 }))).toBe(
      'As of Oct 14 · 21 days old',
    );
  });
});

describe('spotlightName', () => {
  it('prefers the headline, then the ad’s name, then its id', () => {
    expect(spotlightName(ad())).toBe('¡Primer mes a $31 pesos!');
    expect(spotlightName(ad({ title: null }))).toBe('CAÑADAS // 2 VIDEO');
    expect(spotlightName(ad({ title: null, adName: null }))).toBe('Ad 1');
  });
});
