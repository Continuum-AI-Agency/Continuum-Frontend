import { describe, expect, it } from 'bun:test';
import {
  isOpenAiAccountServable,
  OPENAI_ADS_MIN_LIFETIME_BUDGET_MICROS,
  openAiAdsAdCreateRequestSchema,
  openAiAdsAdGroupCreateRequestSchema,
  openAiAdsCampaignCreateRequestSchema,
  openAiAdsCampaignListSchema,
  openAiAdsCampaignTreeSchema,
  openAiAdsCampaignUpdateRequestSchema,
  openAiAdsCreativeInputSchema,
} from './openai-ads';

describe('openAiAdsCampaignCreateRequestSchema', () => {
  const budget = { lifetime_spend_limit_micros: 25_000_000 };

  it('defaults an unstated status to paused', () => {
    expect(
      openAiAdsCampaignCreateRequestSchema.parse({ name: 'Spring launch', budget }).status,
    ).toBe('paused');
  });

  it('rejects a name shorter than the API minimum', () => {
    expect(openAiAdsCampaignCreateRequestSchema.safeParse({ name: 'ab', budget }).success).toBe(
      false,
    );
  });

  it('rejects a budget below the API minimum', () => {
    const result = openAiAdsCampaignCreateRequestSchema.safeParse({
      name: 'Spring launch',
      budget: { lifetime_spend_limit_micros: OPENAI_ADS_MIN_LIFETIME_BUDGET_MICROS - 1 },
    });
    expect(result.success).toBe(false);
  });

  it('accepts one conversion event setting and refuses two', () => {
    const one = openAiAdsCampaignCreateRequestSchema.safeParse({
      name: 'Acme purchases',
      budget,
      bidding_type: 'conversions',
      conversion_event_setting_ids: ['ces_123'],
    });
    const two = openAiAdsCampaignCreateRequestSchema.safeParse({
      name: 'Acme purchases',
      budget,
      bidding_type: 'conversions',
      conversion_event_setting_ids: ['ces_123', 'ces_456'],
    });
    expect(one.success).toBe(true);
    expect(two.success).toBe(false);
  });

  it('carries location ids through targeting', () => {
    const parsed = openAiAdsCampaignCreateRequestSchema.parse({
      name: 'West Coast launch',
      budget,
      targeting: { locations: { include: [{ id: '2000043' }, { id: '3000194' }] } },
    });
    expect(parsed.targeting?.locations?.include.map((location) => location.id)).toEqual([
      '2000043',
      '3000194',
    ]);
  });
});

describe('openAiAdsCampaignUpdateRequestSchema', () => {
  // The API refuses both after creation, so the update schema must not carry them:
  // a control whose only outcome is an error is worse than no control.
  it('drops bidding_type and conversion_event_setting_ids', () => {
    const parsed = openAiAdsCampaignUpdateRequestSchema.parse({
      status: 'paused',
      bidding_type: 'clicks',
      conversion_event_setting_ids: ['ces_123'],
    });
    expect(parsed).not.toHaveProperty('bidding_type');
    expect(parsed).not.toHaveProperty('conversion_event_setting_ids');
  });

  it('allows archived, which create does not', () => {
    expect(openAiAdsCampaignUpdateRequestSchema.safeParse({ status: 'archived' }).success).toBe(
      true,
    );
    expect(
      openAiAdsCampaignCreateRequestSchema.safeParse({
        name: 'Spring launch',
        status: 'archived',
        budget: { lifetime_spend_limit_micros: 25_000_000 },
      }).success,
    ).toBe(false);
  });
});

