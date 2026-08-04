// ---------------------------------------------------------------------------
// Trial reels — the wire shapes for a converging creative trial.
//
// A trial searches the creative space (angle × hook × CTA × opening frame) for a variant
// that measurably beats the others, one round at a time, until it either converges on a
// winner or runs out of road. These are the shapes that cross the Backend↔Frontend boundary
// and the shapes the Goal harness checkpoint persists between resumes.
//
// The DECISION logic lives in `@continuum/trial-engine` and is deliberately not imported
// here — contracts stay dependency-light. The two are kept honest by the Backend, which
// passes contract-typed values straight into the engine: if they drift, the Backend stops
// typechecking.
//
// Vocabulary is REUSED, never re-declared. `hook` and `cta` come from the cross-side
// creative taxonomy so a trial's findings join to paid creative intel on the same
// dimensions. `cta` in particular has been a declared-but-unlabeled dimension since
// taxonomy v3 — trials are the first thing to actually measure it.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { creativeHookArchetypeSchema, ctaStrategySchema } from '../creative-strategy/taxonomy';

const idSchema = z.string().trim().min(1).max(240);
const textSchema = z.string().trim().min(1);
const timestampSchema = z.iso.datetime({ offset: true });

/**
 * A taxonomy slug (`value-first`, `founder-to-camera`).
 *
 * Used for `angle` and `openingFrame`, which have no closed enum: angle is governed by the
 * per-brand `creative_concepts` vocabulary, and `opening_frame_type` is free text on
 * `paid_media.ad_creatives`. Inventing an enum here would create a second vocabulary that
 * immediately drifts from the labeler.
 */
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/,
    'Taxonomy slugs are lowercase, hyphen or underscore separated.',
  );

// --- the search space ------------------------------------------------------------------

export const TRIAL_DIMENSION_KEYS = ['angle', 'hook', 'cta', 'openingFrame'] as const;
export const trialDimensionKeySchema = z.enum(TRIAL_DIMENSION_KEYS);
export type TrialDimensionKey = z.infer<typeof trialDimensionKeySchema>;

/** One point in the creative space. Every axis is optional — a trial may search only two of
 *  them — but a variant with no dimensions at all cannot teach anything, so at least one is
 *  required. */
export const trialDimensionsSchema = z
  .object({
    angle: slugSchema.optional(),
    hook: creativeHookArchetypeSchema.optional(),
    cta: ctaStrategySchema.optional(),
    openingFrame: slugSchema.optional(),
  })
  .strict()
  .refine((dimensions) => Object.values(dimensions).some(Boolean), {
    message: 'A trial variant must occupy at least one labelled dimension.',
  });
export type TrialDimensions = z.infer<typeof trialDimensionsSchema>;

// --- arms ------------------------------------------------------------------------------

/**
 * Which vehicle ran the trial.
 *
 * `organic_trial_reel` is an Instagram trial reel — served only to non-followers and free,
 * which is why discovery happens here. `paid_adset` is the confirmation arm: the surviving
 * coordinate re-tested inside ONE ad set, where audience and budget are held constant.
 */
export const trialArmSchema = z.enum(['organic_trial_reel', 'paid_adset']);
export type TrialArm = z.infer<typeof trialArmSchema>;

/** Meta's `trial_params.graduation_strategy`. `MANUAL` keeps the decision to publish a
 *  winner to followers with a human; `SS_PERFORMANCE` lets Instagram graduate it. */
export const trialGraduationStrategySchema = z.enum(['MANUAL', 'SS_PERFORMANCE']);
export type TrialGraduationStrategy = z.infer<typeof trialGraduationStrategySchema>;

export const trialMetricDirectionSchema = z.enum(['higher_is_better', 'lower_is_better']);
export type TrialMetricDirection = z.infer<typeof trialMetricDirectionSchema>;

export const trialMetricSchema = z
  .object({
    key: textSchema.max(120),
    unit: z.string().trim().max(16),
    direction: trialMetricDirectionSchema,
  })
  .strict();
export type TrialMetric = z.infer<typeof trialMetricSchema>;

// --- variants --------------------------------------------------------------------------

/** A variant as PLANNED: the coordinate plus the creative direction that expresses it.
 *  Produced by the agent, approved by a human, then published. */
