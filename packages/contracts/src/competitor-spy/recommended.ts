// Onboarding-derived competitor recommendations. During onboarding,
// discoverCompetitors() writes rich rows into brand_profiles.brand_competitors
// (metadata.source = "onboarding_auto") carrying a name, an Instagram handle,
// website/social URLs, and a one-line "why" (insight). The Brand Spy
// "Competitors" tab surfaces these as a recommended list the user accepts
// one-by-one; accepting calls the existing POST /competitors (tagCompetitor).
//
// Identifier is `name`: brand_competitors is unique on (brand_id, name) and
// exposes no surrogate id to the Frontend, so dismiss/restore address by name.

import { z } from "zod";

export const recommendedCompetitorSchema = z
  .object({
    name: z.string().min(1).max(120),
    slug: z.string().min(1).max(140),
    instagramHandle: z.string().nullable(),
    instagramUrl: z.string().nullable(),
    website: z.string().nullable(),
    facebookUrl: z.string().nullable(),
    tiktokUrl: z.string().nullable(),
    insight: z.string().nullable(),
    alreadyTracked: z.boolean(),
  })
  .strict();
export type RecommendedCompetitor = z.infer<typeof recommendedCompetitorSchema>;

export const recommendedCompetitorsResponseSchema = z
  .object({ recommended: z.array(recommendedCompetitorSchema) })
  .strict();
export type RecommendedCompetitorsResponse = z.infer<typeof recommendedCompetitorsResponseSchema>;

export const dismissRecommendationRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    name: z.string().min(1).max(120),
    restore: z.boolean().optional(),
  })
  .strict();
export type DismissRecommendationRequest = z.infer<typeof dismissRecommendationRequestSchema>;

export const dismissRecommendationResponseSchema = z
  .object({
    dismissed: z.boolean(),
    name: z.string(),
  })
  .strict();
export type DismissRecommendationResponse = z.infer<typeof dismissRecommendationResponseSchema>;
