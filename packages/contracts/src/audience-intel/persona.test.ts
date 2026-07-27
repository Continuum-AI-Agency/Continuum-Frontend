import { describe, expect, it } from 'bun:test';

import { META_REPORTED_ATTRIBUTION_NOTE } from '../creative-strategy/paid';
import {
  audiencePersonaSchema,
  buyerIntentReportSchema,
  compareByIntentValue,
  foldIntentFunnel,
  INTENT_LADDER,
  intentFunnelSchema,
  intentRungForActionType,
  PERSONA_CREATIVE_AFFINITY_NOTE,
} from './persona';

describe('intentRungForActionType', () => {
  it('maps every conversion currency onto the one terminal rung', () => {
    for (const type of [
      'purchase',
      'offsite_conversion.fb_pixel_purchase',
      'lead',
      'onsite_conversion.lead_grouped',
      'onsite_conversion.messaging_conversation_started_7d',
    ]) {
      expect(intentRungForActionType(type)).toBe('conversion');
    }
  });

  it('maps the mid-funnel rungs', () => {
    expect(intentRungForActionType('omni_view_content')).toBe('view_content');
    expect(intentRungForActionType('add_to_cart')).toBe('add_to_cart');
    expect(intentRungForActionType('initiate_checkout')).toBe('checkout');
  });

  it('ignores interactions that are not steps toward buying', () => {
    for (const type of ['link_click', 'post_engagement', 'video_view', 'page_engagement']) {
      expect(intentRungForActionType(type)).toBeNull();
    }
  });
});

describe('foldIntentFunnel', () => {
  const slice = (spend: number, impressions: number, stages: Record<string, number>) => ({
    spend,
    impressions,
    clicks: 0,
    stages,
  });

  it('sums slices and derives every ratio from the totals', () => {
    const funnel = foldIntentFunnel([
      slice(100, 2000, { view_content: 60, add_to_cart: 20, checkout: 10, conversion: 5 }),
      slice(100, 2000, { view_content: 40, add_to_cart: 20, checkout: 10, conversion: 5 }),
    ]);

    expect(funnel.spend).toBe(200);
    expect(funnel.impressions).toBe(4000);
    expect(funnel.stages).toEqual({
      view_content: 100,
      add_to_cart: 40,
      checkout: 20,
      conversion: 10,
    });
    // Cost is derived from the SUMMED spend, not averaged per slice.
    expect(funnel.costPerStage.conversion).toBe(20);
    expect(funnel.intentDepth).toBe('conversion');
    expect(funnel.intentRate).toBe(0.0025);
    expect(funnel.progression.atcFromView).toBe(0.4);
  });

  it('reports the deepest rung reached, not the deepest requested', () => {
    const funnel = foldIntentFunnel([slice(50, 500, { view_content: 30, add_to_cart: 4 })]);
    expect(funnel.intentDepth).toBe('add_to_cart');
    expect(funnel.costPerStage.checkout).toBeNull();
    // Denominator existed, nobody progressed — 0, not null.
    expect(funnel.progression.checkoutFromAtc).toBe(0);
  });

  it('leaves spendShare null unless a total is supplied to compare against', () => {
    expect(foldIntentFunnel([slice(50, 500, {})]).spendShare).toBeNull();
    expect(foldIntentFunnel([slice(50, 500, {})], { totalSpend: 200 }).spendShare).toBe(0.25);
  });
});

describe('compareByIntentValue', () => {
  const funnelOf = (spend: number, stages: Record<string, number>) =>
    foldIntentFunnel([{ spend, impressions: 1000, clicks: 0, stages }]);

  it('ranks converting segments ahead of browsing ones, cheapest conversion first', () => {
    const cheap = funnelOf(100, { conversion: 10 });
    const dear = funnelOf(500, { conversion: 10 });
    const browsing = funnelOf(900, { view_content: 200 });

    const ranked = [browsing, dear, cheap].sort(compareByIntentValue);
    expect(ranked[0]).toBe(cheap);
    expect(ranked[1]).toBe(dear);
    expect(ranked[2]).toBe(browsing);
  });

  it('falls back to depth so a checkout beats a browse regardless of spend', () => {
    const deepButCheap = funnelOf(10, { view_content: 5, add_to_cart: 2, checkout: 1 });
    const shallowBigSpender = funnelOf(5000, { view_content: 900 });

    const ranked = [shallowBigSpender, deepButCheap].sort(compareByIntentValue);
    expect(ranked[0]).toBe(deepButCheap);
  });
});

