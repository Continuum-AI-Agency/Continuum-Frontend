// Compiled plans, provider capability, evaluation contracts, and the compilation result.
//
// A generation emits a PLAN, not a string. That distinction is the whole reason this
// module exists: the moment a system's only output is prose, every multi-step idea —
// generate then composite the real logo, generate then edit the headline, render type
// deterministically — collapses into one hopeful provider call. And a collapsed plan
// fails silently: you get a plausible image with an invented logo and nothing reports
// that two steps became one.
//
// So the plan is discriminated by kind, every step names an executor, and an adapter
// that cannot run a step must refuse rather than skip it. `degradations` exists so that
// when a plan IS reduced, the reduction is a recorded fact with a reason attached.

import { z } from 'zod';
import { pinnedObjectRefSchema } from './creative-spec';
import { CONTENT_FAMILIES } from './families';
import { BLOCK_BUDGETS, boundedText, boundedTextArray } from './limits';
import { COPY_STRATEGIES, durableAssetRefSchema, REFERENCE_ROLES } from './references';
import {
  ALWAYS_FORBIDDEN_SIGNATURES,
  POLISH_LEVEL_OBSERVABLE,
  type PolishDirection,
  REALISM_DEVICE_PROFILE,
  SLOP_SIGNATURES,
  type SlopSignature,
} from './vocabulary';

/* -------------------------------------------------------------------------- */
/*  Provider capability                                                        */
/* -------------------------------------------------------------------------- */

export const PLAN_KINDS = [
  'single-generation',
  'generate-then-edit',
  'generate-then-compose',
  'deterministic-composition',
  'storyboard',
] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

/**
 * What a specific model can actually do, as of a specific date.
 *
 * `sourceUrl` and `verifiedOn` are required and non-nullable on purpose. Provider
 * capabilities drift constantly, and a profile asserted from memory is how a system
 * ends up confidently sending a negative prompt to an endpoint that discards it — which
 * is the exact failure the Fal lane has today. A profile without a citation is a rumour.
 */
export const providerCapabilityProfileSchema = z
  .object({
    providerId: z.string().min(1).max(60),
    modelId: z.string().min(1).max(120),
    profileVersion: z.number().int().min(1),

    contextCeilingCodePoints: z.number().int().min(1).nullable(),
    supportedAspectRatios: z.array(z.string().min(1).max(12)).min(1).max(20),
    /** False for models that accept a size argument and ignore it — a real case here. */
    sizeParameterHonored: z.boolean(),

    supportsNativeNegativePrompt: z.boolean(),
    maxReferenceImages: z.number().int().min(0).max(16),
    supportedReferenceRoles: z.array(z.enum(REFERENCE_ROLES)).max(REFERENCE_ROLES.length),
    supportsExactTextRendering: z.boolean(),
    supportsIterativeEdit: z.boolean(),
    supportedPlanKinds: z.array(z.enum(PLAN_KINDS)).min(1).max(PLAN_KINDS.length),
    maxCandidatesPerCall: z.number().int().min(1).max(16),

    sourceUrl: z.string().url(),
    verifiedOn: z.string().datetime(),
  })
  .strict();
export type ProviderCapabilityProfile = z.infer<typeof providerCapabilityProfileSchema>;

/* -------------------------------------------------------------------------- */
/*  Plan steps                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Who runs a step.
 *
 * `browser-only` is load-bearing: the headless runner already refuses node types it has
 * no server executor for, and this keeps that honesty at the plan level. A plan
 * containing a browser-only step is not headless-compatible, and labelling it otherwise
 * would produce a green run that never did the work.
 */
export const STEP_EXECUTORS = ['provider', 'server-compositor', 'browser-only', 'human'] as const;
export type StepExecutor = (typeof STEP_EXECUTORS)[number];

