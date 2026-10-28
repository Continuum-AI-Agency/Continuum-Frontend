import { describe, expect, test } from 'bun:test';
import {
  GoogleBreakdownReadSchema,
  GoogleSignalsReadSchema,
  GoogleTopCampaignsSchema,
  googlePortfolioResult,
} from './google-tab';

const range = { since: '2026-10-21', until: '2026-10-27' };
const row = (extra: Record<string, unknown> = {}) => ({
  id: '11',
  name: 'Search MX',
  labels: { channel_type: 'SEARCH' },
  metrics: { spend: 120.5, impressions: 900, clicks: 40, conversions: null, cpa: null },
  ...extra,
});

describe('GoogleTopCampaignsSchema', () => {
  test('reads a payload cached before E1: no `google` block, conversions nulled', () => {
    const parsed = GoogleTopCampaignsSchema.parse({ rows: [row()], range, currency: 'MXN' });
    expect(parsed.rows[0]?.google).toBeUndefined();
    expect(parsed.rows[0]?.metrics.conversions).toBeNull();
  });

  test('refuses a share outside 0–1 rather than print it', () => {
    const google = {
      status: 'ENABLED',
      bidding_strategy_type: 'TARGET_CPA',
      bidding_strategy_system_status: 'ENABLED',
      target_cpa: 85.47,
      target_roas: null,
      budget_per_day: 500,
      search_impression_share: 42,
      search_budget_lost_impression_share: null,
      search_rank_lost_impression_share: null,
    };
    expect(GoogleTopCampaignsSchema.safeParse({ rows: [row({ google })], range }).success).toBe(
      false,
    );
  });

  test('keeps each result type apart when the basis is ambiguous', () => {
    const metrics = { ...row().metrics, byResult: { leads: 245.5, signups: 2 } };
    const parsed = GoogleTopCampaignsSchema.parse({ rows: [row({ metrics })], range });
    expect(parsed.rows[0]?.metrics.conversions).toBeNull();
    expect(parsed.rows[0]?.metrics.byResult).toEqual({ leads: 245.5, signups: 2 });
  });
});

describe('googlePortfolioResult', () => {
  test("the one business result the brand's Google portfolios are held to", () => {
    expect(googlePortfolioResult(['lead', 'lead'])).toBe('leads');
    expect(googlePortfolioResult(['purchase'])).toBe('purchases');
    expect(googlePortfolioResult(['signup'])).toBe('signups');
  });

  test('no single goal: none, disagreeing, or one held to no business result', () => {
    expect(googlePortfolioResult([])).toBeNull();
    expect(googlePortfolioResult(['lead', 'purchase'])).toBeNull();
    expect(googlePortfolioResult(['lead', 'traffic'])).toBeNull();
    expect(googlePortfolioResult(['awareness'])).toBeNull();
    expect(googlePortfolioResult([null, 'toString'])).toBeNull();
  });
});

describe('GoogleSignalsReadSchema', () => {
  test('holds only the blocks asked for', () => {
    const parsed = GoogleSignalsReadSchema.parse({
      scope: 'google_signals',
      platform: 'google_ads',
      accountId: '3710693645',
      timezone: 'America/Mexico_City',
      fetched_at: '2026-10-28T18:00:00.000Z',
      blocks: ['bid_targets'],
      signals: {
        account_id: '3710693645',
        currency: 'MXN',
        window: range,
        google: {
          bid_targets: [
            {
              campaign_id: '11',
              strategy: 'target_cpa',
              target_cpa: 85.47,
              target_roas: null,
              system_status: 'ENABLED',
              last_changed_at: null,
            },
          ],
        },
        tiktok: null,
      },
      skipped: {},
      rejected: [],
    });
    expect(Object.keys(parsed.signals?.google ?? {})).toEqual(['bid_targets']);
  });
});

describe('GoogleBreakdownReadSchema', () => {
  test('reads a country row with no place name and an unknown result', () => {
    const basis = { rule: 'google_conversion_rule_v1', bucket: null, unambiguous: false };
    const parsed = GoogleBreakdownReadSchema.parse({
      scope: 'breakdown',
      rows: [
        {
          id: 'geo:2484',
          dimension: 'geo',
          name: '2484',
          metrics: {
            spend: 10,
            clicks: 2,
            impressions: 50,
            conversions: null,
            results: null,
            cpa: null,
            ctr: 4,
            cpm: 200,
            cvr: null,
          },
          result_basis: basis,
        },
      ],
      result_basis: basis,
      range: { ...range, preset: 'custom' },
      currency: 'MXN',
    });
    expect(parsed.rows[0]?.name).toBe('2484');
  });
});
