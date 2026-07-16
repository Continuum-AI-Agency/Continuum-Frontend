// The Virality Score — an Opus-Clip-style 0-100 grade on a single hook, with the
// component breakdown EXPOSED (Opus hides it) and GROUNDED in the brand's own
// winning hooks (Opus is generic). Produced Backend-side: a Gemini 3.1 Flash-Lite
// pass grades each component on a narrow 1-5 scale + classifies the hook archetype;
// deterministic code (composeViralityOverall) folds those into the 0-100 overall
// and viralityGradeForScore maps the band. Every score is persisted to the
// prediction ledger and later joined to the observed hook rate (the `observed`
// block) so the score calibrates to real outcomes over time.
//
// Plain objects (not .strict()) so an LLM adding an extra key never fails parse —
// same rule as creative-strategy/competitor-spy.

import { z } from 'zod';
import { creativeHookArchetypeSchema } from '../creative-strategy/analysis';

// The rubric components a hook is graded on. Each is scored 1-5 by the model;
// `brand_archetype_match` — does this hook's family match what actually wins for
// THIS brand — is the grounded component and carries the highest weight.
export const viralityComponentSchema = z.enum([
  'hook_strength',
  'curiosity_gap',
  'specificity',
  'emotional_trigger',
  'clarity',
  'trend_fit',
  'brand_archetype_match',
]);
export type ViralityComponent = z.infer<typeof viralityComponentSchema>;

// One graded component: the raw 1-5 the model returned, the weight applied when
// composing the overall, and the one-line rationale shown in the breakdown.
export const viralityComponentScoreSchema = z.object({
  component: viralityComponentSchema,
  raw: z.number().min(1).max(5),
  weight: z.number().min(0).max(1),
  rationale: z.string(),
});
export type ViralityComponentScore = z.infer<typeof viralityComponentScoreSchema>;

// Grade band — mirrors the live analyzeHookRate reels buckets and their thresholds
// (viral >=85, strong >=60, okay >=35, else weak) so one vocabulary grades every
// surface. See viralityGradeForScore.
export const viralityGradeSchema = z.enum(['weak', 'okay', 'strong', 'viral']);
export type ViralityGrade = z.infer<typeof viralityGradeSchema>;

// What the score was grounded against. 'brand_grounded' means we had this brand's
// own winning-hook evidence in the prompt; 'generic_fallback' means the brand has
// no creative history yet (cold-start) and the rubric ran without brand calibration.
export const viralityGroundingSourceSchema = z.enum(['brand_grounded', 'generic_fallback']);
export type ViralityGroundingSource = z.infer<typeof viralityGroundingSourceSchema>;

export const viralityGroundingSchema = z.object({
  source: viralityGroundingSourceSchema,
  // The hook archetype the model classified this hook into.
  archetype: creativeHookArchetypeSchema.nullable().default(null),
  // How that archetype performs for this brand (0-1 win-rate from paid intel /
  // hook leaderboard); null when unknown.
  brandArchetypeWinRate: z.number().min(0).max(1).nullable().default(null),
  // The brand's best observed organic hook rate (0-100) from the awareness top posts.
  brandTopHookRate: z.number().nullable().default(null),
  // The deterministic scorer's brand-anchored expected hook rate for this hook
  // (0-100), read off the brand's own distribution; `overall` is its percentile.
  // null for the LLM path / uncalibrated brands.
  predictedHookRate: z.number().nullable().default(null),
  // Post/ad ids the grounding evidence came from — traceable provenance.
  comparedRefIds: z.array(z.string()).default([]),
  // How many pieces of brand evidence backed the score (drives confidence).
  evidenceCount: z.number().int().nonnegative().default(0),
});
export type ViralityGrounding = z.infer<typeof viralityGroundingSchema>;

