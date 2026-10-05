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

export const PlatformCardSchema = z.union([
  GoogleBudgetLimitedCardSchema,
  GooglePmaxAssetGroupCardSchema,
  GoogleVideoReadOnlyCardSchema,
  TikTokCreativeFatigueCardSchema,
  TikTokScheduledDecreaseCardSchema,
  CrossPlatformMoveCardSchema,
]);
export type PlatformCard = z.infer<typeof PlatformCardSchema>;
export type PlatformCardVariant = PlatformCard['variant'];