export const planStepSchema = z
  .object({
    index: z.number().int().min(1).max(20),
    executor: z.enum(STEP_EXECUTORS),
    operation: z.enum([
      'generate-image',
      'generate-video',
      'edit-image',
      'composite-layers',
      'render-typography',
      'place-logo-asset',
      'evaluate',
      'approve',
    ]),
    /** The prose this step sends, when it sends prose. Null for deterministic steps. */
    prompt: boundedText(0, 40_000).nullable(),
    negativePrompt: boundedText(0, 4_000).nullable(),
    referenceOrder: z.array(durableAssetRefSchema).max(16),
    /** Which earlier step's output this consumes. Null for the first generative step. */
    consumesStep: z.number().int().min(1).max(20).nullable(),
  })
  .strict();
export type PlanStep = z.infer<typeof planStepSchema>;

/**
 * A capability the plan asked for and did not get.
 *
 * Recorded, never inferred later. The distinction between "the model does not support
 * this" and "we chose not to use it" is exactly what a receipt has to preserve, because
 * six months on nobody remembers which it was.
 */
export const degradationSchema = z
  .object({
    capability: z.string().min(1).max(120),
    requested: boundedText(1, 300),
    actual: boundedText(1, 300),
    reason: boundedText(1, 300),
    /** True when the degradation removes a guarantee the user was shown. */
    userVisible: z.boolean(),
  })
  .strict();
export type Degradation = z.infer<typeof degradationSchema>;

export const compiledCreativePlanSchema = z
  .object({
    kind: z.enum(PLAN_KINDS),
    steps: z.array(planStepSchema).min(1).max(20),
    copyStrategy: z.enum(COPY_STRATEGIES),
    candidateCount: z.number().int().min(1).max(10),
    providerId: z.string().min(1).max(60),
    modelId: z.string().min(1).max(120),
    profileVersion: z.number().int().min(1),
    degradations: z.array(degradationSchema).max(20),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const indices = plan.steps.map((step) => step.index);
    if (new Set(indices).size !== indices.length) {
      ctx.addIssue({ code: 'custom', message: 'plan step indices must be unique' });
    }
    if (plan.kind === 'single-generation' && plan.steps.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'a single-generation plan has exactly one step',
        path: ['steps'],
      });
    }
    if (plan.kind === 'deterministic-composition') {
      const usesProvider = plan.steps.some((step) => step.executor === 'provider');
      if (usesProvider) {
        ctx.addIssue({
          code: 'custom',
          message: 'a deterministic-composition plan may not contain a provider step',
          path: ['steps'],
        });
      }
    }
  });
export type CompiledCreativePlan = z.infer<typeof compiledCreativePlanSchema>;

/** True when no step needs a browser — the only honest basis for a headless claim. */
export const isServerRunnable = (plan: CompiledCreativePlan): boolean =>
  plan.steps.every((step) => step.executor !== 'browser-only');

/* -------------------------------------------------------------------------- */
/*  Evaluation contract                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Checks derived from the SAME compilation that shaped the generation.
 *
 * Deriving them together is what stops the evaluator drifting from the brief: you
 * cannot forget to check the palette lock, because the thing that applied the palette
 * lock also emitted the check. It also stops the reverse failure — an evaluator
 * penalising an output for missing something nobody asked for.
 */
export const HARD_CHECK_KINDS = [
  'palette-conformance',
  'aspect-and-dimensions',
  'ocr-exact-copy',
  'no-legible-text',
  'logo-present-and-unmodified',
  'logo-absent',
  'product-identity-match',
  'person-identity-match',
  'forbidden-element-absent',
  'slop-signature-absent',
  'safe-area-clear',
  'clear-space-geometry',
  'occurrence-count',
  /** The polish axis, made checkable — see `realismHardChecks`. */
  'polish-level-match',
  'realism-device-present',
] as const;
export type HardCheckKind = (typeof HARD_CHECK_KINDS)[number];

