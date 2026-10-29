// The platform-only reads the engine's Google and TikTok rules need beyond the neutral
// snapshot (wave 8): search terms, keywords, bid targets, PMax asset groups and TikTok
// creative retention. Producers attach them per account and window; a rule that needs a
// signal the account does not carry stays silent and says so, never guesses.

import { z } from 'zod';
import { CurrencyCodeSchema } from '../paid/platform';

const count = z.number().int().nonnegative();
const amount = z.number().nonnegative();
const fraction = z.number().min(0).max(1);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const AdStrengthEnum = z.enum(['POOR', 'AVERAGE', 'GOOD', 'EXCELLENT', 'PENDING', 'UNSPECIFIED']);

/** Totals over the signal's window (spend in major units of the account currency). */
export const SignalWindowTotalsSchema = z.object({
  spend: amount,
  impressions: count,
  clicks: count,
  conversions: amount,
});

export const GoogleSearchTermSignalSchema = z.object({
  term: z.string().min(1),
  campaign_id: z.string().min(1),
  ad_group_id: z.string().min(1).nullable(),
  /** search_term_view.status: ADDED, EXCLUDED, ADDED_EXCLUDED or NONE. PMax terms carry null. */
  status: z.enum(['ADDED', 'EXCLUDED', 'ADDED_EXCLUDED', 'NONE']).nullable(),
  matched_keyword: z.string().min(1).nullable(),
  totals: SignalWindowTotalsSchema,
});

export const GoogleKeywordSignalSchema = z.object({
  criterion_id: z.string().min(1),
  ad_group_id: z.string().min(1),
  campaign_id: z.string().min(1),
  text: z.string().min(1),
  match_type: z.enum(['EXACT', 'PHRASE', 'BROAD']),
  status: z.enum(['ENABLED', 'PAUSED', 'REMOVED']),
  negative: z.boolean(),
  quality_score: z.number().int().min(1).max(10).nullable(),
  totals: SignalWindowTotalsSchema,
});

export const GoogleBidTargetSignalSchema = z.object({
  campaign_id: z.string().min(1),
  strategy: z.enum([
    'target_cpa',
    'target_roas',
    'maximize_conversions',
    'maximize_conversion_value',
    'manual',
    'other',
  ]),
  target_cpa: amount.nullable(),
  target_roas: z.number().nonnegative().nullable(),
  /** bidding_strategy_system_status: ENABLED, LEARNING_NEW, LEARNING_SETTING_CHANGE, … */
  system_status: z.string().min(1).nullable(),
  /** Last bid-target change from change_event, when known. */
  last_changed_at: z.string().datetime({ offset: true }).nullable(),
});

export const GoogleAssetGroupSignalSchema = z.object({
  asset_group_id: z.string().min(1),
  campaign_id: z.string().min(1),
  name: z.string().min(1),
  ad_strength: AdStrengthEnum.nullable(),
  primary_status: z.string().min(1).nullable(),
  /** asset_coverage.ad_strength_action_items, as Google words them. */
  missing: z.array(z.string().min(1)),
});

/** One ad of an ad group (G09, G10): its window totals and, for an RSA, the texts Google rates
 *  BEST (ad_group_ad_asset_view.performance_label). Paused ads are read too: "never leave a
 *  group with no active ad" counts what is enabled, and a paused ad is not compared. */
export const GoogleAdSignalSchema = z.object({
  ad_id: z.string().min(1),
  ad_group_id: z.string().min(1),
  ad_group_name: z.string().min(1),
  campaign_id: z.string().min(1),
  /** ad_group_ad.ad.type: RESPONSIVE_SEARCH_AD, RESPONSIVE_DISPLAY_AD, … */
  type: z.string().min(1),
  status: z.enum(['ENABLED', 'PAUSED']),
  ad_strength: AdStrengthEnum.nullable(),
  /** What a person recognises the ad by: its first headline, else its name, else its id. */
  label: z.string().min(1),
  best_assets: z.array(z.string().min(1)),
  totals: SignalWindowTotalsSchema,
});

/** One asset of a Performance Max asset group (G18_pmax_assets). Google reports per-asset
 *  metrics on asset_group_asset since the performance label was removed (v22): an asset is
 *  measured against the other assets of its field type in the same group, never across groups. */
