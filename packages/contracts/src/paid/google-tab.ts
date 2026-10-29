// The Optimizer's Google tab: what the paid-media-metrics `google-ads` scopes answer the browser
// (account_overview, top_campaigns, keyword_quality, breakdown, google_signals), and the G07/G11
// constants its views and the engine's signal rules share. change_history is google-change-history.ts.
//
// Money is in MAJOR units of the customer's currency: the edge divides cost_micros by 1e6 once.
// A figure Google did not report is null, never zero. The edge (Deno) cannot import this package,
// so its compute tests parse the edge's own output with these schemas.

import { z } from 'zod';
import { PlatformSignalsSchema } from '../optimization/platform-signals';

/** G07: ±10% per target change. */
export const G07_STEP = 0.1;
/** G07: Smart Bidding relearns after a target change; one change per this many days. */
export const G07_COOLDOWN_DAYS = 14;
/** G11: a Quality Score at or under this is low. */
export const G11_MAX_QUALITY_SCORE = 3;

const RangeSchema = z.object({ since: z.string(), until: z.string() });

/** The customer's currency code, when the edge carries it. */
const CurrencyFields = {
  currency: z.string().nullable().optional(),
  currency_code: z.string().nullable().optional(),
};

/**
 * Which business result the edge counted as a conversion (`google_conversion_rule_v1`): the read's
 * `resultBucket` when it names one, else the one result the goals of the account's ENABLED
 * campaigns that delivered in the window name. When they name none or several, `unambiguous` is
 * false and the edge nulls every conversion count and CPA rather than add unlike things (each
 * row's `metrics.byResult` still counts them apart). Optional: older cached payloads lack it.
 */
export const GoogleResultBasisSchema = z.object({
  rule: z.string(),
  bucket: z.string().nullable(),
  unambiguous: z.boolean(),
});
export type GoogleResultBasis = z.infer<typeof GoogleResultBasisSchema>;

/** The business results the edge counts, and what a read's `resultBucket` may name. */
export const GOOGLE_RESULT_BUCKETS = ['leads', 'purchases', 'signups'] as const;
export type GoogleResultBucket = (typeof GOOGLE_RESULT_BUCKETS)[number];

const OBJECTIVE_RESULTS = new Map<string, GoogleResultBucket>([
  ['lead', 'leads'],
  ['purchase', 'purchases'],
  ['signup', 'signups'],
]);

/**
 * The result the Google tab counts (Ramiro, 2026-10-28): the one business result the brand's
 * portfolios with a Google side are held to, from their objectives. Null when there is no such
 * portfolio, one is held to no business result (traffic, awareness…), or they disagree; the tab
 * then shows each result type in its own column. Goals on the account's campaigns never decide it.
 */
export function googlePortfolioResult(
  objectives: readonly (string | null | undefined)[],
): GoogleResultBucket | null {
  const results = new Set(objectives.map((objective) => OBJECTIVE_RESULTS.get(objective ?? '')));
  const [only] = results;
  return results.size === 1 && only ? only : null;
}

/** Each business result's count over the window, whatever the basis. */
export const GoogleResultCountsSchema = z
  .object({ leads: z.number(), purchases: z.number(), signups: z.number() })
  .partial();
export type GoogleResultCounts = z.infer<typeof GoogleResultCountsSchema>;

const ComparisonValueSchema = z.object({
  current: z.number(),
  previous: z.number(),
  percentageChange: z.number().nullable().optional(),
});

export const GoogleAccountOverviewSchema = z.object({
  metrics: z.object({
    spend: z.number(),
    impressions: z.number(),
    clicks: z.number(),
    ctr: z.number(),
    /** Null when the result basis is ambiguous. */
    cpa: z.number().nullable(),
  }),
  comparison: z.object({ spend: ComparisonValueSchema }).partial().optional(),
  result_basis: GoogleResultBasisSchema.optional(),
  range: RangeSchema,
  ...CurrencyFields,
});
export type GoogleAccountOverview = z.infer<typeof GoogleAccountOverviewSchema>;

/** One entity's window totals (compute.ts mapEntityRowToMetrics). Conversions and their costs
 *  are null when the result basis is ambiguous. */
export const GoogleEntityMetricsSchema = z.object({
  spend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number().nullable(),
  conversionValue: z.number().optional(),
  roas: z.number().optional(),
  cpa: z.number().nullable().optional(),
  costPerConversion: z.number().nullable().optional(),
  ctr: z.number().optional(),
  cpc: z.number().optional(),
  cpm: z.number().optional(),
  /** Every business result the campaign counted, ambiguous basis or not: with no portfolio goal
   *  the tab shows one column per result. Absent on payloads cached before the edge sent it. */
  byResult: GoogleResultCountsSchema.optional(),
});
export type GoogleEntityMetrics = z.infer<typeof GoogleEntityMetricsSchema>;

/** A share 0–1. Google reports "under 10%" as 0.0999 and "over 90% lost" as 0.9001. */
const ShareSchema = z.number().min(0).max(1).nullable();

/**
 * What top_campaigns carries about the campaign itself (E1). Absent on payloads cached before the
 * edge selected it (up to 12h after the deploy), and on segment-filtered rankings.
 */
