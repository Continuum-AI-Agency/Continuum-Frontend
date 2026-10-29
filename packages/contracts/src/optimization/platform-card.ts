// What a recommendation card needs to say when its subject only exists on Google or TikTok
// (docs/optimizer-multiplatform/frontend.html §5; escenarios 01, 03, 05, 07, 09). It rides on
// the account candidate as `platform_card`; a row without it renders today's generic card, so
// every producer adopts it one variant at a time and nothing written before it changes.
//
// Every figure is the producer's, never the card's: the card states the impression share lost
// to budget, what an asset group is missing, a fatigued creative's CTR before and after, or a
// move's legs — it computes none of them.

import { z } from 'zod';
import { CurrencyCodeSchema, PlatformIdSchema } from '../paid/platform';

const money = z.number().nonnegative();
const share = z.number().min(0).max(1);
const instant = z.string().datetime({ offset: true });

/** Search limited by budget (G03, escenario 07): the share of impressions lost to budget,
 *  and what the result costs, so "spend more" is weighed against the price. */
export const GoogleBudgetLimitedCardSchema = z.object({
  variant: z.literal('google_budget_limited'),
  campaign_name: z.string().min(1),
  /** search_budget_lost_impression_share over the window, 0..1. */
  budget_lost_impression_share: share,
  /** Consecutive days marked LIMITED · BUDGET_CONSTRAINED; null when unknown. */
  days_limited: z.number().int().positive().nullable(),
  currency: CurrencyCodeSchema.nullable(),
  cost_per_result: z.number().positive().nullable(),
  result_label: z.string().min(1),
  budget_per_day: money,
  /** The budget the engine proposes; null when it proposes none (no target, cost too high). */
  proposed_budget_per_day: money.nullable(),
  /** What the proposed budget is expected to buy (feature 14), as a range because Google does
   *  not sell the lost impressions at today's price. Absent on cards written before it; null
   *  when there is no proposal or too little history to project. */
  projection: z
    .object({
      results_per_day_now: z.number().nonnegative(),
      results_per_day_low: z.number().nonnegative(),
      results_per_day_high: z.number().nonnegative(),
      /** Days of history the projection stands on. */
      basis_days: z.number().int().positive(),
    })
    .refine((p) => p.results_per_day_low <= p.results_per_day_high, {
      message: 'results_per_day_low must not exceed results_per_day_high',
    })
    .nullable()
    .optional(),
});

export const AdStrengthSchema = z.enum([
  'POOR',
  'AVERAGE',
  'GOOD',
  'EXCELLENT',
  'PENDING',
  'UNSPECIFIED',
]);

/** Performance Max (escenario 03): Google reports no conversions per asset group, only what
 *  each one is missing — so the card says that, and never a per-group cost. */
export const GooglePmaxAssetGroupCardSchema = z.object({
  variant: z.literal('google_pmax_asset_group'),
  campaign_name: z.string().min(1),
  asset_groups: z
    .array(
      z.object({
        name: z.string().min(1),
        ad_strength: AdStrengthSchema.nullable(),
        /** "3 vertical videos", "4 long headlines" — empty when nothing is missing. */
        missing: z.array(z.string().min(1)),
      }),
    )
    .min(1),
});

/** A Video campaign (escenario 05): Google's API does not pause or re-budget it, so the card
 *  reads only and sends a person to Google Ads. */
export const GoogleVideoReadOnlyCardSchema = z.object({
  variant: z.literal('google_video_readonly'),
  campaign_name: z.string().min(1),
  campaign_id: z.string().min(1),
  customer_id: z.string().min(1),
});

/** TikTok creative fatigue: the same video too long, CTR falling with frequency rising. */
export const TikTokCreativeFatigueCardSchema = z.object({
  variant: z.literal('tiktok_creative_fatigue'),
  ad_group_name: z.string().min(1),
  creative_name: z.string().min(1),
  /** CTR as a fraction: 0.008 is 0.8%. */
  ctr_now: share,
  ctr_before: share,
  /** Days the CTR took to fall from before to now. */
  days: z.number().int().positive(),
  frequency: z.number().positive().nullable(),
  replacement: z.object({ name: z.string().min(1), ctr: share }).nullable(),
});

/** The same fatigue card for a Meta ad set (frontend.html §7 feature 18), so a fatigued
 *  creative reads alike on every platform. Figures are the producer's: CTR before and now,
 *  the days the fall took, frequency, and the ad set's best other creative when it has one. */