describe('openAiAdsCreativeInputSchema', () => {
  const base = { title: 'Try the planner', body: 'Tasks, docs and meetings in one place.' };

  it('requires target_url and file_id for a chat_card', () => {
    expect(openAiAdsCreativeInputSchema.safeParse({ ...base, type: 'chat_card' }).success).toBe(
      false,
    );
    expect(
      openAiAdsCreativeInputSchema.safeParse({
        ...base,
        type: 'chat_card',
        target_url: 'https://example.com/planner',
      }).success,
    ).toBe(false);
    expect(
      openAiAdsCreativeInputSchema.safeParse({
        ...base,
        type: 'chat_card',
        target_url: 'https://example.com/planner',
        file_id: 'file_901',
      }).success,
    ).toBe(true);
  });

  it('lets a product_ad_template take its image and url from the feed item', () => {
    expect(
      openAiAdsCreativeInputSchema.safeParse({ ...base, type: 'product_ad_template' }).success,
    ).toBe(true);
  });

  it('enforces the title and body length ceilings', () => {
    expect(
      openAiAdsCreativeInputSchema.safeParse({
        ...base,
        title: 'x'.repeat(51),
        type: 'product_ad_template',
      }).success,
    ).toBe(false);
    expect(
      openAiAdsCreativeInputSchema.safeParse({
        ...base,
        body: 'x'.repeat(101),
        type: 'product_ad_template',
      }).success,
    ).toBe(false);
  });
});

describe('openAiAdsAdGroupCreateRequestSchema', () => {
  it('accepts the oCPC shape: click billing with a CPA bid', () => {
    const parsed = openAiAdsAdGroupCreateRequestSchema.parse({
      campaign_id: 'cmpn_101',
      name: 'US English',
      bidding_config: { billing_event_type: 'click', max_bid_micros: 100_000_000 },
    });
    expect(parsed.bidding_config.billing_event_type).toBe('click');
    expect(parsed.status).toBe('paused');
  });

  it('rejects a billing event the API does not define', () => {
    expect(
      openAiAdsAdGroupCreateRequestSchema.safeParse({
        campaign_id: 'cmpn_101',
        name: 'US English',
        bidding_config: { billing_event_type: 'conversion', max_bid_micros: 1 },
      }).success,
    ).toBe(false);
  });

  it('bounds a bid multiplier to the documented 0.1x - 10x range', () => {
    const outOfRange = openAiAdsAdGroupCreateRequestSchema.safeParse({
      campaign_id: 'cmpn_101',
      name: 'US English',
      bidding_config: {
        billing_event_type: 'click',
        max_bid_micros: 1,
        custom_audience_bid_multipliers: [
          { custom_audience_id: 'aud_1', bid_multiplier_micros: 99_999 },
        ],
      },
    });
    expect(outOfRange.success).toBe(false);
  });
});

describe('openAiAdsAdCreateRequestSchema', () => {
  it('builds a complete chat_card ad', () => {
    const parsed = openAiAdsAdCreateRequestSchema.parse({
      ad_group_id: 'adgrp_301',
      name: 'Planner launch card',
      creative: {
        type: 'chat_card',
        title: 'Try the new workspace planner',
        body: 'Coordinate tasks, docs, and meetings in one place.',
        target_url: 'https://example.com/workspace-planner',
        file_id: 'file_901',
      },
    });
    expect(parsed.status).toBe('paused');
    expect(parsed.creative.file_id).toBe('file_901');
  });
});

describe('response envelopes', () => {
  it('parses a list envelope with an absent count', () => {
    const parsed = openAiAdsCampaignListSchema.parse({
      object: 'list',
      data: [{ id: 'cmpn_101', name: 'Spring launch', status: 'active' }],
      has_more: false,
    });
    expect(parsed.data[0]?.id).toBe('cmpn_101');
  });

  it('parses a campaign tree with an ad group that has no ads yet', () => {
    const parsed = openAiAdsCampaignTreeSchema.parse({
      campaign: { id: 'cmpn_101', name: 'Spring launch', status: 'paused' },
      ad_groups: [{ ad_group: { id: 'adgrp_301', name: 'US English', status: 'paused' } }],
    });
    expect(parsed.ad_groups[0]?.ads).toEqual([]);
  });
});

describe('isOpenAiAccountServable', () => {
  it('is true only for an approved brand review', () => {
    expect(isOpenAiAccountServable({ id: 'adacct_1', review: { status: 'approved' } })).toBe(true);
    expect(
      isOpenAiAccountServable({
        id: 'adacct_1',
        review: { status: 'rejected', reason: 'missing_favicon' },
      }),
    ).toBe(false);
    expect(isOpenAiAccountServable({ id: 'adacct_1' })).toBe(false);
  });
});
