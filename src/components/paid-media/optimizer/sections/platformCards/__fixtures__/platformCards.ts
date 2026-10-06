// One card per variant, from the scenarios that motivate it (escenarios 01, 03, 05, 07, 09;
// frontend.html §5). Parsed through the contract, so a card the producer could not emit fails
// at import rather than in a render assertion.

import { type PlatformCard, PlatformCardSchema } from '@continuum/contracts';

const parse = (card: unknown): PlatformCard => PlatformCardSchema.parse(card);

/** Escenario 07, branch B: Vivo 47 loses 28% of impressions to budget, proposed +25%. */
export const GOOGLE_BUDGET_LIMITED = parse({
  variant: 'google_budget_limited',
  campaign_name: 'VIVO 47-EKATAR',
  budget_lost_impression_share: 0.28,
  days_limited: 6,
  currency: 'MXN',
  cost_per_result: 772.98,
  result_label: 'leads',
  budget_per_day: 1179,
  proposed_budget_per_day: 1473.75,
});

/** Escenario 03: PMax, what each asset group lacks — no per-group conversions. */
export const GOOGLE_PMAX = parse({
  variant: 'google_pmax_asset_group',
  campaign_name: 'PMax Necesidades SLP',
  asset_groups: [
    { name: 'Canadas', ad_strength: 'POOR', missing: ['3 vertical videos', '4 long headlines'] },
    { name: 'ITESO', ad_strength: 'EXCELLENT', missing: [] },
  ],
});

/** Escenario 05: a Video campaign the API cannot write. */
export const GOOGLE_VIDEO = parse({
  variant: 'google_video_readonly',
  campaign_name: 'Video | Vivo 47 | 2025',
  campaign_id: '22357506361',
  customer_id: '3710693645',
});

export const TIKTOK_FATIGUE = parse({
  variant: 'tiktok_creative_fatigue',
  ad_group_name: 'Leads MX · Spark',
  creative_name: '21-day challenge',
  ctr_now: 0.008,
  ctr_before: 0.021,
  days: 9,
  frequency: 4.3,
  replacement: { name: 'Post 22/09', ctr: 0.034 },
});

/** Escenario 09: TikTok spent 986 today, floor 1,035.30, the decrease lands at midnight. */
export const TIKTOK_SCHEDULED = parse({
  variant: 'tiktok_scheduled_decrease',
  ad_group_name: 'EF | Leads | Intereses fitness',
  currency: 'MXN',
  spent_today: 986,
  floor: 1035.3,
  budget_per_day: 1000,
  target_budget_per_day: 825,
  effective_at: '2026-10-01T06:00:00Z',
  timezone: 'America/Mexico_City',
});

/** Escenario 01: two TikTok ad groups give the same 4.23%, Meta takes it all. */
export const CROSS_PLATFORM_MOVE = parse({
  variant: 'cross_platform_move',
  currency: 'MXN',
  decrease_pct: 0.0423,
  legs: [
    {
      platform: 'tiktok_ads',
      entity_name: 'Ad group 201',
      from_per_day: 400,
      to_per_day: 383.08,
      scheduled_at: null,
    },
    {
      platform: 'tiktok_ads',
      entity_name: 'Ad group 202',
      from_per_day: 1000,
      to_per_day: 957.7,
      scheduled_at: '2026-10-01T06:00:00Z',
    },
    {
      platform: 'meta',
      entity_name: 'FORMULARIOS // TODOS',
      from_per_day: 324,
      to_per_day: 383.22,
      scheduled_at: null,
    },
  ],
});

/** Search terms that spend without a lead, on a gym's Search campaign. */
export const GOOGLE_NEGATIVE_TERMS = parse({
  variant: 'google_negative_terms',
  campaign_name: 'Search | Leads MX',
  currency: 'MXN',
  window_days: 14,
  terms: [
    { term: 'free gym', spend: 214, clicks: 38, conversions: 0 },
    { term: 'gym jobs', spend: 168, clicks: 29, conversions: 0 },
    { term: 'gym near me cheap', spend: 96, clicks: 17, conversions: 0 },
  ],
  savings_per_day: 34.14,
  match_type: 'EXACT',
});

/** A converting term that only comes in through a broad keyword. */
export const GOOGLE_PROMOTE_TERM = parse({
  variant: 'google_promote_term',
  campaign_name: 'Search | Leads MX',
  ad_group_name: 'Locations',
  term: '24 hour gym guadalajara',
  currency: 'MXN',
  window_days: 14,
  conversions: 19,
  cost_per_result: 22.1,
  matched_keyword: 'gym guadalajara',
});

/** Target CPA 35 while leads close at 31.4; the last change was 3 days ago. */
export const GOOGLE_BID_TARGET = parse({
  variant: 'google_bid_target',
  campaign_name: 'Search | Leads MX',
  currency: 'MXN',
  strategy: 'target_cpa',
  current_target: 35,
  actual: 31.4,
  proposed_target: 32,
  window_days: 14,
  days_since_last_change: 3,
});

export const GOOGLE_LOW_QUALITY_KEYWORD = parse({
  variant: 'google_low_quality_keyword',
  campaign_name: 'Search | Leads MX',
  ad_group_name: 'Generic',
  keyword: 'fitness classes',
  match_type: 'PHRASE',
  quality_score: 3,
  currency: 'MXN',
  spend: 412,
  conversions: 0,
  window_days: 14,
});

export const TIKTOK_HOOK_RETENTION = parse({
  variant: 'tiktok_hook_retention',
  ad_group_name: 'Leads MX · Interests',
  creative_name: 'Studio tour',
  hold_2s: 0.18,
  portfolio_hold_2s: 0.34,
  impressions: 42100,
  days_live: 6,
});

export const TIKTOK_SPARK_CANDIDATE = parse({
  variant: 'tiktok_spark_candidate',
  post_caption: 'Morning class in 30 seconds',
  post_id: '7420011223344556677',
  views: 48000,
  engagement_rate: 0.034,
  account_percentile: 92,
  target_ad_group_name: 'Leads MX · Spark',
});

/** TikTok documents 20× the cost per result; at 45 per lead that is 900/day. */
export const TIKTOK_BUDGET_BELOW_LEARNING = parse({
  variant: 'tiktok_budget_below_learning',
  ad_group_name: 'Leads MX · Broad',
  currency: 'MXN',
  budget_per_day: 300,
  cost_per_result: 45,
  required_multiple: 20,
  required_budget_per_day: 900,
  results_so_far: 4,
});

export const TIKTOK_ATTRIBUTION_WINDOW = parse({
  variant: 'tiktok_attribution_window',
  ad_group_name: 'Leads MX · Spark',
  click_window_days: 28,
  view_window_days: 1,
  compared_to: { platform: 'meta', click_window_days: 7, view_window_days: 1 },
});

export const EVERY_CARD = [
  GOOGLE_BUDGET_LIMITED,
  GOOGLE_PMAX,
  GOOGLE_VIDEO,
  TIKTOK_FATIGUE,
  TIKTOK_SCHEDULED,
  CROSS_PLATFORM_MOVE,
  GOOGLE_NEGATIVE_TERMS,
  GOOGLE_PROMOTE_TERM,
  GOOGLE_BID_TARGET,
  GOOGLE_LOW_QUALITY_KEYWORD,
  TIKTOK_HOOK_RETENTION,
  TIKTOK_SPARK_CANDIDATE,
  TIKTOK_BUDGET_BELOW_LEARNING,
  TIKTOK_ATTRIBUTION_WINDOW,
] as const;