export const MetaCreativeFatigueCardSchema = z.object({
  variant: z.literal('meta_creative_fatigue'),
  ad_set_name: z.string().min(1),
  creative_name: z.string().min(1),
  /** CTR as a fraction: 0.008 is 0.8%. */
  ctr_now: share,
  ctr_before: share,
  days: z.number().int().positive(),
  frequency: z.number().positive().nullable(),
  replacement: z.object({ name: z.string().min(1), ctr: share }).nullable(),
});

/** TikTok refuses a budget under 105% of today's spend (escenario 09), so a decrease is
 *  scheduled for the advertiser's next midnight instead of written now. */
export const TikTokScheduledDecreaseCardSchema = z
  .object({
    variant: z.literal('tiktok_scheduled_decrease'),
    ad_group_name: z.string().min(1),
    currency: CurrencyCodeSchema.nullable(),
    spent_today: money,
    /** 1.05 × spent_today: the lowest budget TikTok accepts today. */
    floor: money,
    budget_per_day: money,
    target_budget_per_day: money,
    /** When the scheduled budget takes effect. */
    effective_at: instant,
    /** The advertiser's timezone, which "midnight" is in. */
    timezone: z.string().min(1).nullable(),
  })
  .refine((card) => card.target_budget_per_day < card.budget_per_day, {
    message: 'a scheduled decrease lowers the budget',
    path: ['target_budget_per_day'],
  });

export const CrossPlatformLegSchema = z.object({
  platform: PlatformIdSchema,
  entity_name: z.string().min(1),
  from_per_day: money,
  to_per_day: money,
  /** Set when the platform takes the leg later (TikTok's 105% floor): when it lands. */
  scheduled_at: instant.nullable(),
});
export type CrossPlatformLeg = z.infer<typeof CrossPlatformLegSchema>;

/** Within a tenth of a point: the producer rounds each leg to the platform's budget unit. */
const SAME_PCT_TOLERANCE = 0.001;

/** A move between platforms (G27, escenario 01): every leg that gives money gives the same
 *  percentage, and the move takes off exactly what it puts on. */
export const CrossPlatformMoveCardSchema = z
  .object({
    variant: z.literal('cross_platform_move'),
    currency: CurrencyCodeSchema,
    /** The one percentage every decreasing leg gives, as a fraction (0.0423 = 4.23%). */
    decrease_pct: z.number().positive().max(1),
    legs: z.array(CrossPlatformLegSchema).min(2),
  })
  .superRefine((card, ctx) => {
    const decreases = card.legs.filter((leg) => leg.to_per_day < leg.from_per_day);
    const increases = card.legs.filter((leg) => leg.to_per_day > leg.from_per_day);
    if (decreases.length === 0 || increases.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'a move has a leg that gives and a leg that takes',
        path: ['legs'],
      });
      return;
    }
    const uneven = decreases.some(
      (leg) =>
        leg.from_per_day === 0 ||
        Math.abs((leg.from_per_day - leg.to_per_day) / leg.from_per_day - card.decrease_pct) >
          SAME_PCT_TOLERANCE,
    );
    if (uneven) {
      ctx.addIssue({
        code: 'custom',
        message: 'every decreasing leg gives the same percentage',
        path: ['decrease_pct'],
      });
    }
    const net = card.legs.reduce((sum, leg) => sum + (leg.to_per_day - leg.from_per_day), 0);
    if (Math.round(net * 100) !== 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'a move takes off exactly what it puts on',
        path: ['legs'],
      });
    }
  });

/** Search terms that spend without a result (G05, escenario 08's neighbour): the card lists the
 *  terms, what they cost, and the list they would join. Never terms that are also keywords. */
export const GoogleNegativeTermsCardSchema = z.object({
  variant: z.literal('google_negative_terms'),
  campaign_name: z.string().min(1),
  currency: CurrencyCodeSchema.nullable(),
  window_days: z.number().int().positive(),
  terms: z
    .array(
      z.object({
        term: z.string().min(1),
        spend: money,
        clicks: z.number().int().nonnegative(),
        conversions: z.number().nonnegative(),
      }),
    )
    .min(1),
  /** Spend per day the negatives would stop, from the producer. */
  savings_per_day: money,
  match_type: z.enum(['EXACT', 'PHRASE']),
});

/** A search term that converts but is not a keyword yet: promote it to an exact keyword. */
export const GooglePromoteTermCardSchema = z.object({
  variant: z.literal('google_promote_term'),
  campaign_name: z.string().min(1),
  ad_group_name: z.string().min(1),
  term: z.string().min(1),
  currency: CurrencyCodeSchema.nullable(),
  window_days: z.number().int().positive(),
  conversions: z.number().positive(),
  cost_per_result: z.number().positive().nullable(),
  /** The keyword it currently matches through, when Google reports it. */
  matched_keyword: z.string().min(1).nullable(),
});

