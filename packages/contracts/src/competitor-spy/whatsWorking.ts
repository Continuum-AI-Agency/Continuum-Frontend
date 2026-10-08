// "What's working" in a brand's niche, from its tracked competitors' Instagram posts — output of
// the deterministic SQL aggregation public.competitor_spy_get_whats_working.
//
// Good vs bad is a NUMBER here, never a model's opinion: a post "worked" when its outlier_score
// (engagement over its own account's median) is at least COMPETITOR_OUTLIER_MULTIPLE. The models
// only decided which bucket a post is counted in (angle_id, hook_archetype — Jev-tagged above
// their calibrated bars) and whether it belongs to the niche at all. `lift` compares a bucket's
// outlier share with the whole niche's, so a bucket that merely holds many posts does not read
// as a winner.

import { z } from 'zod';

/** A post "worked" at this multiple of its own account's median engagement. */
export const COMPETITOR_OUTLIER_MULTIPLE = 2;

/** Buckets with fewer posts carry `low_evidence` — the same floor as the paid win rates. */
export const COMPETITOR_WHATS_WORKING_MIN_POSTS = 3;

export const competitorWhatsWorkingDimensionSchema = z.enum([
  'angle_id',
  'hook_archetype',
  'content_format',
  'media_type',
]);
export type CompetitorWhatsWorkingDimension = z.infer<typeof competitorWhatsWorkingDimensionSchema>;

export const competitorWhatsWorkingExemplarSchema = z.object({
  permalink: z.string().nullable(),
  account: z.string().nullable(),
  outlierScore: z.number(),
  caption: z.string(),
});

export const competitorWhatsWorkingRowSchema = z.object({
  dimension: competitorWhatsWorkingDimensionSchema,
  value: z.string(),
  posts: z.number().int().nonnegative(),
  outliers: z.number().int().nonnegative(),
  outlierShare: z.number().min(0).max(1),
  /** outlierShare over the niche's overall outlier share; null when the niche has none. */
  lift: z.number().nonnegative().nullable(),
  medianOutlierScore: z.number().nullable(),
  flags: z.array(z.enum(['low_evidence'])),
  exemplars: z.array(competitorWhatsWorkingExemplarSchema).max(3),
});
export type CompetitorWhatsWorkingRow = z.infer<typeof competitorWhatsWorkingRowSchema>;

export const competitorWhatsWorkingSchema = z.object({
  windowDays: z.number().int().positive(),
  posts: z.number().int().nonnegative(),
  outliers: z.number().int().nonnegative(),
  baseOutlierShare: z.number().min(0).max(1).nullable(),
  rows: z.array(competitorWhatsWorkingRowSchema),
});
export type CompetitorWhatsWorking = z.infer<typeof competitorWhatsWorkingSchema>;
