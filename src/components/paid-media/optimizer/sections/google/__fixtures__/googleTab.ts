// The lane-A Google sections' reads, around Vivo 47's recorded top_campaigns (September 2026,
// through the edge's own compute): the payload as cached before E1, the same rows with E1's
// `google` block, one Search portfolio holding three of them, a week of change history, and
// G03/G07 cards. Everything is parsed through its contract, so a shape the edge or the producer
// could not send fails at import.

import {
  type AccountCandidate,
  accountCandidateSchema,
  type GoogleCampaignFields,
  type GoogleChangeHistory,
  GoogleChangeHistorySchema,
  type GoogleTopCampaigns,
  GoogleTopCampaignsSchema,
} from '@continuum/contracts';
import recorded from '../../platforms/__fixtures__/google-vivo47-paid-media-metrics.json';
import type { CampaignGoal } from '../campaignExplorerModel';

export const NOW = new Date('2026-10-28T12:00:00Z');
export const PORTFOLIO_ID = '6a49e1a8-0000-4000-8000-000000000047';
export const EKATAR = '20775796216';
export const GOURMETERIA = '19954538151';
export const VALLE_REAL = '21985307202';
export const DISPLAY = '21287529107';

/** As the 12h cache serves it before E1: no `google` block on any row. */
export const BEFORE_E1: GoogleTopCampaigns = GoogleTopCampaignsSchema.parse({
  ...recorded.top_campaigns,
  currency: 'MXN',
});

const search = (over: Partial<GoogleCampaignFields>): GoogleCampaignFields => ({
  status: 'ENABLED',
  bidding_strategy_type: 'MAXIMIZE_CONVERSIONS',
  bidding_strategy_system_status: 'ENABLED',
  target_cpa: null,
  target_roas: null,
  budget_per_day: 500,
  search_impression_share: 0.42,
  search_budget_lost_impression_share: 0.1,
  search_rank_lost_impression_share: 0.48,
  ...over,
});

const display: GoogleCampaignFields = {
  status: 'ENABLED',
  bidding_strategy_type: 'MANUAL_CPC',
  bidding_strategy_system_status: 'ENABLED',
  target_cpa: null,
  target_roas: null,
  budget_per_day: 150,
  search_impression_share: null,
  search_budget_lost_impression_share: null,
  search_rank_lost_impression_share: null,
};

const E1: Record<string, GoogleCampaignFields> = {
  [EKATAR]: search({
    bidding_strategy_type: 'TARGET_CPA',
    target_cpa: 1200,
    budget_per_day: 1179,
    search_budget_lost_impression_share: 0.28,
    search_rank_lost_impression_share: 0.3,
  }),
  [GOURMETERIA]: search({ bidding_strategy_system_status: 'LEARNING_SETTING_CHANGE' }),
  [VALLE_REAL]: search({ budget_per_day: 120 }),
};

/** The same rows once the edge reads E1. */
export const WITH_E1: GoogleTopCampaigns = GoogleTopCampaignsSchema.parse({
  ...recorded.top_campaigns,
  currency: 'MXN',
  rows: recorded.top_campaigns.rows.map((row) => ({ ...row, google: E1[row.id] ?? display })),
});

/** Google's goals named no single result: the edge nulls every conversion count. */
export const AMBIGUOUS: GoogleTopCampaigns = GoogleTopCampaignsSchema.parse({
  ...recorded.top_campaigns,
  currency: 'MXN',
  result_basis: { rule: 'google_conversion_rule_v1', bucket: null, unambiguous: false },
  rows: recorded.top_campaigns.rows.map((row) => ({
    ...row,
    metrics: { ...row.metrics, conversions: null, cpa: null, costPerConversion: null },
  })),
});

export const EMPTY: GoogleTopCampaigns = GoogleTopCampaignsSchema.parse({
  ...recorded.top_campaigns,
  rows: [],
});

/** "Vivo 47 // Search leads": the three Search campaigns, at a 900 MXN CPA goal. */
export const SEARCH_GOAL: CampaignGoal = {
  portfolioId: PORTFOLIO_ID,
  portfolioName: 'Vivo 47 // Search leads',
  goal: 900,
  currency: 'MXN',
};

export const GOALS = new Map<string, CampaignGoal>([
  [EKATAR, SEARCH_GOAL],
  [GOURMETERIA, SEARCH_GOAL],
  [VALLE_REAL, SEARCH_GOAL],
]);

