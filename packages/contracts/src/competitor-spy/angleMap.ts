// The competitor "what they're scaling" map — output of the deterministic SQL
// aggregation public.competitor_spy_get_angle_map (see the migration of the
// same name). One row per (competitor | null = cross-competitor rollup,
// dimension, value). The Ad Library exposes no spend, so scale is inferred
// from longevity + volume + variant repetition; `tier` is rule-based and its
// components are all present on the row so no surface renders an opaque score.
// Persisted into competitor_ad_spy.competitive_reports.angle_map and consumed
// by the gap-report assembler, the Brand Spy report FE, and Jaina grounding.

import { z } from 'zod';

export const competitorAngleMapDimensionSchema = z.enum([
  'hook_archetype',
  'angle',
  'theme',
  'funnel_stage',
  'asset_type',
]);
export type CompetitorAngleMapDimension = z.infer<typeof competitorAngleMapDimensionSchema>;

export const competitorScaleTierSchema = z.enum(['scaling', 'testing', 'fading']);
export type CompetitorScaleTier = z.infer<typeof competitorScaleTierSchema>;

// Mirror of the SQL tier rules (competitor_spy_angle_map_rpc.sql). Kept here
// so UI copy and tests reference the same numbers the database applies.
export const COMPETITOR_SCALING_TIER_RULES = {
  scaling: [
    { minActiveAds: 3, minMedianLongevityDays: 14 },
    { minActiveAds: 2, minMedianLongevityDays: 30 },
  ],
  fadingActiveAds: 0,
} as const;

// Cosine-similarity floors for variant-family clustering (passed to
// competitor_spy_match_snapshot_neighbors so TS and SQL cannot disagree).
// Image embeddings are the strong near-duplicate signal; text is the fallback
// and needs a tighter floor because ad copy repeats across genuinely
// different creatives.
export const VARIANT_FAMILY_THRESHOLDS = {
  imageCosine: 0.92,
  textCosine: 0.94,
} as const;

export const competitorAngleMapRowSchema = z.object({
  /** null = cross-competitor rollup row. */
  competitorId: z.string().nullable(),
  competitorName: z.string().nullable(),
  dimension: competitorAngleMapDimensionSchema,
  value: z.string(),
  adCount: z.number().int().nonnegative(),
  activeAdCount: z.number().int().nonnegative(),
  medianLongevityDays: z.number().nonnegative(),
  /** Share of the scope's total ad-longevity carried by this value (0..1). */
  longevityWeightedShare: z.number().min(0).max(1),
  variantFamilies: z.number().int().nonnegative(),
  sustainedHeroes: z.number().int().nonnegative(),
  volumeSpikes: z.number().int().nonnegative(),
  /** Distinct competitors behind the row (1 on per-competitor rows). */
  competitorCount: z.number().int().nonnegative(),
  tier: competitorScaleTierSchema,
  exemplarSnapshotIds: z.array(z.string()).max(3),
});
export type CompetitorAngleMapRow = z.infer<typeof competitorAngleMapRowSchema>;

export const competitorAngleMapSourceCountsSchema = z.object({
  competitors: z.number().int().nonnegative(),
  snapshots: z.number().int().nonnegative(),
  v2Labeled: z.number().int().nonnegative(),
});
export type CompetitorAngleMapSourceCounts = z.infer<typeof competitorAngleMapSourceCountsSchema>;

export const competitorAngleMapSchema = z.object({
  windowDays: z.number().int().positive(),
  generatedAt: z.string(),
  taxonomyVersion: z.number().int(),
  sourceCounts: competitorAngleMapSourceCountsSchema,
  rows: z.array(competitorAngleMapRowSchema),
});
export type CompetitorAngleMap = z.infer<typeof competitorAngleMapSchema>;
