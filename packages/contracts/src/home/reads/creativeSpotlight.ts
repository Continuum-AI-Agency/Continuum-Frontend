// The brand's creatives worth looking at this week (H09, Creative Spotlight): the top ads by
// spend over the last 7 or 14 days, each with its thumbnail, format, headline, cost per result,
// hook rate, share of spend, frequency and a verdict (winner / fading / new / steady).
//
// Read from the brand's own Meta ad snapshots (`paid_media.ads.windows`, written by the creative
// intel sync) joined to `paid_media.ad_creatives`. Nothing calls Meta live. Each window is as of
// the account's latest sync, so the answer carries `asOf` and how old that is.
//
// Money is never summed across currencies: the ranking runs inside ONE currency (the one most of
// the brand's spending ads are priced in) and the others are only counted in `otherCurrencies`.
//
// Served by the Backend at HOME_READ_PATHS.creativeSpotlight: GET ?brandId=&limit=1..20&window=7d|14d.

import { z } from 'zod';
import { homeReadEnvelopeSchema, homeReadSourceSchema } from './envelope';

export const HOME_CREATIVE_SPOTLIGHT_DEFAULT_LIMIT = 8;
export const HOME_CREATIVE_SPOTLIGHT_MAX_LIMIT = 20;

export const homeCreativeWindowSchema = z.enum(['7d', '14d']);
export type HomeCreativeWindow = z.infer<typeof homeCreativeWindowSchema>;

export const homeCreativeSpotlightQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(HOME_CREATIVE_SPOTLIGHT_MAX_LIMIT)
    .default(HOME_CREATIVE_SPOTLIGHT_DEFAULT_LIMIT),
  window: homeCreativeWindowSchema.default('7d'),
});
export type HomeCreativeSpotlightQuery = z.infer<typeof homeCreativeSpotlightQuerySchema>;

export const homeCreativeFormatSchema = z.enum(['image', 'video', 'carousel', 'unknown']);
export type HomeCreativeFormat = z.infer<typeof homeCreativeFormatSchema>;

/**
 * - winner: the creative intel verdict is `scale` (beats its cohort's cost per result).
 * - fading: this week against the week before, CTR fell at least 25% AND the cost per result
 *   rose at least 20% — the Optimizer's F1 creative-fatigue shape and thresholds, read per ad.
 * - new: delivered this week and not in the window before it (read from the windows, not from
 *   when Continuum first saw the ad); too early to judge. Outranks every other verdict.
 * - steady: none of the above.
 */
export const homeCreativeVerdictSchema = z.enum(['winner', 'fading', 'new', 'steady']);
export type HomeCreativeVerdict = z.infer<typeof homeCreativeVerdictSchema>;

/** The creative intel pipeline's own per-ad verdict, passed through verbatim. */
export const homeCreativeIntelVerdictSchema = z.enum(['kill', 'scale', 'iterate', 'watch']);

/**
 * Why an ad carries no hook rate: it is not a video, or Meta reported no 3-second views for it
 * (an absent count, never assumed to be a real zero).
 */
export const homeHookRateUnavailableSchema = z.enum(['not_video', 'not_reported']);
export type HomeHookRateUnavailable = z.infer<typeof homeHookRateUnavailableSchema>;

const money = z.number().finite().nonnegative();
const share = z.number().min(0).max(1);

export const homeCreativeCostPerResultSchema = z
  .object({
    /** spend ÷ results in the window. Null when the ad produced no result. */
    value: money.nullable(),
    results: z.number().nonnegative(),
    /** The conversion the ad is judged in, from its ad set's optimization goal (e.g. `leads`). */
    kpi: z.string().min(1),
    /** What the figure is called in prose, e.g. "cost per conversation". */
    label: z.string().min(1),
  })
  .refine((cost) => cost.results > 0 === (cost.value !== null), {
    message: 'A cost per result exists exactly when there are results.',
  });

export const homeCreativeSpotlightAdSchema = z
  .object({
    adId: z.string().min(1),
    adAccountId: z.string().min(1),
    adName: z.string().nullable(),
    /** The creative's headline. Null when the creative has none. */
    title: z.string().nullable(),
    format: homeCreativeFormatSchema,
    /** Stored Meta CDN url; these are signed and expire, so the tile must tolerate a broken image. */
    thumbnailUrl: z.string().nullable(),
    permalinkUrl: z.string().nullable(),
    /** When Continuum first saw the ad: a lower bound of its real age. */
    firstSeenAt: z.string(),
    /** Spend in the window, in `data.currency`. */
    spend: money,
    /** This ad's spend ÷ every spending ad's spend in the same currency and window. */
    spendShare: share,
    impressions: z.number().nonnegative(),
    costPerResult: homeCreativeCostPerResultSchema,
    /** 3-second video views ÷ impressions. Null with `hookRateUnavailable` saying why. */
    hookRate: share.nullable(),
    hookRateUnavailable: homeHookRateUnavailableSchema.nullable(),
    frequency: z.number().nonnegative().nullable(),
    verdict: homeCreativeVerdictSchema,
    /** One sentence, citing a figure, saying why the verdict is what it is. */
    verdictWhy: z.string().min(1),
    intelVerdict: homeCreativeIntelVerdictSchema.nullable(),
    /** The intel verdict's own figure-bearing reason, verbatim. */
    intelReason: z.string().nullable(),
  })
  .refine((ad) => (ad.hookRate === null) !== (ad.hookRateUnavailable === null), {
    message: 'A hook rate is either measured or says why it is not.',
  });
export type HomeCreativeSpotlightAd = z.infer<typeof homeCreativeSpotlightAdSchema>;

export const homeCreativeSpotlightDataSchema = z.object({
  window: homeCreativeWindowSchema,
  /** ISO 4217 of every money figure. Null when the account never reported its currency. */
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  /** The latest sync the windows were read at. */
  asOf: z.string(),
  /** Whole days between `asOf` and when the answer was generated. */
  ageDays: z.number().int().nonnegative(),
  /** Spend of every spending ad in `currency` over the window (the share denominator). */
  totalSpend: money,
  /** Ads in `currency` that spent in the window; `ads` is the top slice of them. */
  adsWithSpend: z.number().int().nonnegative(),
  /** Ranked by spend, highest first. */
  ads: z.array(homeCreativeSpotlightAdSchema),
  /** Spending ads priced in other currencies, counted but never added in. */
  otherCurrencies: z.array(
    z.object({
      currency: z.string().nullable(),
      adsWithSpend: z.number().int().positive(),
    }),
  ),
  source: homeReadSourceSchema,
});
export type HomeCreativeSpotlightData = z.infer<typeof homeCreativeSpotlightDataSchema>;

export const homeCreativeSpotlightReadSchema = homeReadEnvelopeSchema(
  homeCreativeSpotlightDataSchema,
);
export type HomeCreativeSpotlightRead = z.infer<typeof homeCreativeSpotlightReadSchema>;