/** Google Ads bid target adjustment (G07): Google's own target (a bid setting on the
 *  platform), the real cost over the window, the proposal, and the cooldown since the last bid
 *  change (Smart Bidding relearns). Two different numbers live here and are never the same
 *  thing: `current_target`/`proposed_target` are the Google Ads bid setting; `portfolio_goal` is
 *  the portfolio's CPA goal the move serves, never pushed to Google. */
export const GoogleBidTargetCardSchema = z.object({
  variant: z.literal('google_bid_target'),
  campaign_name: z.string().min(1),
  currency: CurrencyCodeSchema.nullable(),
  strategy: z.enum(['target_cpa', 'target_roas']),
  /** The Google Ads target CPA (bid setting) as it stands on the platform. */
  current_target: z.number().positive(),
  actual: z.number().positive().nullable(),
  /** The Google Ads target CPA (bid setting) the card proposes. */
  proposed_target: z.number().positive(),
  window_days: z.number().int().positive(),
  days_since_last_change: z.number().int().nonnegative().nullable(),
  /** The portfolio's CPA goal in `currency`: what the move serves. Optional for cards written
   *  before the rule priced against it. */
  portfolio_goal: z.number().positive().nullable().optional(),
});

/** A keyword with a very low Quality Score that spends without results (G11). */
export const GoogleLowQualityKeywordCardSchema = z.object({
  variant: z.literal('google_low_quality_keyword'),
  campaign_name: z.string().min(1),
  ad_group_name: z.string().min(1),
  keyword: z.string().min(1),
  match_type: z.enum(['EXACT', 'PHRASE', 'BROAD']),
  quality_score: z.number().int().min(1).max(10),
  currency: CurrencyCodeSchema.nullable(),
  spend: money,
  conversions: z.number().nonnegative(),
  window_days: z.number().int().positive(),
});

/** TikTok weak hook (T1): the share of viewers who stay past 2 seconds, against the portfolio. */
export const TikTokHookRetentionCardSchema = z.object({
  variant: z.literal('tiktok_hook_retention'),
  ad_group_name: z.string().min(1),
  creative_name: z.string().min(1),
  /** video_watched_2s / impressions, 0..1. */
  hold_2s: share,
  portfolio_hold_2s: share,
  impressions: z.number().int().positive(),
  days_live: z.number().int().nonnegative(),
});

/** TikTok organic post worth a Spark Ad (T5): views and CTR of the organic post, and when the
 *  creator's authorization would have to be requested. */
export const TikTokSparkCandidateCardSchema = z.object({
  variant: z.literal('tiktok_spark_candidate'),
  post_caption: z.string().min(1),
  post_id: z.string().min(1),
  views: z.number().int().nonnegative(),
  /** Profile CTR or engagement rate as a fraction, from the organic read. */
  engagement_rate: share,
  account_percentile: z.number().min(0).max(100).nullable(),
  target_ad_group_name: z.string().min(1).nullable(),
});

/** TikTok budget under what the learning phase needs (T7): the multiple TikTok documents. */
export const TikTokBudgetBelowLearningCardSchema = z.object({
  variant: z.literal('tiktok_budget_below_learning'),
  ad_group_name: z.string().min(1),
  currency: CurrencyCodeSchema.nullable(),
  budget_per_day: money,
  cost_per_result: z.number().positive().nullable(),
  /** The multiple of CPA TikTok documents for this optimization goal (10, 20 or 50). */
  required_multiple: z.number().positive(),
  required_budget_per_day: money,
  results_so_far: z.number().nonnegative(),
});

/** A TikTok ad group whose attribution window differs from Meta's 7-day click / 1-day view
 *  (T12, escenario 27): platforms are not compared until the windows match. */
export const TikTokAttributionWindowCardSchema = z.object({
  variant: z.literal('tiktok_attribution_window'),
  ad_group_name: z.string().min(1),
  click_window_days: z.number().int().nonnegative(),
  view_window_days: z.number().int().nonnegative(),
  compared_to: z.object({
    platform: PlatformIdSchema,
    click_window_days: z.number().int(),
    view_window_days: z.number().int(),
  }),
});

/** A Google campaign that is not serving for a reason Google names (policy, billing, no
 *  eligible ads): the card quotes Google's reason and sends a person to fix it there. */
