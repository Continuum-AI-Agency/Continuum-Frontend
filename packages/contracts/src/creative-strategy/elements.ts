// Creative elements "what's working" — output of the deterministic SQL ranking
// public.creative_elements_get_whats_working (migrations 20260923192847_creative_elements,
// 20260923231225_creative_elements_ranking_sources, 20260924053503_creative_elements_ranking_virality, 20260924065333_creative_elements_virality_licensed_slice).
//
// Good vs bad is a NUMBER, never a model's opinion. `liftBasis` says which number: own organic =
// engagement rate over the brand's median post; competitor organic = outlier_score (that post over
// its own account's median); own paid = the brand's median cost per result over this creative's.
// The models only decided what each post SAYS (hook/CTA text, Gemini) and which closed class it
// belongs to (Gemini's tags) — i.e. which bucket it is counted in. Kev's `virality` sits beside the
// lift as a prediction (trained on real outcomes), never inside it.

import { z } from 'zod';

/** Buckets with fewer posts carry `low_evidence` — the same floor as the paid win rates. */
export const CREATIVE_ELEMENTS_MIN_POSTS = 3;

export const creativeElementSourceSchema = z.enum([
  'own_organic',
  'own_paid',
  'competitor_organic',
  /** Own posts published as Instagram TRIAL reels: ranked on hook rate against the brand's own
   *  ordinary reels, never mixed into `own_organic` (their reach is non-followers only). */
  'own_trial',
]);
export type CreativeElementSource = z.infer<typeof creativeElementSourceSchema>;

export const creativeElementDimensionSchema = z.enum([
  'hook',
  'cta',
  'content_format',
  'angle_id',
  'media_type',
]);
export type CreativeElementDimension = z.infer<typeof creativeElementDimensionSchema>;

export const creativeElementExemplarSchema = z.object({
  sourceRef: z.string(),
  permalink: z.string().nullable(),
  hookText: z.string().nullable(),
  ctaText: z.string().nullable(),
  lift: z.number().nonnegative(),
  /** Own organic only; null where the source has no reach (competitors, paid). */
  engagementRate: z.number().nonnegative().nullable(),
  /**
   * Kev's virality pre-score — P(the post reaches 2x its account's median), a prediction beside
   * the measured lift. Null outside the licensed slice (competitor single images, reels and
   * announcements: held-out AUC 0.671 vs Gemini 0.581); Kev scores every organic row regardless.
   */
  virality: z.number().min(0).max(1).nullable().optional(),
});
export type CreativeElementExemplar = z.infer<typeof creativeElementExemplarSchema>;

export const creativeElementsRowSchema = z.object({
  dimension: creativeElementDimensionSchema,
  value: z.string(),
  posts: z.number().int().positive(),
  /** Median of the bucket's post lifts; 1 = the account's median post. */
  medianLift: z.number().nonnegative(),
  /** Share of the bucket's posts above the account median. */
  aboveMedianShare: z.number().min(0).max(1),
  flags: z.array(z.enum(['low_evidence'])),
  exemplars: z.array(creativeElementExemplarSchema).max(3),
});
export type CreativeElementsRow = z.infer<typeof creativeElementsRowSchema>;

export const creativeElementsTopPostSchema = z.object({
  sourceRef: z.string(),
  permalink: z.string().nullable(),
  postedAt: z.string().nullable(),
  mediaType: z.string().nullable(),
  hookText: z.string().nullable(),
  ctaText: z.string().nullable(),
  hookClass: z.string().nullable(),
  ctaClass: z.string().nullable(),
  contentFormat: z.string().nullable(),
  angleId: z.string().nullable(),
  /** Null for competitor posts (reach is private). */
  reach: z.number().int().nonnegative().nullable(),
  /** Organic: interactions; paid: results on the brand's KPI. */
  interactions: z.number().int().nonnegative().nullable(),
  engagementRate: z.number().nonnegative().nullable(),
  lift: z.number().nonnegative(),
  /** Kev's virality pre-score (see the exemplar); null until Kev has scored the post. */
  virality: z.number().min(0).max(1).nullable().optional(),
});
export type CreativeElementsTopPost = z.infer<typeof creativeElementsTopPostSchema>;

export const creativeElementsWhatsWorkingSchema = z.object({
  source: creativeElementSourceSchema,
  /** What `lift` divides: engagement_rate_vs_brand_median | outlier_score_vs_account_median | cost_per_<kpi>_vs_brand_median. */
  liftBasis: z.string(),
  windowDays: z.number().int().positive(),
  posts: z.number().int().nonnegative(),
  /** Own organic only; null for other sources or when no post in the window has metrics. */
  medianEngagementRate: z.number().nonnegative().nullable(),
  rows: z.array(creativeElementsRowSchema),
  /** The lift-ranked stack, best first, at most 25. */
  topPosts: z.array(creativeElementsTopPostSchema).max(25),
});
export type CreativeElementsWhatsWorking = z.infer<typeof creativeElementsWhatsWorkingSchema>;
