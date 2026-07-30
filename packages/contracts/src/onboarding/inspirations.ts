// Competitor "inspirations" + brand-guided generation shapes for the onboarding
// finale (Competitor Inspirations screen → brand-guided generations screen).
// Defined once here and imported by the Backend emit side AND the Frontend
// stream/response interpreters. See streaming/onboarding-inspirations.ts for the
// progressive NDJSON frames that carry these payloads.

import { z } from 'zod';
import { httpUrlSchema } from './_shared';

// Platform an inspiration item was pulled from.
export const inspirationSourceSchema = z.enum([
  'instagram',
  'meta_ad_library',
  'facebook',
  'tiktok',
]);
export type InspirationSource = z.infer<typeof inspirationSourceSchema>;

// The exact competitor creative a user chose during onboarding. This is shared
// by persisted onboarding state and the generation request so the selection does
// not disappear on navigation/resume or drift between the UI and generator.
export const onboardingInspirationSelectionSchema = z
  .object({
    competitorName: z.string().min(1),
    imageUrl: z.string().min(1),
  })
  .strict();
export type OnboardingInspirationSelection = z.infer<typeof onboardingInspirationSelectionSchema>;

export const inspirationMetricsSchema = z
  .object({
    likes: z.number().int().nonnegative().nullable().optional(),
    comments: z.number().int().nonnegative().nullable().optional(),
    engagement: z.number().nonnegative().nullable().optional(),
  })
  .strict();
export type InspirationMetrics = z.infer<typeof inspirationMetricsSchema>;

// One organic post card. imageUrl is a cached/signed Storage URL (competitor CDN
// URLs rotate, so the Backend re-hosts the asset before emitting).
export const inspirationPostSchema = z
  .object({
    id: z.string().min(1),
    source: inspirationSourceSchema,
    permalink: httpUrlSchema.nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    caption: z.string().nullable().optional(),
    postedAt: z.string().nullable().optional(),
    metrics: inspirationMetricsSchema.nullable().optional(),
  })
  .strict();
export type InspirationPost = z.infer<typeof inspirationPostSchema>;

// One paid-ad card (typically source "meta_ad_library").
export const inspirationAdSchema = z
  .object({
    id: z.string().min(1),
    source: inspirationSourceSchema,
    permalink: httpUrlSchema.nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    headline: z.string().nullable().optional(),
    bodyText: z.string().nullable().optional(),
    callToAction: z.string().nullable().optional(),
    startedAt: z.string().nullable().optional(),
  })
  .strict();
export type InspirationAd = z.infer<typeof inspirationAdSchema>;

// Loose so additional resolved social URLs (linkedin/youtube/etc.) pass through
// without a contract change; instagram/facebook/tiktok are the ones we act on.
export const competitorSocialsSchema = z
  .object({
    instagram: httpUrlSchema.nullable().optional(),
    facebook: httpUrlSchema.nullable().optional(),
    tiktok: httpUrlSchema.nullable().optional(),
  })
  .loose();
export type CompetitorSocials = z.infer<typeof competitorSocialsSchema>;

export const competitorInspirationSchema = z
  .object({
    competitorName: z.string().min(1),
    website: httpUrlSchema.nullable().optional(),
    socials: competitorSocialsSchema.default({}),
    organicPosts: z.array(inspirationPostSchema).default([]),
    paidAds: z.array(inspirationAdSchema).default([]),
    insights: z.string().nullable().optional(),
  })
  .strict();
export type CompetitorInspiration = z.infer<typeof competitorInspirationSchema>;

// HTTP request / non-streaming result envelopes ----------------------------

export const onboardingInspirationsRequestSchema = z
  .object({ brandId: z.string().min(1) })
  .strict();
export type OnboardingInspirationsRequest = z.infer<typeof onboardingInspirationsRequestSchema>;

export const onboardingInspirationsResultSchema = z
  .object({ competitors: z.array(competitorInspirationSchema).default([]) })
  .strict();
export type OnboardingInspirationsResult = z.infer<typeof onboardingInspirationsResultSchema>;

// Generation ---------------------------------------------------------------

// The auto-spread directions for the three generations.
export const generationDirectionSchema = z.enum(['product', 'brand_awareness', 'hybrid']);
export type GenerationDirection = z.infer<typeof generationDirectionSchema>;

export const onboardingGenerateRequestSchema = z
  .object({
    brandId: z.string().min(1),
    // The chosen inspiration that seeds generation — either an already-stored
    // media asset id or a direct (cached/signed) image URL. Both optional: the
    // Backend defaults to the top-engagement post when neither is supplied.
    referenceAssetId: z.string().min(1).nullable().optional(),
    referenceImageUrl: z.string().min(1).nullable().optional(),
    competitorName: z.string().min(1).nullable().optional(),
  })
  .strict();
export type OnboardingGenerateRequest = z.infer<typeof onboardingGenerateRequestSchema>;

export const onboardingGeneratedImageSchema = z
  .object({
    assetId: z.string().min(1).nullable().optional(),
    signedUrl: z.string().min(1),
    direction: generationDirectionSchema,
  })
  .strict();
export type OnboardingGeneratedImage = z.infer<typeof onboardingGeneratedImageSchema>;

export const onboardingGenerateResultSchema = z
  .object({ images: z.array(onboardingGeneratedImageSchema).default([]) })
  .strict();
export type OnboardingGenerateResult = z.infer<typeof onboardingGenerateResultSchema>;