export const GoogleDeliveryIssueCardSchema = z.object({
  variant: z.literal('google_delivery_issue'),
  campaign_name: z.string().min(1),
  /** Google's own reason codes, e.g. HAS_ADS_DISAPPROVED, BUDGET_CONSTRAINED. */
  reasons: z.array(z.string().min(1)).min(1),
  dark_days: z.number().int().nonnegative(),
  currency: CurrencyCodeSchema.nullable(),
  budget_per_day: money.nullable(),
  disapproved_ads: z.number().int().nonnegative(),
  /** True when every enabled campaign of the account is dark: one cause, one card. */
  account_wide: z.boolean(),
});

/** A TikTok ad group that is not delivering, with TikTok's own status and review reasons. */
export const TikTokDeliveryIssueCardSchema = z.object({
  variant: z.literal('tiktok_delivery_issue'),
  ad_group_name: z.string().min(1),
  secondary_status: z.string().min(1).nullable(),
  dark_days: z.number().int().nonnegative(),
  rejected_ads: z.array(
    z.object({ reasons: z.array(z.string().min(1)), suggestion: z.string().min(1).nullable() }),
  ),
});

/** A priced figure the G7 cards compare against: what a person recognises it by and its cost
 *  per result over the card's window. */
const PricedSubjectSchema = z.object({
  label: z.string().min(1),
  cost_per_result: z.number().positive(),
});

/** An ad that drags its ad group (G09, inherits C1): it holds most of the group's spend at a
 *  cost well above the group's best ad, or it spent past the target without one result. The
 *  pause leaves the group at least one enabled ad. */
export const GoogleAdDragCardSchema = z.object({
  variant: z.literal('google_ad_drag'),
  campaign_name: z.string().min(1),
  ad_group_name: z.string().min(1),
  ad_label: z.string().min(1),
  currency: CurrencyCodeSchema.nullable(),
  window_days: z.number().int().positive(),
  spend: money,
  /** The ad's share of its ad group's spend over the window, 0..1. */
  spend_share: share,
  conversions: z.number().nonnegative(),
  /** Null when the ad bought nothing: there is no price to print. */
  cost_per_result: z.number().positive().nullable(),
  /** The group's cheapest ad, when one is priced. */
  winner: PricedSubjectSchema.nullable(),
  /** Enabled ads the group keeps once this one is paused. */
  ads_remaining: z.number().int().positive(),
});

/** A winning ad worth varying (G10, inherits C2): the cheapest ad of its group, the priced
 *  sibling it beats, and the texts Google rates BEST in it — what the new ad starts from. */
export const GoogleAdWinnerCardSchema = z
  .object({
    variant: z.literal('google_ad_winner'),
    campaign_name: z.string().min(1),
    ad_group_name: z.string().min(1),
    currency: CurrencyCodeSchema.nullable(),
    window_days: z.number().int().positive(),
    winner: PricedSubjectSchema.extend({ conversions: z.number().positive() }),
    comparator: PricedSubjectSchema,
    best_assets: z.array(z.string().min(1)),
  })
  .refine((card) => card.comparator.cost_per_result > card.winner.cost_per_result, {
    message: 'the comparator costs more per result than the winner',
    path: ['comparator'],
  });

/** The same people seeing a campaign too often while each result gets dearer (G23, inherits
 *  F2): the 7-day frequency against its cap, and the cost per result before and now. */
export const GoogleAudienceSaturationCardSchema = z
  .object({
    variant: z.literal('google_audience_saturation'),
    campaign_name: z.string().min(1),
    /** campaign.advertising_channel_type: DISPLAY, VIDEO, DEMAND_GEN. */
    channel_type: z.string().min(1),
    frequency: z.number().positive(),
    frequency_cap: z.number().positive(),
    unique_users: z.number().int().nonnegative().nullable(),
    currency: CurrencyCodeSchema.nullable(),
    /** Cost per result over the last 3 days and over the last 14. */
    cost_per_result_now: z.number().positive(),
    cost_per_result_before: z.number().positive(),
  })
  .refine((card) => card.cost_per_result_now > card.cost_per_result_before, {
    message: 'saturation is a cost per result that rose',
    path: ['cost_per_result_now'],
  });

/** Performance Max assets that drag their asset group (G18_pmax_assets): each one is measured
 *  against the best asset of its own field type in the same group, from Google's per-asset
 *  metrics. No write: a replacement is made first and reviewed before the old one goes. */