export const GooglePmaxAssetSignalSchema = z.object({
  asset_id: z.string().min(1),
  asset_group_id: z.string().min(1),
  asset_group_name: z.string().min(1),
  campaign_id: z.string().min(1),
  /** asset_group_asset.field_type: HEADLINE, DESCRIPTION, MARKETING_IMAGE, YOUTUBE_VIDEO, … */
  field_type: z.string().min(1),
  /** The text of a text asset; null for an image or a video. */
  text: z.string().min(1).nullable(),
  /** asset_group_asset.primary_status: ELIGIBLE, LIMITED, PENDING, NOT_ELIGIBLE, … */
  primary_status: z.string().min(1).nullable(),
  totals: SignalWindowTotalsSchema,
});

/** How often the same people saw a campaign in the last 7 complete days (G23). */
export const GoogleAudienceSignalSchema = z.object({
  campaign_id: z.string().min(1),
  /** campaign.advertising_channel_type: SEARCH, DISPLAY, VIDEO, DEMAND_GEN, … */
  channel_type: z.string().min(1),
  /** metrics.average_impression_frequency_per_user; null when Google reports none. */
  frequency_7d: z.number().nonnegative().nullable(),
  unique_users_7d: count.nullable(),
});

export const TikTokCreativeDaySchema = z.object({
  date: day,
  impressions: count,
  clicks: count,
  spend: amount,
  results: amount,
  video_watched_2s: count,
  video_watched_6s: count,
  frequency: z.number().nonnegative().nullable(),
});

export const TikTokCreativeSignalSchema = z.object({
  ad_id: z.string().min(1),
  ad_group_id: z.string().min(1),
  name: z.string().min(1),
  identity_type: z.string().min(1).nullable(),
  tiktok_item_id: z.string().min(1).nullable(),
  dark_post: z.boolean().nullable(),
  created_at: z.string().datetime({ offset: true }).nullable(),
  days: z.array(TikTokCreativeDaySchema),
});

export const TikTokAdGroupSignalSchema = z.object({
  ad_group_id: z.string().min(1),
  optimization_goal: z.string().min(1).nullable(),
  click_attribution_window_days: count.nullable(),
  view_attribution_window_days: count.nullable(),
  bid_type: z.string().min(1).nullable(),
});

/** An organic TikTok post of the same brand (from organic.tiktok_videos), for Spark candidates. */
export const TikTokOrganicPostSignalSchema = z.object({
  post_id: z.string().min(1),
  caption: z.string(),
  posted_at: z.string().datetime({ offset: true }),
  views: count,
  engagement_rate: fraction.nullable(),
  promoted: z.boolean(),
});

/** Why a Google campaign or ad is not serving: primary_status + reasons, and ad policy. */
export const GoogleDeliverySignalSchema = z.object({
  campaign_id: z.string().min(1),
  campaign_name: z.string().min(1),
  /** campaign.primary_status: ELIGIBLE, LIMITED, NOT_ELIGIBLE, PAUSED, LEARNING, … */
  primary_status: z.string().min(1),
  primary_status_reasons: z.array(z.string().min(1)),
  /** campaign.serving_status: SERVING, SUSPENDED, ENDED, PENDING, NONE. Easy Fit 2026 reads
   *  primary_status ELIGIBLE with no reason while serving_status says SUSPENDED (billing). */
  serving_status: z.string().min(1).nullable().optional(),
  budget_per_day: amount.nullable(),
  /** Days in the window with zero impressions while ENABLED with budget. */
  dark_days: count,
  disapproved_ads: z.array(
    z.object({
      ad_id: z.string().min(1),
      /** policy_summary.approval_status: DISAPPROVED, APPROVED_LIMITED, … */
      approval_status: z.string().min(1),
      topics: z.array(z.string().min(1)),
    }),
  ),
});