export const HISTORY: GoogleChangeHistory = GoogleChangeHistorySchema.parse({
  scope: 'change_history',
  customerId: '3710693645',
  currency: 'MXN',
  timeZone: 'America/Mexico_City',
  coverage: {
    requested: { since: '2026-09-28', until: '2026-10-29' },
    read: { since: '2026-09-29', until: '2026-10-28' },
    truncated: true,
    reason: 'change_event_30_day_limit',
  },
  changes: [
    {
      at: '2026-10-26T09:12:00.000-06:00',
      resourceType: 'CAMPAIGN_BUDGET',
      operation: 'UPDATE',
      campaignId: VALLE_REAL,
      campaignName: 'Valle Real-Search',
      changedFields: ['amount_micros'],
      clientType: 'GOOGLE_ADS_WEB_CLIENT',
      before: { budget: { minor: 10_000, currency: 'MXN' } },
      after: { budget: { minor: 12_000, currency: 'MXN' } },
    },
    {
      at: '2026-10-23T18:40:00.000-06:00',
      resourceType: 'CAMPAIGN',
      operation: 'UPDATE',
      campaignId: EKATAR,
      campaignName: 'VIVO 47-EKATAR',
      changedFields: ['target_cpa.target_cpa_micros'],
      clientType: 'GOOGLE_ADS_API',
      before: { targetCpa: { minor: 130_000, currency: 'MXN' } },
      after: { targetCpa: { minor: 120_000, currency: 'MXN' } },
    },
    {
      at: '2026-10-02T10:00:00.000-06:00',
      resourceType: 'AD_GROUP_AD',
      operation: 'CREATE',
      campaignId: DISPLAY,
      campaignName: 'Display',
      adGroupName: 'Banners',
      changedFields: [],
      clientType: 'GOOGLE_ADS_WEB_CLIENT',
    },
  ],
});

const GOOGLE_CAMPAIGN = (id: string, name: string) =>
  ({
    platform: 'google_ads',
    level: 'campaign',
    nativeLevel: 'campaign',
    id,
    accountId: '3710693645',
    name,
  }) as const;

/** G07 on EKATAR: Google's 1,200 MXN target, lowered 10% toward the 900 MXN goal. */
export const BID_CARD: AccountCandidate = accountCandidateSchema.parse({
  id: 'platform_signal:9b1c0000-0000-4000-8000-000000000007',
  detector: 'bid_strategy',
  portfolio_ids: [PORTFOLIO_ID],
  impact_per_day: 40,
  impact_class: 'better_price',
  impact_basis: 'G07',
  platform: 'google_ads',
  platform_card: {
    variant: 'google_bid_target',
    campaign_name: 'VIVO 47-EKATAR',
    currency: 'MXN',
    strategy: 'target_cpa',
    current_target: 1200,
    actual: 1422.48,
    proposed_target: 1080,
    window_days: 14,
    days_since_last_change: 15,
    portfolio_goal: 900,
  },
  card_action: {
    recommendation_id: '9b1c0000-0000-4000-8000-000000000007',
    portfolio_id: PORTFOLIO_ID,
    action: {
      kind: 'set_bid_target',
      ref: GOOGLE_CAMPAIGN(EKATAR, 'VIVO 47-EKATAR'),
      field: 'target_cpa_micros',
      expected: 1_200_000_000,
      target: 1_080_000_000,
    },
    apply_enabled: true,
  },
});

/** G03 on Valle Real: 120 MXN a day, losing 35% to budget, proposed 150. */
export const BUDGET_CARD: AccountCandidate = accountCandidateSchema.parse({
  id: 'platform_signal:9b1c0000-0000-4000-8000-000000000003',
  detector: 'auction_pressure',
  portfolio_ids: [PORTFOLIO_ID],
  impact_per_day: 30,
  impact_class: 'better_price',
  impact_basis: 'G03',
  platform: 'google_ads',
  platform_card: {
    variant: 'google_budget_limited',
    campaign_name: 'Valle Real-Search',
    budget_lost_impression_share: 0.35,
    days_limited: 5,
    currency: 'MXN',
    cost_per_result: 1326.42,
    result_label: 'leads',
    budget_per_day: 120,
    proposed_budget_per_day: 150,
  },
  card_action: {
    recommendation_id: '9b1c0000-0000-4000-8000-000000000003',
    portfolio_id: PORTFOLIO_ID,
    action: {
      kind: 'set_budget',
      ref: GOOGLE_CAMPAIGN(VALLE_REAL, 'Valle Real-Search'),
      budget: {
        kind: 'daily',
        minor: 12_000,
        currency: 'MXN',
        shared: false,
        ownerRef: GOOGLE_CAMPAIGN(VALLE_REAL, 'Valle Real-Search'),
      },
      expectedMinor: 12_000,
      targetMinor: 15_000,
    },
    apply_enabled: true,
  },
});