export const GooglePmaxAssetsCardSchema = z.object({
  variant: z.literal('google_pmax_assets'),
  campaign_name: z.string().min(1),
  asset_group_name: z.string().min(1),
  currency: CurrencyCodeSchema.nullable(),
  window_days: z.number().int().positive(),
  assets: z
    .array(
      z.object({
        /** HEADLINE, DESCRIPTION, MARKETING_IMAGE, YOUTUBE_VIDEO, … */
        field_type: z.string().min(1),
        label: z.string().min(1),
        spend: money,
        conversions: z.number().nonnegative(),
        /** Null when the asset bought nothing. */
        cost_per_result: z.number().positive().nullable(),
        best_of_kind: PricedSubjectSchema,
      }),
    )
    .min(1),
});

/** The P8 account ideas (docs/jaina-google-goals/detalles.html §6): each fires on any
 *  Google account that shows its pattern. Named by the pattern, not by the account that
 *  inspired it. */
export const GOOGLE_ACCOUNT_IDEAS = [
  'inflated_primary_conversion',
  'brand_vs_nonbrand',
  'capped_budget_locked',
  'pmax_rescue_or_pause',
  'quality_score_by_service',
  'continuity_calendar',
  'paused_beat_active',
  'conversion_value_map',
  'competitor_terms',
  'google_recommendations_filtered',
  'client_executes_checklist',
  'device_split',
  'intent_negatives',
  'course_line_split',
  'lead_to_sale_funnel',
] as const;
export const GoogleAccountIdeaSchema = z.enum(GOOGLE_ACCOUNT_IDEAS);
export type GoogleAccountIdea = z.infer<typeof GoogleAccountIdeaSchema>;

/** A finding about the whole account or one campaign (P8). The card states the producer's
 *  figures and what a person should do; it carries no write — every P8 idea is recommend-only,
 *  and on an account the client runs (`recommend_only`) the card offers no control at all. */
export const GoogleAccountFindingCardSchema = z.object({
  variant: z.literal('google_account_finding'),
  idea: GoogleAccountIdeaSchema,
  headline: z.string().min(1),
  /** The campaign the finding is about; null when it is about the whole account. */
  campaign_name: z.string().min(1).nullable(),
  currency: CurrencyCodeSchema.nullable(),
  window_days: z.number().int().positive(),
  /** The client executes the account: recommend and verify, never a write control. */
  recommend_only: z.boolean(),
  /** The figures, already worded by the producer ("Real cost per lead", "$1,151 MXN"). */
  facts: z
    .array(z.object({ label: z.string().min(1), value: z.string().min(1) }))
    .min(1),
  /** Bars the card draws: one value per row in `unit`, and the agreed share when there is one. */
  bars: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.number().nonnegative(),
        /** 0..1 of the bars' total, when the bars split a whole. */
        share: share.nullable(),
        target_share: share.nullable(),
        /** The bar is the problem (dark day, the brand, the wrong device). */
        flagged: z.boolean(),
      }),
    )
    .optional(),
  unit: z.enum(['money', 'count', 'share']).optional(),
  /** What to do, in order. A status is set when change history verified it. */
  checklist: z.array(
    z.object({
      label: z.string().min(1),
      status: z.enum(['done', 'pending', 'partial']).nullable(),
      detail: z.string().min(1).nullable(),
    }),
  ),
  /** Negative lists to paste, grouped by theme. */
  negatives: z
    .array(z.object({ theme: z.string().min(1), terms: z.array(z.string().min(1)).min(1) }))
    .optional(),
  /** What the finding cannot measure yet and why ("GHL → WooCommerce: no connector"). */
  blocked: z.string().min(1).nullable(),
});

export const PlatformCardSchema = z.union([
  GoogleBudgetLimitedCardSchema,
  GooglePmaxAssetGroupCardSchema,
  GoogleVideoReadOnlyCardSchema,
  TikTokCreativeFatigueCardSchema,
  MetaCreativeFatigueCardSchema,
  TikTokScheduledDecreaseCardSchema,
  CrossPlatformMoveCardSchema,
  GoogleNegativeTermsCardSchema,
  GooglePromoteTermCardSchema,
  GoogleBidTargetCardSchema,
  GoogleLowQualityKeywordCardSchema,
  TikTokHookRetentionCardSchema,
  TikTokSparkCandidateCardSchema,
  TikTokBudgetBelowLearningCardSchema,
  TikTokAttributionWindowCardSchema,
  GoogleDeliveryIssueCardSchema,
  TikTokDeliveryIssueCardSchema,
  GoogleAdDragCardSchema,
  GoogleAdWinnerCardSchema,
  GoogleAudienceSaturationCardSchema,
  GooglePmaxAssetsCardSchema,
  GoogleAccountFindingCardSchema,
]);
export type PlatformCard = z.infer<typeof PlatformCardSchema>;
export type PlatformCardVariant = PlatformCard['variant'];