export const trialVariantPlanSchema = z
  .object({
    variantId: idSchema,
    label: textSchema.max(300),
    dimensions: trialDimensionsSchema,
    /** The creative direction handed to generation. Prose, not a prompt. */
    brief: textSchema.max(4_000),
    /** Set once the variant has media attached. */
    mediaAssetId: idSchema.nullable().default(null),
    caption: z.string().trim().max(2_200).nullable().default(null),
  })
  .strict();
export type TrialVariantPlan = z.infer<typeof trialVariantPlanSchema>;

/** A variant as MEASURED. Structurally the engine's `TrialVariantResult`. */
export const trialVariantResultSchema = z
  .object({
    variantId: idSchema,
    label: textSchema.max(300).optional(),
    dimensions: trialDimensionsSchema,
    /**
     * People who actually saw it. The evidence floor applies HERE, never to `score`.
     */
    exposures: z.number().int().nonnegative(),
    /**
     * The primary metric. `null` means MEASURED AND EMPTY — it cleared the floor and
     * produced no signal. It must never be used for "we failed to read this", because a
     * missing read silently becomes the worst performer.
     */
    score: z.number().nullable(),
    /** Paid arm only. Organic trial reels cost nothing, which is the point of using them. */
    spend: z.number().nonnegative().optional(),
    /** The published post/ad this measurement came from. */
    publishedMediaId: idSchema.nullable().default(null),
  })
  .strict();
export type TrialVariantResult = z.infer<typeof trialVariantResultSchema>;

// --- standings -------------------------------------------------------------------------

export const trialWithheldReasonSchema = z.enum([
  'single_variant',
  'no_variant_cleared_floor',
  'margin_below_threshold',
  'no_signal',
]);
export type TrialWithheldReason = z.infer<typeof trialWithheldReasonSchema>;

export const trialFlagSchema = z.enum([
  'thin_evidence',
  'single_variant',
  'exposure_skewed',
  'no_signal',
  'tie',
]);
export type TrialFlag = z.infer<typeof trialFlagSchema>;

export const trialStandingSchema = z
  .object({
    roundNumber: z.number().int().positive(),
    metric: trialMetricSchema,
    /** Exactly complementary to `withheldReason`: one is set iff the other is null. */
    winner: trialVariantResultSchema.nullable(),
    runnerUp: trialVariantResultSchema.nullable(),
    contenders: z.array(trialVariantResultSchema).max(50),
    /** Ran but never accumulated enough exposure to judge. Not losers — unmeasured. */
    underpowered: z.array(trialVariantResultSchema).max(50),
    laggards: z.array(trialVariantResultSchema).max(50),
    median: z.number().nullable(),
    /** `null` when unbounded (the runner-up produced no signal) is not applicable. */
    marginRatio: z.number().nullable(),
    withheldReason: trialWithheldReasonSchema.nullable(),
    flags: z.array(trialFlagSchema).max(10),
    /** Deterministic citations, assembled before any model ran. */
    groundedOn: z.array(textSchema.max(1_000)).max(60),
  })
  .strict()
  .refine((standing) => (standing.winner === null) === (standing.withheldReason !== null), {
    path: ['withheldReason'],
    message: 'A standing must either name a winner or say why it withheld one.',
  });
export type TrialStanding = z.infer<typeof trialStandingSchema>;

// --- the fence -------------------------------------------------------------------------

/** The operator's fence, set once when the Goal is created. The loop may never exceed it. */
export const trialFenceSchema = z
  .object({
    maxRounds: z.number().int().min(1).max(50),
    maxVariantsPerRound: z.number().int().min(2).max(10),
    minExposuresPerVariant: z.number().int().min(1),
    minMarginRatio: z.number().min(1),
    dryRoundsBeforeStop: z.number().int().min(1).max(10),
    minConfirmingRounds: z.number().int().min(1).max(10),
    /** Paid arm only. `null` disables the check — organic trials are free. */
    spendCap: z.number().nonnegative().nullable(),
  })
  .strict()
  .refine((fence) => fence.minConfirmingRounds <= fence.maxRounds, {
    path: ['minConfirmingRounds'],
    message: 'A trial cannot require more confirming rounds than it is allowed to run.',
  })
  .refine((fence) => fence.maxVariantsPerRound >= 2, {
    path: ['maxVariantsPerRound'],
    message: 'A round with one variant is an assertion, not an experiment.',
  });