describe('intentFunnelSchema', () => {
  it('distinguishes a zero progression from an absent one', () => {
    const parsed = intentFunnelSchema.parse({
      spend: 300,
      impressions: 6000,
      clicks: 40,
      stages: { view_content: 50, add_to_cart: 0, checkout: 0, conversion: 0 },
      costPerStage: { view_content: 6, add_to_cart: null, checkout: null, conversion: null },
      intentDepth: 'view_content',
      intentRate: null,
      progression: {
        // viewers existed and none carted — a finding
        atcFromView: 0,
        // no carts at all — nothing to say
        checkoutFromAtc: null,
        conversionFromCheckout: null,
      },
      spendShare: 0.6,
    });

    expect(parsed.progression.atcFromView).toBe(0);
    expect(parsed.progression.checkoutFromAtc).toBeNull();
    expect(parsed.intentDepth).toBe('view_content');
  });

  it("defaults a segment that never acted to depth 'none'", () => {
    const parsed = intentFunnelSchema.parse({ progression: {} });
    expect(parsed.intentDepth).toBe('none');
    expect(parsed.intentRate).toBeNull();
    expect(parsed.spendShare).toBeNull();
  });

  it('orders the ladder shallow to deep with one terminal conversion rung', () => {
    expect(INTENT_LADDER).toEqual(['view_content', 'add_to_cart', 'checkout', 'conversion']);
  });
});

describe('audiencePersonaSchema', () => {
  it('parses a persona with creative affinity, exemplars, and a targeting proposal', () => {
    const parsed = audiencePersonaSchema.parse({
      personaId: 'persona_age_25_34',
      label: 'Adults 25-34',
      dimension: 'age',
      segment: '25-34',
      funnel: {
        spend: 200,
        impressions: 4000,
        clicks: 60,
        stages: { view_content: 100, add_to_cart: 40, checkout: 20, conversion: 10 },
        costPerStage: { view_content: 2, add_to_cart: 5, checkout: 10, conversion: 20 },
        intentDepth: 'conversion',
        intentRate: 0.0025,
        progression: { atcFromView: 0.4, checkoutFromAtc: 0.5, conversionFromCheckout: 0.5 },
        spendShare: 0.4,
      },
      creativeAffinity: [
        { dimension: 'hook_archetype', value: 'social_proof', ads: 4, share: 0.62, flags: [] },
        {
          dimension: 'angle',
          value: 'salon results at home',
          ads: 2,
          share: 0.3,
          flags: ['low_evidence'],
        },
      ],
      exemplars: [
        {
          adId: 'ad_1',
          adName: 'UGC testimonial v3',
          angle: 'salon results at home',
          hookArchetype: 'social_proof',
          assetType: 'video',
          funnelStage: 'tof',
          spend: 120,
          libraryAssetId: 'asset_abc',
          posterUrl: 'https://example.test/poster.jpg',
        },
      ],
      proposedTargeting: {
        rationale: 'Segment converts at 2x the account median; behavior catalog match on shoppers.',
        spec: { age_min: 25, age_max: 34 },
        candidates: [
          {
            kind: 'behavior',
            id: '6002714895372',
            name: 'Engaged Shoppers',
            audienceSizeLowerBound: 1_000_000,
            distance: 0.21,
          },
        ],
        estimatedReach: { usersLowerBound: 900_000, usersUpperBound: 1_200_000 },
      },
      flags: ['spend_concentrated'],
      confidence: 0.7,
    });

    expect(parsed.funnel.intentDepth).toBe('conversion');
    expect(parsed.creativeAffinity[0]?.value).toBe('social_proof');
    // Trust vocabulary is shared with paid win-rates, not forked.
    expect(parsed.creativeAffinity[1]?.flags).toEqual(['low_evidence']);
    expect(parsed.flags).toEqual(['spend_concentrated']);
    // The library link is what lets headless generation reuse the asset.
    expect(parsed.exemplars[0]?.libraryAssetId).toBe('asset_abc');
    expect(parsed.proposedTargeting?.candidates[0]?.kind).toBe('behavior');
  });

  it('defaults an unlabeled exemplar to the shared unknown taxonomy values', () => {
    const parsed = audiencePersonaSchema.parse({
      personaId: 'p1',
      label: 'Unknown segment',
      dimension: 'gender',
      segment: 'unknown',
      funnel: { progression: {} },
      exemplars: [{ adId: 'ad_9' }],
    });

    expect(parsed.exemplars[0]?.hookArchetype).toBe('unknown');
    expect(parsed.exemplars[0]?.assetType).toBe('unknown');
    expect(parsed.exemplars[0]?.funnelStage).toBe('unknown');
    expect(parsed.proposedTargeting).toBeNull();
  });

  it('rejects a segment dimension Meta does not break down on', () => {
    const bad = audiencePersonaSchema.safeParse({
      personaId: 'p1',
      label: 'Bad',
      dimension: 'favourite_colour',
      segment: 'blue',
      funnel: { progression: {} },
    });
    expect(bad.success).toBe(false);
  });
});

describe('buyerIntentReportSchema', () => {
  it('ships the attribution caveat by default so it cannot be dropped', () => {
    const parsed = buyerIntentReportSchema.parse({
      brandId: 'brand_1',
      generatedAt: '2026-07-23T00:00:00.000Z',
    });

    expect(parsed.attributionNote).toBe(META_REPORTED_ATTRIBUTION_NOTE);
    expect(parsed.window).toBe('d30');
    expect(parsed.personas).toEqual([]);
    expect(parsed.sourceCounts.libraryMatched).toBe(0);
  });

  it('states that creative affinity is spend-weighted exposure, not preference', () => {
    expect(PERSONA_CREATIVE_AFFINITY_NOTE).toContain('not a controlled test');
  });
});
