import { z } from 'zod';

/**
 * Authoritative ordered list of readiness dimensions. Both the Zod parser and
 * any UI iteration order (e.g. ReadinessCard) must source from here.
 */
export const readinessDimensionKey = z.enum([
  'value_proposition',
  'icp_clarity',
  'customer_pains',
  'success_metrics',
  'positioning',
  'messaging_coherence',
  'brand_identity',
]);
export type ReadinessDimensionKey = z.infer<typeof readinessDimensionKey>;

export const READINESS_DIMENSIONS: readonly ReadinessDimensionKey[] = [
  'value_proposition',
  'icp_clarity',
  'customer_pains',
  'success_metrics',
  'positioning',
  'messaging_coherence',
  'brand_identity',
] as const;

/**
 * Severity is a pure function of score — never a model choice. The backend
 * derives finding severity from it and the UI colours score badges with it.
 */
export type ReadinessSeverity = 'low' | 'medium' | 'high';
export function readinessSeverity(score: number): ReadinessSeverity {
  if (score < 40) return 'high';
  if (score < 70) return 'medium';
  return 'low';
}

export const readinessCriterionMet = z.enum(['yes', 'partial', 'no', 'unknown']);
export type ReadinessCriterionMet = z.infer<typeof readinessCriterionMet>;

/** Where a verified quote came from — rendered as the source chip. */
export const readinessEvidenceSource = z.enum([
  'homepage',
  'about',
  'pricing',
  'customers',
  'instagram_bio',
  'instagram_post',
  'search',
  'brand_md',
]);
export type ReadinessEvidenceSource = z.infer<typeof readinessEvidenceSource>;

export const readinessSourceStatus = z.enum(['ok', 'thin', 'failed', 'absent']);
export type ReadinessSourceStatus = z.infer<typeof readinessSourceStatus>;

/**
 * One row of the criteria table: the model only answers whether it is met,
 * with a quote; code turns the answers into the dimension score.
 */
export interface ReadinessCriterion {
  id: string;
  dimension: ReadinessDimensionKey;
  label: string;
  weight: number;
  sources: readonly ReadinessEvidenceSource[];
  /** The brand-book field a fix lands in — what a finding's CTA opens. */
  target_field: string;
  unmet_headline: string;
  /**
   * The anchored scale the model answers against: what a quoted passage must
   * show for `yes`, and for `partial`; anything less is `no`. A null `partial`
   * makes the criterion yes/no only.
   */
  rubric: { yes: string; partial: string | null };
}

export const readinessCriterionResultSchema = z.object({
  id: z.string().min(1).max(64),
  /** Carried per row so a stored score renders with the labels it was scored under. */
  label: z.string().min(1).max(120),
  met: readinessCriterionMet,
  quote: z.string().max(400).nullable(),
  source: readinessEvidenceSource.nullable(),
  source_url: z.string().max(2048).nullable().optional(),
  /** false → the quote did not match its source and `met` was downgraded to unknown. */
  verified: z.boolean(),
});
export type ReadinessCriterionResult = z.infer<typeof readinessCriterionResultSchema>;

const readinessDimensionCoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  // 420-char cap = 280 target × 1.5 spillover allowance. The bound is the
  // responseSchema maxLength Gemini sees; backend coerceToSchema hard-truncates
  // any runaway. Original 280 caused mid-JSON truncation when 7 dimensions ×
  // ~300 tokens overflowed maxOutputTokens.
  rationale: z.string().min(1).max(420),
});

// Criteria-scored fields are optional: rows scored before the criteria scorer
// (scorer_version absent) must keep parsing everywhere.
export const readinessDimensionSchema = readinessDimensionCoreSchema.extend({
  criteria: z.array(readinessCriterionResultSchema).max(8).optional(),
  /** Share of criterion weight that was answerable (not unknown), 0..1. */
  coverage: z.number().min(0).max(1).optional(),
  /** This dimension's score if the selected next moves are made. */
  reachable: z.number().int().min(0).max(100).optional(),
});
export type ReadinessDimension = z.infer<typeof readinessDimensionSchema>;

const readinessFindingCoreSchema = z.object({
  dimension: readinessDimensionKey,
  score: z.number().int().min(0).max(100),
  severity: z.enum(['low', 'medium', 'high']),
  headline: z.string().min(1).max(240),
  detail: z.string().min(1).max(360),
  recommendation: z.string().min(1).max(240),
});

export const readinessFindingSchema = readinessFindingCoreSchema.extend({
  criterion_ids: z.array(z.string().min(1).max(64)).max(8).optional(),
  target_field: z.string().min(1).max(80).optional(),
  /** Overall points recovered if this finding's criteria are met. */
  points_gain: z.number().min(0).max(100).optional(),
});
export type ReadinessFinding = z.infer<typeof readinessFindingSchema>;

const dimensionsOf = <T extends z.ZodTypeAny>(dimension: T) =>
  z.object({
    value_proposition: dimension,
    icp_clarity: dimension,
    customer_pains: dimension,
    success_metrics: dimension,
    positioning: dimension,
    messaging_coherence: dimension,
    brand_identity: dimension,
  });

const readinessAnalysisCoreSchema = z.object({
  overall_score: z.number().int().min(0).max(100),
  dimensions: dimensionsOf(readinessDimensionCoreSchema),
  findings: z.array(readinessFindingCoreSchema).max(5).default([]),
  // Server-side assigned in runReadiness; Gemini drops `.datetime()` format
  // hints silently so the previous .datetime() validator caught nothing —
  // plain string matches what the model actually emits.
  generated_at: z.string().min(1).max(40),
});

export const readinessAnalysisSchema = readinessAnalysisCoreSchema.extend({
  dimensions: dimensionsOf(readinessDimensionSchema),
  findings: z.array(readinessFindingSchema).max(5).default([]),
  /** partial → at least one evidence source failed or a dimension is under-covered. */
  completeness: z.enum(['complete', 'partial']).optional(),
  evidence_sources: z
    .object({
      homepage: readinessSourceStatus,
      subpages: readinessSourceStatus,
      instagram: readinessSourceStatus,
      search: readinessSourceStatus,
    })
    .optional(),
  /** Overall score if every selected finding is resolved. */
  reachable_score: z.number().int().min(0).max(100).optional(),
  scorer_version: z.string().min(1).max(40).optional(),
});
export type ReadinessAnalysis = z.infer<typeof readinessAnalysisSchema>;