export const hardCheckSchema = z
  .object({
    kind: z.enum(HARD_CHECK_KINDS),
    /** What the check is looking for, in terms a reviewer can read. */
    expectation: boundedText(3, 300),
    /** Which rule demanded it, so a failure can name its origin. */
    originRuleId: z.string().min(1).max(120).nullable(),
    /** Signatures this check screens for, when the kind is slop-signature-absent. */
    signatures: z.array(z.enum(SLOP_SIGNATURES)).max(SLOP_SIGNATURES.length),
  })
  .strict();
export type HardCheck = z.infer<typeof hardCheckSchema>;

/**
 * The polish declaration turned into its own evaluation seeds.
 *
 * This is what makes the anti-polish axis evaluable rather than nominal: the compiler
 * renders `REALISM_DEVICE_PROFILE[device].mechanism` into the prompt and this function
 * renders the SAME device's `evaluatorCue` into the check, so a device cannot be asked
 * for without also being looked for, and the two texts cannot drift because they come
 * out of one frozen table.
 *
 * It lives in `plan.ts` rather than beside the vocabulary because `HardCheck` is defined
 * here and `plan.ts` already imports `vocabulary.ts` — putting it the other way round
 * would make the two modules import each other.
 *
 * The forbidden-signature seed always carries `ALWAYS_FORBIDDEN_SIGNATURES` on top of
 * whatever the direction asked for, because those four are floor, not preference.
 */
export const realismHardChecks = (polish: PolishDirection): HardCheck[] => {
  const forbidden: SlopSignature[] = [
    ...new Set<SlopSignature>([...ALWAYS_FORBIDDEN_SIGNATURES, ...polish.forbidSignatures]),
  ];

  return [
    {
      kind: 'polish-level-match',
      expectation: POLISH_LEVEL_OBSERVABLE[polish.level],
      originRuleId: `polish-level:${polish.level}`,
      signatures: [],
    },
    ...polish.devices.map(
      (device): HardCheck => ({
        kind: 'realism-device-present',
        expectation: REALISM_DEVICE_PROFILE[device].evaluatorCue,
        originRuleId: `realism-device:${device}`,
        signatures: [],
      }),
    ),
    {
      kind: 'slop-signature-absent',
      expectation: 'None of the listed generated-image signatures appear anywhere in the frame.',
      originRuleId: 'anti-slop-baseline',
      signatures: forbidden,
    },
  ];
};

/**
 * A scored dimension. Weights are relative within a contract, not absolute.
 *
 * Deliberately separate from hard checks: averaging a fatal copy or identity violation
 * into a taste score is how a broken asset gets a passing grade. Hard checks gate;
 * rubric dimensions rank what already passed.
 */
export const rubricDimensionSchema = z
  .object({
    id: z.string().min(1).max(60),
    label: boundedText(1, 120),
    question: boundedText(8, 400),
    weight: z.number().min(0).max(1),
  })
  .strict();
export type RubricDimension = z.infer<typeof rubricDimensionSchema>;

export const creativeEvaluationContractSchema = z
  .object({
    hardChecks: z.array(hardCheckSchema).max(30),
    rubric: z.array(rubricDimensionSchema).max(12),
    /** Score below which a candidate is ineligible even with all hard checks passed. */
    minimumRubricScore: z.number().min(0).max(1),
    requiresHumanApproval: z.boolean(),
    /**
     * The generating model may not be the sole judge. Recorded here so a bench cannot
     * quietly satisfy the rubric with the model that produced the candidate.
     */
    judgeMustDifferFromGenerator: z.literal(true),
  })
  .strict();
export type CreativeEvaluationContract = z.infer<typeof creativeEvaluationContractSchema>;

/* -------------------------------------------------------------------------- */
/*  Compilation result                                                         */
/* -------------------------------------------------------------------------- */

export const COMPILATION_FAILURE_CODES = [
  'brand-hard-conflict',
  'missing-required-family-field',
  'exact-copy-unrenderable',
  'reference-role-unsupported',
  'required-block-over-budget',
  'plan-step-has-no-executor',
  'provider-unsupported-plan-kind',
  'unsatisfiable-product-fidelity',
] as const;
export type CompilationFailureCode = (typeof COMPILATION_FAILURE_CODES)[number];

