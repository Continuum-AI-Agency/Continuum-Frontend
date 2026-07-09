// ---------------------------------------------------------------------------
// Zod schemas for the engine's IO boundary (API routes, DB rows, queue jobs).
// These are the contracts to share via packages/contracts in the monorepo.
// Requires `zod` (already a dependency of the frontend).
// ---------------------------------------------------------------------------

import { z } from 'zod';

export const WindowMetricsSchema = z.object({
  spend: z.number().nonnegative(),
  purchases: z.number().int().nonnegative(),
  addToCarts: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
  // Optional per-objective KPI events — a snapshot only carries the ones it needs.
  leads: z.number().int().nonnegative().optional(),
  appInstalls: z.number().int().nonnegative().optional(),
  signups: z.number().int().nonnegative().optional(),
  landingPageViews: z.number().int().nonnegative().optional(),
  reach: z.number().int().nonnegative().optional(),
});

/** One day's raw counts + its ISO date — mirrors DailyMetrics in ./types. */
export const DailyMetricsSchema = WindowMetricsSchema.extend({
  date: z.string(),
});

export const OptimizationObjectiveSchema = z.enum([
  'purchase',
  'app_install',
  'signup',
  'lead',
  'traffic',
  'awareness',
]);

export const AdSetStatusSchema = z.enum([
  'active',
  'learning',
  'grace',
  'frozen',
  'flagged',
  'starved', // trigger-set: eligible but driven to its floor
]);

export const AudienceTypeSchema = z.enum(['prospecting', 'retargeting', 'remarketing', 'unknown']);

/** Why the ingest boundary abstained (froze) an ad set — mirrors FreezeReason in ./types. */
export const FreezeReasonSchema = z.enum([
  'no_conversions',
  'unsupported_budget',
  'lifetime_budget',
]);

export const AdSetSnapshotSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: AdSetStatusSchema,
  currentBudget: z.number().nonnegative(),
  learningPhase: z.boolean().optional(),
  freeze: z.boolean().optional(),
  freezeReason: FreezeReasonSchema.optional(),
  ageDays: z.number().nonnegative(),
  audienceType: AudienceTypeSchema.optional(),
  frequency7d: z.number().nonnegative().optional(),
  optimization_goal: z.string().optional(),
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  adCount: z.number().int().nonnegative().optional(),
  /** Which Meta budget field `currentBudget` came from: a per-cycle daily_budget, or a
   *  whole-flight lifetime_budget (lifetime CBO). Metadata for the picker/suggest + the
   *  applier's write-field choice — not used in scoring (the engine reallocates
   *  currentBudget the same way regardless). Absent ⇒ daily. */
  budgetType: z.enum(['daily', 'lifetime']).optional(),
  windows: z.object({
    d3: WindowMetricsSchema,
    d7: WindowMetricsSchema,
    d14: WindowMetricsSchema,
  }),
  archivalWindows: z
    .object({
      d30: WindowMetricsSchema,
      d90: WindowMetricsSchema,
    })
    .optional(),
  daily: z.array(DailyMetricsSchema).optional(),
});

export const WindowWeightsSchema = z.object({
  d3: z.number(),
  d7: z.number(),
  d14: z.number(),
});

export const EngineConfigSchema = z
  .object({
    reallocCycleDays: z.number().positive(),
    velocityCapPct: z.number().min(0).max(5),
    learningReductionCapPct: z.number().min(0).max(1),
    weightsNeutral: WindowWeightsSchema,
    weightsPositive: WindowWeightsSchema,
    weightsNegative: WindowWeightsSchema,
    trajectoryPosThreshold: z.number().positive(),
    trajectoryNegThreshold: z.number().positive(),
    floorPortfolioPct: z.number().min(0).max(1),
    floorMinSignals: z.number().nonnegative(),
    floorWindowDays: z.number().positive(),
    cpaTarget: z.number().positive(),
    upperFunnelOverrideMult: z.number().positive(),
    upperFunnelOverrideWindow: z.number().positive(),
    sustainedPoorWindow: z.number().positive(),
    sustainedPoorMultiplier: z.number().positive(),
    newItemProtectDays: z.number().nonnegative(),
    learningConvThreshold: z.number().nonnegative(),
    learningMinDays: z.number().nonnegative(),
    minPurchasesSignif: z.number().nonnegative(),
    toggles: z.object({
      significanceGate: z.boolean(),
      minEventsPerWindow: z.number().nonnegative(),
      nonOverlappingMomentum: z.boolean(),
      saturationGamma: z.number().positive(),
    }),
    overflowMode: z.enum(['breach_best', 'underspend', 'relax_uniform']),
    // Optional objective-profile fields (set when a portfolio declares an objective).
    objective: OptimizationObjectiveSchema.optional(),
    kpiField: WindowMetricsSchema.keyof().optional(),
    velocityUpPct: z.number().min(0).max(5).optional(),
    velocityDownPct: z.number().min(0).max(1).optional(),
    ewmaAlpha: z.number().min(0).max(1).optional(),
  })
  // Sanity: weights for each trajectory state must sum to ~1.
  .refine(
    (c) =>
      [c.weightsNeutral, c.weightsPositive, c.weightsNegative].every(
        (w) => Math.abs(w.d3 + w.d7 + w.d14 - 1) < 1e-6,
      ),
    { message: 'Each trajectory weight set must sum to 1.0' },
  );

/** Deterministic trust in a measured efficiency signal (0..1). Mirrors the
 *  `Confidence` type in ./types — derived from objective predictiveness × sample
 *  size × within-signal consistency. Written to optimizer.cycle_runs.confidence. */
export const ConfidenceSchema = z.object({
  score: z.number().min(0).max(1), // 0..1 overall
  predictiveness: z.number(), // objective Spearman ceiling (prior)
  sampleSize: z.number().min(0).max(1), // 0..1, events/(events+k)
  consistency: z.number().min(0).max(1), // 0..1, 1 - CoV of the 3/7/14d per-$ scores
  events: z.number().nonnegative(), // raw KPI events in the 14d window
  band: z.enum(['low', 'medium', 'high']),
});

/** A single proposed action emitted by a cycle (budget change shown here). */
export const ProposedActionSchema = z.object({
  adSetId: z.string(),
  type: z.enum(['budget_change', 'pause', 'reactivate', 'flag_creative']),
  currentBudget: z.number().nonnegative(),
  proposedBudget: z.number().nonnegative(),
  changeAbs: z.number(),
  changePct: z.number(),
  reason: z.string(),
  capBreached: z.boolean().default(false),
  floorRelaxed: z.boolean().default(false),
});

export type ProposedAction = z.infer<typeof ProposedActionSchema>;