// The observed outcome, filled by the reconcile loop once the hook publishes and
// its metrics land. null until then — this is the predicted-vs-observed join that
// lets the score calibrate.
export const viralityObservedSchema = z.object({
  hookRate: z.number().nullable().default(null),
  retentionRate: z.number().nullable().default(null),
  capturedAt: z.string().nullable().default(null),
});
export type ViralityObserved = z.infer<typeof viralityObservedSchema>;

export const viralityScoreSchema = z.object({
  status: z.enum(['pending', 'scored']),
  // Rubric identity — bump when weights/components change so calibration cohorts
  // don't mix incompatible scores.
  rubricVersion: z.string(),
  // The headline 0-100. null only while status === 'pending'.
  overall: z.number().min(0).max(100).nullable().default(null),
  grade: viralityGradeSchema.nullable().default(null),
  components: z.array(viralityComponentScoreSchema).default([]),
  grounding: viralityGroundingSchema.nullable().default(null),
  // 0-1 confidence from evidence volume — mirrors the creative_strategy formula.
  confidence: z.number().min(0).max(1).nullable().default(null),
  observed: viralityObservedSchema.nullable().default(null),
  model: z.string().nullable().default(null),
  computedAt: z.string(),
});
export type ViralityScore = z.infer<typeof viralityScoreSchema>;

// The subject a score attaches to, for the prediction ledger.
export const viralitySubjectTypeSchema = z.enum([
  'clip',
  'organic_hook',
  'paid_ad',
  'competitor_hook',
]);
export type ViralitySubjectType = z.infer<typeof viralitySubjectTypeSchema>;

// Which engine computes the score. 'fast' (the default) is the DETERMINISTIC
// per-brand path — string features + the brand's materialized win-rates and
// hook-rate distribution, no model call, same input → same score. 'deep' spends one
// LLM call for a model-written rationale.
export const viralityScoreModeSchema = z.enum(['fast', 'deep']);
export type ViralityScoreMode = z.infer<typeof viralityScoreModeSchema>;

// Request body for POST /api/virality/score — grade an ad-hoc hook on demand.
export const viralityScoreRequestSchema = z.object({
  brandId: z.string().min(1),
  hookText: z.string().min(1),
  subjectType: viralitySubjectTypeSchema.default('organic_hook'),
  subjectRef: z.string().nullable().default(null),
  mode: viralityScoreModeSchema.default('fast'),
});
export type ViralityScoreRequest = z.infer<typeof viralityScoreRequestSchema>;

export const viralityScoreResponseSchema = z.object({
  ok: z.literal(true),
  score: viralityScoreSchema,
});
export type ViralityScoreResponse = z.infer<typeof viralityScoreResponseSchema>;

// ---- Pure helpers (deterministic; shared by Backend compose + Frontend render + tests) ----

// Map a 0-100 overall to its grade band. Thresholds mirror analyzeHookRate.ts so
// clips, organic hooks, and reels all speak one grade vocabulary.
export function viralityGradeForScore(overall: number): ViralityGrade {
  if (overall >= 85) return 'viral';
  if (overall >= 60) return 'strong';
  if (overall >= 35) return 'okay';
  return 'weak';
}

// Compose the 0-100 overall from graded components. Each component's 1-5 raw is
// normalized to 0-1 as (raw-1)/4, weighted, and the weighted mean scaled to 0-100.
// Pure + deterministic so Backend and Frontend agree without a round-trip.
export function composeViralityOverall(components: ViralityComponentScore[]): number {
  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight <= 0) return 0;
  const weighted = components.reduce((sum, c) => sum + ((c.raw - 1) / 4) * c.weight, 0);
  return Math.round((weighted / totalWeight) * 100);
}

// Confidence from brand-evidence volume — mirrors the creative_strategy formula
// clamp(0.35 + 0.15 * evidenceCount, 0.35, 0.95).
export function viralityConfidence(evidenceCount: number): number {
  return Math.min(0.95, Math.max(0.35, 0.35 + 0.15 * evidenceCount));
}