export const compilationFailureSchema = z
  .object({
    code: z.enum(COMPILATION_FAILURE_CODES),
    message: boundedText(3, 400),
    /** Where in the spec the author can act. Empty for whole-spec failures. */
    path: z.array(z.string().min(1).max(60)).max(8),
    /** What the user can do about it. Required — a refusal with no remedy is a dead end. */
    remedies: boundedTextArray(3, 300).min(1).max(5),
  })
  .strict();
export type CompilationFailure = z.infer<typeof compilationFailureSchema>;

export const compilationWarningSchema = z
  .object({
    code: z.string().min(1).max(80),
    message: boundedText(3, 400),
    path: z.array(z.string().min(1).max(60)).max(8),
  })
  .strict();
export type CompilationWarning = z.infer<typeof compilationWarningSchema>;

const budgetBlockKeys = Object.keys(BLOCK_BUDGETS) as [string, ...string[]];

export const budgetReportSchema = z
  .object({
    byBlock: z.record(z.enum(budgetBlockKeys), z.number().int().min(0)),
    totalUsed: z.number().int().min(0),
    ceiling: z.number().int().min(1),
    /** Whole blocks dropped to fit. Never a partial string — see `limits.ts`. */
    omittedBlocks: z.array(z.enum(budgetBlockKeys)).max(budgetBlockKeys.length),
    overflow: z.boolean(),
  })
  .strict();
export type BudgetReport = z.infer<typeof budgetReportSchema>;

/**
 * The compiler's output, as a discriminated union rather than a throw.
 *
 * A refusal is a normal, expected, inspectable result — the system says no more often
 * than it says yes, and every no carries a remedy. Modelling that as an exception would
 * push callers toward catching and ignoring it.
 */
export const compilationResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('failed'),
      failures: z.array(compilationFailureSchema).min(1).max(20),
      warnings: z.array(compilationWarningSchema).max(30),
      budget: budgetReportSchema.nullable(),
      specHash: z.string().min(8).max(128),
    })
    .strict(),
  z
    .object({
      status: z.literal('compiled'),
      plan: compiledCreativePlanSchema,
      evaluation: creativeEvaluationContractSchema,
      warnings: z.array(compilationWarningSchema).max(30),
      budget: budgetReportSchema,
      pinnedVersions: z.array(pinnedObjectRefSchema).max(40),
      /** Canonicalized-input hash. Equal inputs must produce equal hashes on every surface. */
      specHash: z.string().min(8).max(128),
      /** Covers the plan, evaluation, and profile — the whole compiled artefact. */
      compilationHash: z.string().min(8).max(128),
      compilerVersion: z.string().min(1).max(40),
    })
    .strict(),
]);
export type CompilationResult = z.infer<typeof compilationResultSchema>;

/* -------------------------------------------------------------------------- */
/*  Receipts and qualification                                                 */
/* -------------------------------------------------------------------------- */

export const CANDIDATE_OUTCOMES = [
  'selected',
  'near-miss',
  'rejected-by-human',
  'failed-hard-check',
  'below-rubric-floor',
  'generation-error',
] as const;
export type CandidateOutcome = (typeof CANDIDATE_OUTCOMES)[number];

/**
 * One candidate's full evidence, including the losers.
 *
 * Losing candidates stay attached. A run that keeps only its winner cannot tell you
 * whether the preset is reliable or whether you got lucky once, and that difference is
 * the entire distinction between curation and qualification.
 */
export const candidateReceiptSchema = z
  .object({
    candidateIndex: z.number().int().min(1).max(10),
    asset: durableAssetRefSchema.nullable(),
    outcome: z.enum(CANDIDATE_OUTCOMES),
    failedChecks: z.array(z.enum(HARD_CHECK_KINDS)).max(HARD_CHECK_KINDS.length),
    rubricScore: z.number().min(0).max(1).nullable(),
    /** Required for a selected candidate — "looks best" is not a selection rationale. */
    selectionRationale: boundedText(8, 600).nullable(),
    providerError: boundedText(0, 600).nullable(),
  })
  .strict()
  .refine((receipt) => receipt.outcome !== 'selected' || !!receipt.selectionRationale, {
    message: 'a selected candidate must record why it was selected',
    path: ['selectionRationale'],
  });
