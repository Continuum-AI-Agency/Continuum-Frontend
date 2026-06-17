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

export const AudienceTypeSchema = z.enum([
  'prospecting',
  'retargeting',
  'remarketing',
  'unknown',
]);

export const AdSetSnapshotSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: AdSetStatusSchema,
  currentBudget: z.number().nonnegative(),
  learningPhase: z.boolean().optional(),
  freeze: z.boolean().optional(),
  ageDays: z.number().nonnegative(),
  audienceType: AudienceTypeSchema.optional(),
  frequency7d: z.number().nonnegative().optional(),
  windows: z.object({
    d3: WindowMetricsSchema,
    d7: WindowMetricsSchema,
    d14: WindowMetricsSchema,
  }),
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
