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
  ad_strength: z
    .enum(['POOR', 'AVERAGE', 'GOOD', 'EXCELLENT', 'PENDING', 'UNSPECIFIED'])
    .nullable(),
  primary_status: z.string().min(1).nullable(),
  /** asset_coverage.ad_strength_action_items, as Google words them. */
  missing: z.array(z.string().min(1)),
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
    })
    .nullable(),
  tiktok: z
    .object({
      creatives: z.array(TikTokCreativeSignalSchema),
      ad_groups: z.array(TikTokAdGroupSignalSchema),
      organic_posts: z.array(TikTokOrganicPostSignalSchema),
    })
    .nullable(),
});
export type PlatformSignals = z.infer<typeof PlatformSignalsSchema>;