/** Why a TikTok ad group or ad is not delivering: secondary_status and review results. */
export const TikTokDeliverySignalSchema = z.object({
  ad_group_id: z.string().min(1),
  ad_group_name: z.string().min(1),
  /** ADGROUP_STATUS_* secondary status as TikTok returns it. */
  secondary_status: z.string().min(1).nullable(),
  budget_per_day: amount.nullable(),
  dark_days: count,
  rejected_ads: z.array(
    z.object({
      ad_id: z.string().min(1),
      reasons: z.array(z.string().min(1)),
      suggestion: z.string().min(1).nullable(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// P8 (docs/jaina-google-goals/projects/P8-google-per-account.md): the per-account reads the
// account detectors need. Every block is optional — a read recorded before P8, or one whose
// GAQL failed, leaves it out and the detector that needs it abstains by name.
// ---------------------------------------------------------------------------

/** One conversion action of the account, with what each campaign reported for it over the
 *  window. `counted`/`excluded_reason` are conversion-rule.ts's verdict (the ONE definition);
 *  `reported` is what Google puts in metrics.conversions (primary actions only). */
export const GoogleConversionActionSignalSchema = z.object({
  conversion_action_id: z.string().min(1),
  name: z.string().min(1),
  /** conversion_action.category: SUBMIT_LEAD_FORM, CONTACT, PURCHASE, GET_DIRECTIONS, … */
  category: z.string().min(1).nullable(),
  /** conversion_action.type: WEBPAGE, GOOGLE_ANALYTICS_4_CUSTOM, CLICK_TO_CALL, … */
  type: z.string().min(1).nullable(),
  primary_for_goal: z.boolean().nullable(),
  /** conversion_action.status: ENABLED, HIDDEN or REMOVED. A removed action is read only while
   *  the window still holds conversions it recorded. */
  status: z.string().min(1).nullable(),
  /** GA4 event name for a GA4 import; null otherwise. */
  ga4_event_name: z.string().min(1).nullable(),
  /** The GA4 event is an attention event (conversion-rule.ts GA4_ENGAGEMENT_EVENTS), whether
   *  or not the action is primary: it measures a visit, never a contact. */
  ga4_engagement: z.boolean(),
  /** value_settings: the configured value per conversion and whether it is always used. */
  default_value: z.number().nonnegative().nullable(),
  always_use_default_value: z.boolean().nullable(),
  counted: z.boolean(),
  excluded_reason: z.enum(['no_bucket', 'not_in_goals', 'ga4_engagement_event']).nullable(),
  by_campaign: z.array(
    z.object({
      campaign_id: z.string().min(1),
      /** metrics.conversions: what Google reports (and bids toward). */
      reported: amount,
      /** metrics.all_conversions: every conversion, primary or not. */
      all: amount,
      value: amount,
    }),
  ),
});

/** Every campaign that is not removed, paused included, with its window totals and a longer
 *  60-day total (E2: a paused campaign that beat the active ones stopped before the window). */
export const GoogleCampaignSignalSchema = z.object({
  campaign_id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(['ENABLED', 'PAUSED']),
  /** campaign.advertising_channel_type: SEARCH, PERFORMANCE_MAX, DISPLAY, … */
  channel_type: z.string().min(1),
  budget_per_day: amount.nullable(),
  totals: SignalWindowTotalsSchema.extend({ conversions_value: amount }),
  totals_60d: SignalWindowTotalsSchema.extend({ conversions_value: amount }),
  /** Impression share lost to budget / to rank over the window (Search and Performance Max);
   *  null when Google reports none. */
  budget_lost_impression_share: fraction.nullable(),
  rank_lost_impression_share: fraction.nullable(),
});

/** The account's totals per day of the window. A day Google returns no row for reads zero:
 *  that is what a dark day is. */
export const GoogleAccountDaySignalSchema = z.object({
  date: day,
  spend: amount,
  impressions: count,
  clicks: count,
  conversions: amount,
});

/** Per campaign per device (segments.device: MOBILE, DESKTOP, TABLET, CONNECTED_TV, OTHER). */
export const GoogleDeviceSignalSchema = z.object({
  campaign_id: z.string().min(1),
  device: z.string().min(1),
  totals: SignalWindowTotalsSchema,
});

/** One open (not dismissed) recommendation Google makes on the account. Read, never applied. */
export const GoogleRecommendationSignalSchema = z.object({
  resource_name: z.string().min(1),
  /** recommendation.type: KEYWORD, CAMPAIGN_BUDGET, TARGET_CPA_OPT_IN, SITELINK_ASSET, … */
  type: z.string().min(1),
  campaign_id: z.string().min(1).nullable(),
});

/** Every ad group of a campaign that is not removed, removed groups included: names for
 *  service grouping (V5), course lines (P4) and the change-history checklist (P1), which names
 *  a group by id only — and a client's "pause this group" is often done by removing it. */
export const GoogleAdGroupSignalSchema = z.object({
  ad_group_id: z.string().min(1),
  campaign_id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(['ENABLED', 'PAUSED', 'REMOVED']),
  /** The distinct final URLs of the group's ads; empty when none is known. */
  final_urls: z.array(z.string().min(1)),
});

/** One change_event of the last 30 days, any resource type (P1's verification). */
export const GoogleChangeSignalSchema = z.object({
  changed_at: z.string().datetime({ offset: true }),
  /** change_event.change_resource_type: CAMPAIGN, AD_GROUP, AD_GROUP_CRITERION, AD, … */
  resource_type: z.string().min(1),
  /** CREATE, UPDATE or REMOVE. */
  operation: z.string().min(1).nullable(),
  campaign_id: z.string().min(1).nullable(),
  ad_group_id: z.string().min(1).nullable(),
  changed_fields: z.array(z.string().min(1)),
  /** GOOGLE_ADS_WEB_CLIENT, GOOGLE_ADS_API, … — who made it. */
  client_type: z.string().min(1).nullable(),
  /** The status the resource has after the change, when the event carries one. */
  new_status: z.string().min(1).nullable(),
});

/** A course or service line and the campaigns that sell it (P4): campaign ids first, name
 *  patterns as the fallback, and the share of spend the client agreed for it. */
export const GoogleCourseLineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  target_share: fraction,
  campaign_ids: z.array(z.string().min(1)),
  /** Case-insensitive substrings matched against campaign, then ad group, then term. */
  name_patterns: z.array(z.string().min(1)),
});

/** One agreed action the client executes (P1), with how change history proves it. */
export const GoogleChecklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  agreed_on: day,
  verify: z.object({
    resource_type: z.string().min(1),
    /** Case-insensitive substring of the campaign or ad group name the change must touch. */
    name_contains: z.string().min(1).nullable(),
    /** Regex source over the change's changed_fields. */
    field_pattern: z.string().min(1).nullable(),
    /** The status the resource must have after the change; null when any. */
    new_status: z.string().min(1).nullable(),
  }),
});

/** Where a profile list came from: the team stored it, or the edge inferred it this read. */
export const ProfileListSourceSchema = z.enum(['stored', 'inferred']);

/** The account's detector profile (paid_media.google_account_profiles): what the team stored,
 *  and — for each term list they left empty — what the edge inferred from the brand name, the
 *  customer name and the search terms. Every list says where it came from. */
export const GoogleAccountProfileSignalSchema = z.object({
  brand_name: z.string().min(1).nullable(),
  customer_name: z.string().min(1).nullable(),
  /** The client runs the account; we recommend and verify, we never write. */
  client_executes: z.boolean(),
  /** The brand name and its variants, normalized (lower case, no accents). */
  brand_terms: z.array(z.string().min(1)),
  brand_terms_source: ProfileListSourceSchema,
  /** Other brands the account's search terms name, normalized. */
  competitor_terms: z.array(z.string().min(1)),
  competitor_terms_source: ProfileListSourceSchema,
  /** Null when no split was agreed. */
  course_lines: z.array(GoogleCourseLineSchema).nullable(),
  checklist: z.array(GoogleChecklistItemSchema),
});

export const PlatformSignalsSchema = z.object({
  account_id: z.string().min(1),
  currency: CurrencyCodeSchema.nullable(),
  window: z.object({ since: day, until: day }),
  google: z
    .object({
      search_terms: z.array(GoogleSearchTermSignalSchema),
      keywords: z.array(GoogleKeywordSignalSchema),
      bid_targets: z.array(GoogleBidTargetSignalSchema),
      asset_groups: z.array(GoogleAssetGroupSignalSchema),
      /** Absent on signals recorded before wave 9. */
      delivery: z.array(GoogleDeliverySignalSchema).optional(),
      /** Absent on signals recorded before G7. */
      ads: z.array(GoogleAdSignalSchema).optional(),
      pmax_assets: z.array(GooglePmaxAssetSignalSchema).optional(),
      audience: z.array(GoogleAudienceSignalSchema).optional(),
      /** Absent on signals recorded before P8. */
      conversion_actions: z.array(GoogleConversionActionSignalSchema).optional(),
      campaigns: z.array(GoogleCampaignSignalSchema).optional(),
      account_daily: z.array(GoogleAccountDaySignalSchema).optional(),
      devices: z.array(GoogleDeviceSignalSchema).optional(),
      recommendations: z.array(GoogleRecommendationSignalSchema).optional(),
      ad_groups: z.array(GoogleAdGroupSignalSchema).optional(),
      changes: z.array(GoogleChangeSignalSchema).optional(),
      profile: GoogleAccountProfileSignalSchema.optional(),
    })
    .nullable(),
  tiktok: z
    .object({
      creatives: z.array(TikTokCreativeSignalSchema),
      ad_groups: z.array(TikTokAdGroupSignalSchema),
      organic_posts: z.array(TikTokOrganicPostSignalSchema),
      /** Absent on signals recorded before wave 9. */
      delivery: z.array(TikTokDeliverySignalSchema).optional(),
    })
    .nullable(),
});
export type PlatformSignals = z.infer<typeof PlatformSignalsSchema>;
export type GoogleAccountProfileSignal = z.infer<typeof GoogleAccountProfileSignalSchema>;
export type GoogleCourseLine = z.infer<typeof GoogleCourseLineSchema>;
export type GoogleChecklistItem = z.infer<typeof GoogleChecklistItemSchema>;
