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
  // Currencies an ad set can DECLARE it is buying. Absent here = uncounted, and an
  // uncounted event is indistinguishable from zero events at the scoring boundary —
  // which is how an account that bought 949 messaging conversations had every one of
  // its conversation ad sets frozen as "no conversions".
  conversations: z.number().int().nonnegative().optional(),
  linkClicks: z.number().int().nonnegative().optional(),
  thruplays: z.number().int().nonnegative().optional(),
  postEngagement: z.number().int().nonnegative().optional(),
});

/** The WindowMetrics fields that can serve as an optimization KPI (event counts).
 *  Must stay a subset of WindowMetrics' keys — `keyof WindowMetrics` on the TS side. */
export const KpiFieldSchema = z.enum([
  'purchases',
  'leads',
  'conversations',
  'linkClicks',
  'landingPageViews',
  'thruplays',
  'postEngagement',
  'appInstalls',
  'signups',
  'impressions',
  'clicks',
]);

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
  // Declared by real Meta ad sets; profiles are UNCALIBRATED (see objectives.ts).
  'conversations',
  'link_clicks',
  'thruplays',
  'post_engagement',
  'clicks',
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
  // The ad set buys a different currency than the portfolio prices. Not comparable, so
  // not compared — see runCycle's currency check.
  'kpi_mismatch',
]);

/** How far a creative standing can be trusted. Mirrors CreativeStandingFlag in ./types. */
export const CreativeStandingFlagSchema = z.enum([
  'single_creative',
  'low_evidence',
  'spend_concentrated',
  'thumbnail_derived_labels',
  'winner_below_average_quality',
  'winner_not_in_library',
]);

const CreativeStandingAdSchema = z.object({
  adId: z.string(),
  adName: z.string().optional(),
  creativeRowId: z.string().nullable().optional(),
  verdict: z.enum(['kill', 'scale', 'iterate', 'watch']).nullable().optional(),
  verdictReason: z.string().nullable().optional(),
  qualityRanking: z.string().nullable().optional(),
  spend: z.number(),
  events: z.number(),
  costPerEvent: z.number().nullable(),
  vsWinner: z.number().nullable().optional(),
  /** media.assets id — the head of the iteration chain. Null ⇒ never imported. */
  assetId: z.string().nullable().optional(),
  labels: z.record(z.string(), z.unknown()).nullable().optional(),
  posterUrl: z.string().nullable().optional(),
});

/** The standing of an ad set's CREATIVES against each other. Inside one ad set the
 *  audience, budget and goal are constant, so this is the only comparison that isolates
 *  the creative. `winner: null` means no winner is KNOWABLE (nothing ran against it) — it
 *  never means no winner exists. */
export const CreativeStandingSchema = z.object({
  winner: CreativeStandingAdSchema.nullable(),
  laggards: z.array(CreativeStandingAdSchema).default([]),
  eligibleAds: z.number().int().nonnegative(),
  totalAds: z.number().int().nonnegative(),
  killSpendShare: z.number().nullable(),
  belowAvgSpendShare: z.number().nullable(),
  medianCostPerEvent: z.number().nullable(),
  flags: z.array(CreativeStandingFlagSchema).default([]),
});

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
  /** Which WindowMetrics field this ad set's events are counted in — resolved at the
   *  ingest boundary from optimization_goal. USED IN SCORING (unlike `angle` below):
   *  it is the currency the ad set declared it was buying. Absent ⇒ the portfolio's.
   *
   *  Enumerated, not a free string: a typo'd field name would read `undefined` out of
   *  every window, score zero events, and freeze the ad set — a measurement failure
   *  wearing the costume of a finding. */
  kpiField: KpiFieldSchema.optional(),
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  adCount: z.number().int().nonnegative().optional(),
  /** Dominant communication-angle archetype of the ad set's creatives (spend-weighted
   *  mode of the paid-creative-intel labels). Metadata for the audience × angle heat
   *  map (optimizer_get_angle_matrix) — not used in scoring. Absent ⇒ untagged. */
  angle: z.string().optional(),
  /** How this ad set's creatives stand against each other (paid_media_get_adset_creative_standing).
   *  Drives the creative triggers. The budget maths never reads it — but a RAISE can be
   *  withheld because of it. */
  creative: CreativeStandingSchema.optional(),
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
  // d90 was dropped: nothing ever read it, and pulling 90 days of daily rows was 89% of a
  // cold ingest. z.object strips unknown keys, so a payload from an older edge that still
  // carries d90 parses fine — which is what makes the service safe to deploy BEFORE the edge.
  archivalWindows: z
    .object({
      d30: WindowMetricsSchema,
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