export type CandidateReceipt = z.infer<typeof candidateReceiptSchema>;

export const creativeExampleReceiptSchema = z
  .object({
    receiptId: z.string().uuid(),
    recipeId: z.string().uuid(),
    specHash: z.string().min(8).max(128),
    compilationHash: z.string().min(8).max(128),
    pinnedVersions: z.array(pinnedObjectRefSchema).max(40),
    brandBookVersion: z.string().min(1).max(120).nullable(),
    providerId: z.string().min(1).max(60),
    modelId: z.string().min(1).max(120),
    profileVersion: z.number().int().min(1),
    candidates: z.array(candidateReceiptSchema).min(1).max(10),
    humanDecisionBy: z.string().min(1).max(120).nullable(),
    humanDecisionAt: z.string().datetime().nullable(),
    /** Hops the run did not exercise. Silence reads as full coverage, so this is required. */
    unexercisedHops: boundedTextArray(3, 300).max(10),
    createdAt: z.string().datetime(),
    /** Receipts are append-only; a correction points at what it replaces. */
    supersedes: z.string().uuid().nullable(),
  })
  .strict();
export type CreativeExampleReceipt = z.infer<typeof creativeExampleReceiptSchema>;

export const QUALIFICATION_STATUSES = [
  'draft',
  'curated',
  'qualified',
  'needs-regression',
  'deprecated',
] as const;
export type QualificationStatus = (typeof QUALIFICATION_STATUSES)[number];

/**
 * Reliability evidence for a preset version on a specific provider profile.
 *
 * `passAt1` and `successAt5` are both required because reporting only the second is the
 * standard way a shaky preset looks dependable. A preset that needs five attempts can
 * still be useful — it just may not claim to be a first-shot system.
 */
export const qualificationManifestSchema = z
  .object({
    presetRef: pinnedObjectRefSchema,
    family: z.enum(CONTENT_FAMILIES),
    providerId: z.string().min(1).max(60),
    modelId: z.string().min(1).max(120),
    profileVersion: z.number().int().min(1),
    status: z.enum(QUALIFICATION_STATUSES),

    runCount: z.number().int().min(1),
    briefCount: z.number().int().min(1),
    brandCount: z.number().int().min(1),

    passAt1: z.number().min(0).max(1),
    successAt5: z.number().min(0).max(1),
    hardPassRate: z.number().min(0).max(1),
    medianRubricScore: z.number().min(0).max(1),
    worstRubricScore: z.number().min(0).max(1),
    dispersion: z.number().min(0),
    duplicateRate: z.number().min(0).max(1),
    /** Uplift of the human-selected candidate over the median. The value of curating. */
    selectionUplift: z.number(),
    /** The thin free-text arm. Without it, "better" has nothing to be better than. */
    freeTextBaselinePassAt1: z.number().min(0).max(1).nullable(),

    receiptIds: z.array(z.string().uuid()).min(1).max(500),
    qualifiedBy: z.string().min(1).max(120).nullable(),
    qualifiedAt: z.string().datetime().nullable(),
  })
  .strict()
  .refine((manifest) => manifest.status !== 'qualified' || !!manifest.qualifiedBy, {
    message: 'a qualified manifest must record its human approver',
    path: ['qualifiedBy'],
  })
  .refine(
    (manifest) => manifest.status !== 'qualified' || manifest.freeTextBaselinePassAt1 !== null,
    {
      message: 'a qualified manifest must report the free-text baseline arm',
      path: ['freeTextBaselinePassAt1'],
    },
  );
export type QualificationManifest = z.infer<typeof qualificationManifestSchema>;
