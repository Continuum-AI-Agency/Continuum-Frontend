// The organic winners pool, and the request that turns one winner into an ad.
//
// A winner is one of the brand's OWN posts that beat its own account's median — engagement rate
// ×2 or reach ×3 — read by `public.organic_get_winners` from post metric snapshots, with the
// creative-element tags left-joined (many winners were posted natively and are not tagged yet).
//
// Promotion has two independent outcomes, reported separately because either can land without
// the other: the original post as a PAUSED ad, and a variations job seeded from it.

import { z } from 'zod';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const organicWinnerSchema = z.object({
  mediaId: z.string().min(1),
  accountId: z.string().min(1),
  permalink: nullableString,
  /** IG's vocabulary: IMAGE | VIDEO | CAROUSEL_ALBUM. Null when untagged and not a reel. */
  mediaType: nullableString,
  seenAt: z.string(),
  capturedDate: z.string(),
  reach: z.number(),
  views: nullableNumber,
  interactions: z.number(),
  engagementRate: z.number(),
  /** This post's engagement rate ÷ its account's median. */
  engagementRateLift: nullableNumber,
  /** This post's reach ÷ its account's median. */
  reachLift: nullableNumber,
  /** 100 − reels_skip_rate: the share of viewers who stayed past the opening. Reels only. */
  hookRate: nullableNumber,
  medianHookRate: nullableNumber,
  hookText: nullableString,
  ctaText: nullableString,
  hookClass: nullableString,
  ctaClass: nullableString,
  contentFormat: nullableString,
  angleId: nullableString,
  /** Null until a Meta ad creative runs this post. `adIds` fills once the paid sync sees the ad. */
  promotion: z
    .object({
      creativeIds: z.array(z.string()),
      adIds: z.array(z.string()),
    })
    .nullable(),
  variationJobs: z.array(z.object({ id: z.string(), status: z.string() })),
});
export type OrganicWinner = z.infer<typeof organicWinnerSchema>;

export const organicWinnersSchema = z.object({
  brandId: z.string(),
  windowDays: z.number().int().positive(),
  thresholds: z.object({
    engagementRateLift: z.number(),
    reachLift: z.number(),
    minAccountPosts: z.number().int(),
  }),
  winners: z.array(organicWinnerSchema),
});
export type OrganicWinners = z.infer<typeof organicWinnersSchema>;

export const promoteOrganicWinnerRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    mediaId: z.string().regex(/^\d+$/, 'An Instagram media id is numeric.'),
    adsetId: z.string().regex(/^\d+$/, 'A Meta ad set id is numeric.'),
    makeVariations: z.boolean().default(false),
  })
  .strict();
export type PromoteOrganicWinnerRequest = z.infer<typeof promoteOrganicWinnerRequestSchema>;

/** Why an ad was not created. Every value is a sentence the UI can show as-is via `reason`. */
export const organicPromotionRefusalSchema = z.enum([
  /** The brand logged in with Instagram only: there is no ad account or Page to advertise from. */
  'no_ad_account',
  /** No Facebook Page this token manages is linked to the post's Instagram account. */
  'no_linked_page',
]);
export type OrganicPromotionRefusal = z.infer<typeof organicPromotionRefusalSchema>;

/** The ad sets a winner can be promoted into, from the brand's default Meta ad account.
 *  `refused` is set (and `adsets` empty) when the brand cannot advertise at all, so the UI can
 *  say why before anyone clicks. */
export const organicPromotionAdsetsSchema = z.object({
  adAccountId: z.string().nullable(),
  refused: organicPromotionRefusalSchema.nullable(),
  adsets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      campaignName: z.string().nullable(),
      status: z.string(),
    }),
  ),
});
export type OrganicPromotionAdsets = z.infer<typeof organicPromotionAdsetsSchema>;

export const promoteOrganicWinnerResponseSchema = z.object({
  ad: z.discriminatedUnion('status', [
    z.object({ status: z.literal('created'), adId: z.string(), creativeId: z.string() }),
    z.object({ status: z.literal('already_promoted'), creativeIds: z.array(z.string()) }),
    /** Meta will not run this post as an ad (licensed music is the usual cause). */
    z.object({ status: z.literal('ineligible'), reason: z.string() }),
    z.object({
      status: z.literal('refused'),
      code: organicPromotionRefusalSchema,
      reason: z.string(),
    }),
  ]),
  variations: z.discriminatedUnion('status', [
    z.object({ status: z.literal('not_requested') }),
    z.object({
      status: z.literal('queued'),
      jobId: z.string(),
      /** False when the ad set has no synced ad to publish beside: the variations land in the
       *  Library only, and a person publishes them from there. */
      publishesToMeta: z.boolean(),
    }),
    z.object({ status: z.literal('failed'), reason: z.string() }),
  ]),
});
export type PromoteOrganicWinnerResponse = z.infer<typeof promoteOrganicWinnerResponseSchema>;