export type TrialFence = z.infer<typeof trialFenceSchema>;

// --- rounds and decisions --------------------------------------------------------------

export const trialRoundSchema = z
  .object({
    roundNumber: z.number().int().positive(),
    arm: trialArmSchema,
    variants: z.array(trialVariantResultSchema).max(50),
    publishedAt: timestampSchema.nullable().default(null),
    measuredAt: timestampSchema.nullable().default(null),
    standing: trialStandingSchema.optional(),
  })
  .strict();
export type TrialRound = z.infer<typeof trialRoundSchema>;

export const trialDimensionGapSchema = z
  .object({
    dimension: trialDimensionKeySchema,
    tried: z.array(textSchema.max(120)).max(200),
    hint: z.enum(['hold', 'vary']),
    holdValue: textSchema.max(120).optional(),
    rationale: textSchema.max(1_000),
  })
  .strict();
export type TrialDimensionGap = z.infer<typeof trialDimensionGapSchema>;

export const trialExhaustionCauseSchema = z.enum(['max_rounds', 'spend_cap', 'dry']);
export type TrialExhaustionCause = z.infer<typeof trialExhaustionCauseSchema>;

export const trialDecisionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('continue'),
      nextRoundNumber: z.number().int().positive(),
      explore: z.array(trialDimensionGapSchema).max(10),
      reason: textSchema.max(2_000),
      groundedOn: z.array(textSchema.max(1_000)).max(80),
    })
    .strict(),
  z
    .object({
      kind: z.literal('converged'),
      winner: trialVariantResultSchema,
      standing: trialStandingSchema,
      confirmingRounds: z.number().int().positive(),
      reason: textSchema.max(2_000),
      groundedOn: z.array(textSchema.max(1_000)).max(80),
    })
    .strict(),
  z
    .object({
      kind: z.literal('exhausted'),
      cause: trialExhaustionCauseSchema,
      /** `null` means the trial learned nothing — which must be reported as such, never
       *  dressed up as a winner. */
      bestSoFar: trialVariantResultSchema.nullable(),
      reason: textSchema.max(2_000),
      groundedOn: z.array(textSchema.max(1_000)).max(80),
    })
    .strict(),
]);
export type TrialDecision = z.infer<typeof trialDecisionSchema>;

// --- the harness checkpoint ------------------------------------------------------------

/**
 * What the Goal harness persists between resumes.
 *
 * A trial can span weeks: the loop publishes a round, parks, wakes on a timer once views
 * have accumulated, measures, and either loops or finishes. Everything needed to pick the
 * loop back up lives here, because the process that started it will not be the process that
 * finishes it.
 *
 * `version` is checked on resume — a checkpoint written by an older shape must be migrated
 * or abandoned deliberately, never silently misread.
 */
export const TRIAL_CHECKPOINT_VERSION = 1;

export const trialCheckpointSchema = z
  .object({
    version: z.literal(TRIAL_CHECKPOINT_VERSION),
    arm: trialArmSchema,
    metric: trialMetricSchema,
    fence: trialFenceSchema,
    graduationStrategy: trialGraduationStrategySchema,
    rounds: z.array(trialRoundSchema).max(50),
    spentTotal: z.number().nonnegative().default(0),
    /** The slate awaiting human approval, if the loop is parked on one. */
    pendingSlate: z.array(trialVariantPlanSchema).max(10).nullable().default(null),
    lastDecision: trialDecisionSchema.nullable().default(null),
    /** When the loop asked to be woken to measure the round in market. */
    measureAfter: timestampSchema.nullable().default(null),
  })
  .strict();
export type TrialCheckpoint = z.infer<typeof trialCheckpointSchema>;

// --- publishing ------------------------------------------------------------------------

/** What the organic publisher needs to put one variant into market as a trial reel. */
export const trialReelPublishSpecSchema = z
  .object({
    variantId: idSchema,
    videoUrl: z.string().url(),
    caption: z.string().trim().max(2_200).optional(),
    coverUrl: z.string().url().optional(),
    graduationStrategy: trialGraduationStrategySchema,
  })
  .strict();
export type TrialReelPublishSpec = z.infer<typeof trialReelPublishSpecSchema>;
