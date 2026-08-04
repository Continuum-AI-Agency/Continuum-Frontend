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

export const readinessDimensionSchema = z.object({
  score: z.number().int().min(0).max(100),
  // 420-char cap = 280 target × 1.5 spillover allowance. The bound is the
  // responseSchema maxLength Gemini sees; backend coerceToSchema hard-truncates
  // any runaway. Original 280 caused mid-JSON truncation when 7 dimensions ×
  // ~300 tokens overflowed maxOutputTokens.
  rationale: z.string().min(1).max(420),
});
export type ReadinessDimension = z.infer<typeof readinessDimensionSchema>;

export const readinessFindingSchema = z.object({
  dimension: readinessDimensionKey,
  score: z.number().int().min(0).max(100),
  severity: z.enum(['low', 'medium', 'high']),
  headline: z.string().min(1).max(240),
  detail: z.string().min(1).max(360),
  recommendation: z.string().min(1).max(240),
});
export type ReadinessFinding = z.infer<typeof readinessFindingSchema>;

export const readinessAnalysisSchema = z.object({
  overall_score: z.number().int().min(0).max(100),
  dimensions: z.object({
    value_proposition: readinessDimensionSchema,
    icp_clarity: readinessDimensionSchema,
    customer_pains: readinessDimensionSchema,
    success_metrics: readinessDimensionSchema,
    positioning: readinessDimensionSchema,
    messaging_coherence: readinessDimensionSchema,
    brand_identity: readinessDimensionSchema,
  }),
  findings: z.array(readinessFindingSchema).max(5).default([]),
  // Server-side assigned in runReadiness; Gemini drops `.datetime()` format
  // hints silently so the previous .datetime() validator caught nothing —
  // plain string matches what the model actually emits.
  generated_at: z.string().min(1).max(40),
});
export type ReadinessAnalysis = z.infer<typeof readinessAnalysisSchema>;