export const GoogleCampaignFieldsSchema = z.object({
  /** campaign.status: ENABLED, PAUSED. */
  status: z.string().nullable(),
  /** campaign.bidding_strategy_type: TARGET_CPA, MAXIMIZE_CONVERSIONS, MANUAL_CPC, … */
  bidding_strategy_type: z.string().nullable(),
  /** campaign.bidding_strategy_system_status: ENABLED, LEARNING_NEW, LEARNING_SETTING_CHANGE, … */
  bidding_strategy_system_status: z.string().nullable(),
  /** The campaign's own target (TARGET_CPA, or MAXIMIZE_CONVERSIONS with one). Null when none is
   *  set on the campaign: no target, or a portfolio bid strategy holds it. */
  target_cpa: z.number().nonnegative().nullable(),
  /** A ratio: 3.5 = 350%. */
  target_roas: z.number().nonnegative().nullable(),
  /** campaign_budget.amount_micros, in major units. */
  budget_per_day: z.number().nonnegative().nullable(),
  /** Google's own figure over the window. Search inventory only: Performance Max carries its
   *  Search share; Display, Video and Demand Gen report none. google_snapshots' d7 rebuilds it
   *  from daily rows and drifts from it on capped days and on Performance Max. */
  search_impression_share: ShareSchema,
  search_budget_lost_impression_share: ShareSchema,
  search_rank_lost_impression_share: ShareSchema,
});
export type GoogleCampaignFields = z.infer<typeof GoogleCampaignFieldsSchema>;

export const GoogleCampaignRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** `channel_type` (advertising_channel_type) when the query selected it. */
  labels: z.record(z.string(), z.string()).optional(),
  metrics: GoogleEntityMetricsSchema,
  google: GoogleCampaignFieldsSchema.optional(),
});
export type GoogleCampaignRow = z.infer<typeof GoogleCampaignRowSchema>;

export const GoogleTopCampaignsSchema = z.object({
  rows: z.array(GoogleCampaignRowSchema),
  result_basis: GoogleResultBasisSchema.optional(),
  range: RangeSchema,
  ...CurrencyFields,
});
export type GoogleTopCampaigns = z.infer<typeof GoogleTopCampaignsSchema>;

/** One keyword's Quality Score and its three components (keyword_quality scope). */
export const KeywordQualitySchema = z.object({
  criterion_id: z.string(),
  keyword: z.string(),
  match_type: z.string(),
  campaign: z.string(),
  ad_group: z.string(),
  /** 1–10. Null when Google has too little data to score the keyword yet. */
  quality_score: z.number().int().min(1).max(10).nullable(),
  /** Each component is BELOW_AVERAGE, AVERAGE or ABOVE_AVERAGE as Google returns it. */
  ad_relevance: z.string().nullable(),
  landing_page_experience: z.string().nullable(),
  expected_ctr: z.string().nullable(),
  metrics: GoogleEntityMetricsSchema,
});
export type KeywordQuality = z.infer<typeof KeywordQualitySchema>;

export const GoogleKeywordQualityReadSchema = z.object({
  scope: z.literal('keyword_quality'),
  range: RangeSchema,
  total_keywords: z.number().int().nonnegative(),
  scored_keywords: z.number().int().nonnegative(),
  /** Over scored keywords only: an unscored keyword is unknown, never a zero. */
  average_quality_score: z.number().nullable(),
  keywords: z.array(KeywordQualitySchema),
  ...CurrencyFields,
});
export type GoogleKeywordQualityRead = z.infer<typeof GoogleKeywordQualityReadSchema>;

export const GOOGLE_BREAKDOWN_DIMENSIONS = ['device', 'network', 'geo'] as const;
export type GoogleBreakdownDimension = (typeof GOOGLE_BREAKDOWN_DIMENSIONS)[number];

export const GoogleBreakdownRowSchema = z.object({
  id: z.string(),
  dimension: z.enum(GOOGLE_BREAKDOWN_DIMENSIONS),
  /** DESKTOP / MOBILE / …, SEARCH / CONTENT / …, or a country criterion id (no place name). */
  name: z.string(),
  campaign_id: z.string().optional(),
  ad_group_id: z.string().optional(),
  metrics: z.object({
    spend: z.number(),
    clicks: z.number(),
    impressions: z.number(),
    conversions: z.number().nullable(),
    cpa: z.number().nullable(),
    ctr: z.number().nullable(),
    cpm: z.number().nullable(),
    cvr: z.number().nullable(),
  }),
});
export type GoogleBreakdownRow = z.infer<typeof GoogleBreakdownRowSchema>;

export const GoogleBreakdownReadSchema = z.object({
  scope: z.literal('breakdown'),
  rows: z.array(GoogleBreakdownRowSchema),
  result_basis: GoogleResultBasisSchema,
  range: RangeSchema,
  ...CurrencyFields,
});
export type GoogleBreakdownRead = z.infer<typeof GoogleBreakdownReadSchema>;

/** The google_signals blocks a caller may ask for; each maps to its own GAQL reads. */
export const GOOGLE_SIGNAL_BLOCKS = [
  'search_terms',
  'keywords',
  'bid_targets',
  'asset_groups',
  'delivery',
  'ads',
  'pmax_assets',
  'audience',
] as const;
export type GoogleSignalBlock = (typeof GOOGLE_SIGNAL_BLOCKS)[number];

/** google_signals as the browser reads it (E2): only the blocks asked for are present. */
export const GoogleSignalsReadSchema = z.object({
  scope: z.literal('google_signals'),
  accountId: z.string(),
  timezone: z.string().nullable(),
  fetched_at: z.string(),
  /** The blocks this read holds; null when it holds all of them. */
  blocks: z.array(z.enum(GOOGLE_SIGNAL_BLOCKS)).nullable(),
  /** Null when the built signals failed the contract (`rejected` says why). */
  signals: PlatformSignalsSchema.pick({ account_id: true, currency: true, window: true })
    .extend({ google: PlatformSignalsSchema.shape.google.unwrap().partial() })
    .nullable(),
  /** Rows the edge could not read, counted per kind (`read_failed_<block>` for a failed read). */
  skipped: z.record(z.string(), z.number()),
  rejected: z.array(z.string()),
});
export type GoogleSignalsRead = z.infer<typeof GoogleSignalsReadSchema>;
