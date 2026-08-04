// The Taste discovery action space — the tools an agent is actually given.
//
// This module exists because of one failure mode: an agent handed the whole Taste
// library picks by surface similarity. Forty presets in a system prompt is not
// discovery, it is a reading comprehension test the model fails politely, and the
// symptom is ten nearly identical "luxury" results presented as a choice.
//
// So the action space is small, typed, and staged. Search returns bounded manifest
// cards (`library.ts` owns the card; nothing here redeclares it). Inspection loads one
// object's requested sections. Resolution binds to a brand and reports what is missing.
// Preview projects the compiled plan. Generation is NOT here at all — a discovery tool
// that can call a provider becomes the catch-all executor every agent then reaches for.
//
// The envelope is the other half of the design. `status` + `warnings[].code` mean an
// empty result is never ambiguous: "nothing matched", "you are not allowed to see it",
// "your provider cannot run it", and "the search broke" are four different situations
// with four different correct next moves, and an agent that has to guess between them
// retries the same call.

import { z } from 'zod';

import { communicationJobSchema, conceptSchema, deliverySchema } from './creative-spec';
import { CONTENT_FAMILIES } from './families';
import {
  BRAND_COMPATIBILITY,
  OWNERSHIP_SCOPES,
  TASTE_OBJECT_KINDS,
  type TasteManifestCard,
  tasteManifestCardSchema,
} from './library';
import {
  boundedText,
  boundedTextArray,
  countCodePoints,
  FREEFORM_PROMPT_HARD_LIMIT,
} from './limits';
import {
  budgetReportSchema,
  degradationSchema,
  PLAN_KINDS,
  QUALIFICATION_STATUSES,
  STEP_EXECUTORS,
} from './plan';
import {
  COPY_STRATEGIES,
  copyItemSchema,
  durableAssetRefSchema,
  REFERENCE_ROLES,
  REFERENCE_STRENGTHS,
} from './references';
import { POLISH_LEVELS } from './vocabulary';

/* -------------------------------------------------------------------------- */
/*  Bounds                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Result caps. These are the whole reason the layer exists, so they are constants
 * rather than parameters with generous defaults.
 *
 * Twelve cards of at most 1,200 code points each puts a worst-case search at ~14k code
 * points of agent context. The same catalog injected whole is two orders of magnitude
 * larger and — the part that actually matters — is the same size on every turn.
 */
export const TASTE_SEARCH_DEFAULT_LIMIT = 6;
export const TASTE_SEARCH_MAX_LIMIT = 12;
export const TASTE_CARD_MAX_CODE_POINTS = 1_200;

/** Section budget for `inspect_taste_object`. Sections are omitted whole, never sliced. */
export const TASTE_INSPECT_DEFAULT_CODE_POINTS = 4_000;
export const TASTE_INSPECT_MAX_CODE_POINTS = 12_000;

/**
 * The number of meaningfully different directions a good recommendation carries.
 *
 * Two or three, per doc 25. Not a display preference: past three the agent stops
 * explaining tradeoffs and starts listing, and a list is what discovery replaced.
 */
export const TASTE_TARGET_DISTINCT_DIRECTIONS = 3;

/**
 * A card's context cost, counted the way `limits.ts` counts everything a human reads.
 *
 * Measured on the serialized card because that is what actually enters the agent's
 * context — counting only the prose fields would under-report by the key names.
 */
export const tasteCardCodePoints = (card: TasteManifestCard): number =>
  countCodePoints(JSON.stringify(card));

export const isTasteCardWithinBound = (card: TasteManifestCard): boolean =>
  tasteCardCodePoints(card) <= TASTE_CARD_MAX_CODE_POINTS;

/* -------------------------------------------------------------------------- */
/*  Tool names                                                                 */
/* -------------------------------------------------------------------------- */

export const TASTE_READ_TOOLS = [
  'search_taste_library',
  'inspect_taste_object',
  'resolve_taste_recipe',
  'preview_taste_plan',
] as const;

/**
 * Writes are separate tools, not flags on a read tool.
 *
 * A `save: true` parameter on search is how an agent publishes a brand preset by
 * accident. Separate names mean separate permissions and separate audit rows.
 */
export const TASTE_WRITE_TOOLS = [
  'save_taste_draft',
  'fork_taste_object',
  'propose_taste_object',
  'publish_taste_version',
  'attach_taste_example',
] as const;

export const TASTE_TOOL_NAMES = [...TASTE_READ_TOOLS, ...TASTE_WRITE_TOOLS] as const;
export type TasteToolName = (typeof TASTE_TOOL_NAMES)[number];

/* -------------------------------------------------------------------------- */
/*  Envelope                                                                   */
/* -------------------------------------------------------------------------- */

export const TASTE_TOOL_STATUSES = ['success', 'warning', 'error'] as const;
export type TasteToolStatus = (typeof TASTE_TOOL_STATUSES)[number];

/**
 * Every distinguishable reason a Taste tool returned less than the caller hoped.
 *
 * The first five are the ones doc 25 names explicitly, because they are the five an
 * agent confuses when all it sees is `[]`. The rest exist so that "the object is stale",
 * "the reference is missing", and "you may propose but not publish" are also codes
 * rather than prose an agent has to parse.
 */
export const TASTE_WARNING_CODES = [
  'NO_MATCH',
  'ACCESS_DENIED',
  'PROVIDER_INCOMPATIBLE',
  'BRAND_CONFLICT',
  'SEARCH_FAILED',
  'MISSING_REQUIRED_INPUT',
  'MISSING_REFERENCE',
  'CONTEXT_OVERFLOW',
  'UNQUALIFIED_OBJECT',
  'STALE_VERSION',
  'BROWSER_ONLY_PLAN',
  'NO_SUITABLE_PRESET',
  'WRITE_PERMISSION_REQUIRED',
  'APPROVER_IS_PROPOSER',
  'QUALIFICATION_EVIDENCE_MISSING',
  'SHORTCUT_EXPANDED',
  'RESULT_CAP_REACHED',
  'NEAR_DUPLICATES_WITHHELD',
  'SECTION_OMITTED_FOR_BUDGET',
  'CARD_EXCEEDS_BOUND',
  'BRAND_DIRECTION_ABSENT',
  'STYLE_SENSITIVITY_DECLARED',
] as const;
export type TasteWarningCode = (typeof TASTE_WARNING_CODES)[number];

export const tasteWarningSchema = z
  .object({
    code: z.enum(TASTE_WARNING_CODES),
    message: boundedText(3, 400),
    /** The object the warning is about, when it is about one. */
    objectId: z.string().min(1).max(120).nullable(),
    /** The exact field or facet, so an agent can act instead of re-reading prose. */
    field: z.string().min(1).max(120).nullable(),
  })
  .strict();
export type TasteWarning = z.infer<typeof tasteWarningSchema>;

/**
 * An executable next move, not a suggestion in prose.
 *
 * `args` is a partial call — the agent should be able to run it without re-deriving the
 * parameters from the summary sentence, which is where "relax one filter" turns into
 * "drop all filters and try again".
 */
export const tasteNextActionSchema = z
  .object({
    tool: z.enum(TASTE_TOOL_NAMES),
    why: boundedText(3, 300),
    args: z.record(z.string(), z.unknown()),
  })
  .strict();
export type TasteNextAction = z.infer<typeof tasteNextActionSchema>;

export const TASTE_ARTIFACT_KINDS = [
  'taste-object',
  'recipe',
  'asset',
  'receipt',
  'report',
] as const;
export type TasteArtifactKind = (typeof TASTE_ARTIFACT_KINDS)[number];

export const tasteArtifactRefSchema = z
  .object({
    kind: z.enum(TASTE_ARTIFACT_KINDS),
    id: z.string().min(1).max(200),
    versionId: z.string().min(1).max(120).nullable(),
  })
  .strict();
export type TasteArtifactRef = z.infer<typeof tasteArtifactRefSchema>;

/**
 * Cause, safe retry, stop condition — required on every error.
 *
 * The stop condition is the field that is always missing in practice and always the one
 * that matters: without it an agent that cannot succeed retries until its budget is
 * gone, and the transcript shows five identical calls with no explanation.
 */
export const tasteRecoverySchema = z
  .object({
    rootCauseHint: boundedText(8, 400),
    safeRetry: boundedText(8, 400),
    stopCondition: boundedText(8, 400),
  })
  .strict();
export type TasteRecovery = z.infer<typeof tasteRecoverySchema>;

export interface TasteToolResult<T> {
  readonly status: TasteToolStatus;
  readonly summary: string;
  readonly data?: T;
  readonly warnings: readonly TasteWarning[];
  readonly nextActions: readonly TasteNextAction[];
  readonly artifacts: readonly TasteArtifactRef[];
  readonly recovery?: TasteRecovery;
}

/**
 * The runtime envelope, parameterized by its payload.
 *
 * The three refinements are the contract an agent relies on: an error carries no data,
 * an error names at least one coded cause, and an error always says how to recover and
 * when to stop. A tool that returns `status: 'error'` with an empty `warnings` array has
 * told the agent nothing it can act on.
 */
export const tasteToolResultSchema = <T extends z.ZodTypeAny>(data: T) =>
  z
    .object({
      status: z.enum(TASTE_TOOL_STATUSES),
      summary: boundedText(3, 400),
      data: data.optional(),
      warnings: z.array(tasteWarningSchema).max(20),
      nextActions: z.array(tasteNextActionSchema).max(8),
      artifacts: z.array(tasteArtifactRefSchema).max(24),
      recovery: tasteRecoverySchema.optional(),
    })
    .strict()
    .superRefine((result, ctx) => {
      if (result.status !== 'error') return;
      if (result.recovery === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'an error result must carry a cause, a safe retry, and a stop condition',
          path: ['recovery'],
        });
      }
      if (result.warnings.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'an error result must name at least one coded cause',
          path: ['warnings'],
        });
      }
      if (result.data !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'an error result must not carry data',
          path: ['data'],
        });
      }
    });

/* -------------------------------------------------------------------------- */
/*  search_taste_library                                                       */
/* -------------------------------------------------------------------------- */

export const TASTE_QUALIFICATION_FLOORS = ['draft', 'curated', 'qualified'] as const;
export type TasteQualificationFloor = (typeof TASTE_QUALIFICATION_FLOORS)[number];

/**
 * Search input.
 *
 * `availableInputs` and `availableReferenceRoles` are additions to doc 25's sketch and
 * they earn their place: ranking step 4 is "required input/reference availability", and
 * without knowing what the caller already has, that step is unimplementable and the
 * ranker silently skips it. Organic knows which references a placement has; Jaina knows
 * which brief fields the user supplied. Both being absent is legal and means "unknown",
 * which ties every candidate at that tier rather than pretending.
 */
export const searchTasteLibraryInputSchema = z
  .object({
    brandId: z.string().uuid(),
    query: boundedText(1, 400).nullable().default(null),
    kinds: z.array(z.enum(TASTE_OBJECT_KINDS)).max(TASTE_OBJECT_KINDS.length).default([]),
    communicationJob: z.string().min(1).max(60).nullable().default(null),
    familyId: z.enum(CONTENT_FAMILIES).nullable().default(null),
    preFormatId: z.string().min(1).max(60).nullable().default(null),
    placement: z.string().min(1).max(24).nullable().default(null),
    medium: z.string().min(1).max(60).nullable().default(null),
    mechanism: z.string().min(1).max(60).nullable().default(null),
    ownership: z.array(z.enum(OWNERSHIP_SCOPES)).max(OWNERSHIP_SCOPES.length).default([]),
    minimumQualification: z.enum(TASTE_QUALIFICATION_FLOORS).nullable().default(null),
    providerId: z.string().min(1).max(120).nullable().default(null),
    /** Named inputs the caller can already supply, for the required-input ranking tier. */
    availableInputs: z.array(z.string().min(1).max(80)).max(20).default([]),
    availableReferenceRoles: z
      .array(z.enum(REFERENCE_ROLES))
      .max(REFERENCE_ROLES.length)
      .default([]),
    limit: z.number().int().min(1).max(TASTE_SEARCH_MAX_LIMIT).default(TASTE_SEARCH_DEFAULT_LIMIT),
  })
  .strict();
export type SearchTasteLibraryInput = z.infer<typeof searchTasteLibraryInputSchema>;

/**
 * Which facet killed how many candidates.
 *
 * This is what makes a zero-result recoverable. "No matches" tells an agent to give up
 * or to drop every filter; "the provider filter eliminated 14 and the placement filter
 * eliminated 2" tells it exactly which single facet to relax.
 */
export const tasteAppliedFilterSchema = z
  .object({
    facet: z.string().min(1).max(60),
    value: z.string().min(1).max(120),
    eliminated: z.number().int().min(0),
    /** False for facets a caller must not be told to relax — tenancy, status, brand hard. */
    relaxable: z.boolean(),
  })
  .strict();
export type TasteAppliedFilter = z.infer<typeof tasteAppliedFilterSchema>;

export const searchTasteLibraryOutputSchema = z
  .object({
    cards: z.array(tasteManifestCardSchema).max(TASTE_SEARCH_MAX_LIMIT),
    /** Candidates that survived every hard gate, before the result cap. */
    totalEligible: z.number().int().min(0),
    /** Everything the tenancy scope contained, before any filter. */
    totalConsidered: z.number().int().min(0),
    appliedFilters: z.array(tasteAppliedFilterSchema).max(24),
    /** How many genuinely different directions the returned set covers. */
    distinctDirections: z.number().int().min(0),
    /** Near-duplicates the diversity pass held back, so the number is never invisible. */
    withheldNearDuplicates: z.number().int().min(0),
    diversityNote: boundedText(3, 300),
    /** Total code points the returned cards will cost the agent's context. */
    contextCodePoints: z.number().int().min(0),
  })
  .strict();
export type SearchTasteLibraryOutput = z.infer<typeof searchTasteLibraryOutputSchema>;

/* -------------------------------------------------------------------------- */
/*  inspect_taste_object                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The sections an object can be asked for.
 *
 * A closed list rather than a free string, because the point of progressive disclosure
 * is that the agent names what it needs — and a name the service does not recognise
 * silently returns nothing, which reads identically to "this object has no laws".
 */
export const TASTE_OBJECT_SECTIONS = [
  'summary',
  'laws',
  'slots',
  'defaults',
  'exclusions',
  'copyStrategy',
  'brandBindings',
  'examples',
  'failures',
  'providerSupport',
  'qualification',
  'changelog',
  'provenance',
] as const;
export type TasteObjectSection = (typeof TASTE_OBJECT_SECTIONS)[number];

export const inspectTasteObjectInputSchema = z
  .object({
    brandId: z.string().uuid(),
    id: z.string().min(1).max(120),
    /** Omitted means the latest non-deprecated version. */
    version: z.number().int().min(1).nullable().default(null),
    sections: z
      .array(z.enum(TASTE_OBJECT_SECTIONS))
      .max(TASTE_OBJECT_SECTIONS.length)
      .default(['summary']),
    maxCodePoints: z
      .number()
      .int()
      .min(200)
      .max(TASTE_INSPECT_MAX_CODE_POINTS)
      .default(TASTE_INSPECT_DEFAULT_CODE_POINTS),
  })
  .strict();
export type InspectTasteObjectInput = z.infer<typeof inspectTasteObjectInputSchema>;

export const tasteQualificationSummarySchema = z
  .object({
    status: z.enum(QUALIFICATION_STATUSES),
    runCount: z.number().int().min(0),
    briefCount: z.number().int().min(0),
    passAt1: z.number().min(0).max(1).nullable(),
    successAt5: z.number().min(0).max(1).nullable(),
    lastQualifiedAt: z.string().datetime().nullable(),
    /** What the evidence does NOT cover. Silence here reads as full coverage. */
    caveats: boundedTextArray(3, 300).max(8),
  })
  .strict();
export type TasteQualificationSummary = z.infer<typeof tasteQualificationSummarySchema>;

export const tasteBrandCompatibilityReportSchema = z
  .object({
    verdict: z.enum(BRAND_COMPATIBILITY),
    /** Exact brand rule ids that decided the verdict, never a paraphrase. */
    conflictingRuleIds: z.array(z.string().min(1).max(120)).max(20),
    /** The object's own field each rule collided with. */
    conflictingFields: z.array(z.string().min(1).max(120)).max(20),
    /** True when a campaign override could legally resolve it. */
    overridable: z.boolean(),
    notes: boundedTextArray(3, 300).max(8),
  })
  .strict();
export type TasteBrandCompatibilityReport = z.infer<typeof tasteBrandCompatibilityReportSchema>;

export const inspectTasteObjectOutputSchema = z
  .object({
    id: z.string().min(1).max(120),
    version: z.number().int().min(1),
    kind: z.enum(TASTE_OBJECT_KINDS),
    /**
     * Only the sections that were requested AND fit the budget.
     *
     * `partialRecord` rather than `record`, because a Zod v4 enum-keyed record is
     * EXHAUSTIVE — it would demand every section on every response, which is the exact
     * opposite of progressive disclosure.
     */
    sections: z.partialRecord(z.enum(TASTE_OBJECT_SECTIONS), z.string()),
    requestedSections: z.array(z.enum(TASTE_OBJECT_SECTIONS)).max(TASTE_OBJECT_SECTIONS.length),
    /**
     * Sections the budget cut. They are dropped WHOLE and named here — a half-rendered
     * preset law reads as authoritative and instructs nothing.
     */
    truncatedSections: z.array(z.enum(TASTE_OBJECT_SECTIONS)).max(TASTE_OBJECT_SECTIONS.length),
    codePointsUsed: z.number().int().min(0),
    qualification: tasteQualificationSummarySchema,
    brandCompatibility: tasteBrandCompatibilityReportSchema,
  })
  .strict();
export type InspectTasteObjectOutput = z.infer<typeof inspectTasteObjectOutputSchema>;

/* -------------------------------------------------------------------------- */
/*  resolve_taste_recipe                                                       */
/* -------------------------------------------------------------------------- */

export const tasteSelectionSchema = z
  .object({
    familyId: z.enum(CONTENT_FAMILIES).nullable().default(null),
    preFormatId: z.string().min(1).max(60).nullable().default(null),
    presetId: z.string().min(1).max(120).nullable().default(null),
    presetVersion: z.number().int().min(1).nullable().default(null),
    templateId: z.string().min(1).max(120).nullable().default(null),
    shortcutId: z.string().min(1).max(120).nullable().default(null),
    styleId: z.string().min(2).max(60).nullable().default(null),
    skillIds: z.array(z.string().min(1).max(120)).max(8).default([]),
  })
  .strict();
export type TasteSelection = z.infer<typeof tasteSelectionSchema>;

/**
 * The brief, as much of it as exists yet.
 *
 * Deliberately a partial view of `CreativeSpecV1` rather than a second brief type. The
 * whole job of resolution is to report what is still MISSING, so it has to accept an
 * incomplete object — but every field it does accept is the same field, with the same
 * bounds, that the compiler will later resolve. A parallel "discovery brief" shape is
 * exactly the drift this program forbids.
 */
export const tasteRecipeBriefSchema = z
  .object({
    job: communicationJobSchema.partial().optional(),
    delivery: deliverySchema.partial().optional(),
    concept: conceptSchema.partial().optional(),
    copy: z
      .object({
        strategy: z.enum(COPY_STRATEGIES).optional(),
        items: z.array(copyItemSchema).max(12).optional(),
        allowAdditionalText: z.boolean().optional(),
      })
      .strict()
      .optional(),
    polish: z
      .object({ level: z.enum(POLISH_LEVELS).optional() })
      .strict()
      .optional(),
    freeformBrief: boundedText(0, FREEFORM_PROMPT_HARD_LIMIT).optional(),
  })
  .strict();
export type TasteRecipeBrief = z.infer<typeof tasteRecipeBriefSchema>;

export const tasteReferenceBindingSchema = z
  .object({
    asset: durableAssetRefSchema,
    role: z.enum(REFERENCE_ROLES),
    strength: z.enum(REFERENCE_STRENGTHS),
  })
  .strict();
export type TasteReferenceBinding = z.infer<typeof tasteReferenceBindingSchema>;

export const resolveTasteRecipeInputSchema = z
  .object({
    brandId: z.string().uuid(),
    selection: tasteSelectionSchema,
    brief: tasteRecipeBriefSchema,
    references: z.array(tasteReferenceBindingSchema).max(12).default([]),
    /**
     * Named inputs the caller has already gathered, matched against the selected
     * object's `requiredInputs`. Kept explicit rather than inferred from the brief:
     * guessing that "event-details" is satisfied because the freeform text mentions a
     * date is how a resolution reports zero missing inputs and then fails at generation.
     */
    providedInputs: z.array(z.string().min(1).max(80)).max(20).default([]),
    placement: z.string().min(1).max(120),
    providerId: z.string().min(1).max(120).nullable().default(null),
  })
  .strict();
export type ResolveTasteRecipeInput = z.infer<typeof resolveTasteRecipeInputSchema>;

export const tasteResolvedVersionSchema = z
  .object({
    kind: z.enum(TASTE_OBJECT_KINDS),
    id: z.string().min(1).max(120),
    version: z.number().int().min(1),
    /** True when a shortcut selected it rather than the caller. Drives the disclosure. */
    viaShortcut: z.boolean(),
  })
  .strict();
export type TasteResolvedVersion = z.infer<typeof tasteResolvedVersionSchema>;

export const tasteBrandRuleUseSchema = z
  .object({
    ruleId: z.string().min(1).max(120),
    piece: z.string().min(1).max(60),
    authority: z.enum(['hard', 'strong-preference', 'default']),
    appliedTo: z.string().min(1).max(120),
  })
  .strict();
export type TasteBrandRuleUse = z.infer<typeof tasteBrandRuleUseSchema>;

export const tasteMissingInputSchema = z
  .object({
    path: z.string().min(1).max(120),
    label: boundedText(1, 120),
    /** What a valid value looks like, so the agent can ask one question, not five. */
    acceptedShape: boundedText(3, 300),
    /** True when nothing can be generated until it is supplied. */
    blocking: z.boolean(),
  })
  .strict();
export type TasteMissingInput = z.infer<typeof tasteMissingInputSchema>;

export const tasteConflictSchema = z
  .object({
    code: z.enum(TASTE_WARNING_CODES),
    ruleId: z.string().min(1).max(120).nullable(),
    field: z.string().min(1).max(120),
    detail: boundedText(3, 400),
    permittedOverride: z.boolean(),
  })
  .strict();
export type TasteConflict = z.infer<typeof tasteConflictSchema>;

export const resolveTasteRecipeOutputSchema = z
  .object({
    recipeDraftId: z.string().min(8).max(120),
    /** Deterministic over the canonicalized selection + brief + references + brand version. */
    recipeDraftHash: z.string().min(8).max(128),
    resolvedVersions: z.array(tasteResolvedVersionSchema).max(40),
    brandRulesUsed: z.array(tasteBrandRuleUseSchema).max(60),
    missingRequiredInputs: z.array(tasteMissingInputSchema).max(24),
    conflicts: z.array(tasteConflictSchema).max(24),
    /** Overrides the Brand Book itself lists as campaign-changeable. Never inferred. */
    permittedOverrides: boundedTextArray(3, 300).max(12),
    compatiblePlanKinds: z.array(z.enum(PLAN_KINDS)).max(PLAN_KINDS.length),
    compatibleProviders: z.array(z.string().min(1).max(120)).max(12),
    estimate: z
      .object({
        contextCodePoints: z.number().int().min(0),
        costBand: z.enum(['low', 'medium', 'high']),
        latencyBand: z.enum(['fast', 'standard', 'slow']),
      })
      .strict(),
  })
  .strict();
export type ResolveTasteRecipeOutput = z.infer<typeof resolveTasteRecipeOutputSchema>;

/* -------------------------------------------------------------------------- */
/*  preview_taste_plan                                                         */
/* -------------------------------------------------------------------------- */

export const TASTE_EXECUTION_SURFACES = ['canvas', 'headless'] as const;
export type TasteExecutionSurface = (typeof TASTE_EXECUTION_SURFACES)[number];

export const previewTastePlanInputSchema = z
  .object({
    brandId: z.string().uuid(),
    recipeDraftId: z.string().min(8).max(120),
    providerId: z.string().min(1).max(120),
    candidateCount: z.number().int().min(1).max(10).nullable().default(null),
    /**
     * Which surface will run it. A browser-only step is fine on Canvas and is a refusal
     * headless — and the refusal has to happen here, before anything is paid for.
     */
    executionSurface: z.enum(TASTE_EXECUTION_SURFACES).default('headless'),
  })
  .strict();
export type PreviewTastePlanInput = z.infer<typeof previewTastePlanInputSchema>;

export const tastePlanStepSummarySchema = z
  .object({
    id: z.string().min(1).max(60),
    index: z.number().int().min(1).max(20),
    operation: z.string().min(1).max(60),
    executor: z.enum(STEP_EXECUTORS),
    summary: boundedText(3, 300),
  })
  .strict();
export type TastePlanStepSummary = z.infer<typeof tastePlanStepSummarySchema>;

/**
 * A capability the adapter will not fake.
 *
 * Distinct from a `Degradation`, which records a reduction that still ran. A refusal
 * means the plan does not execute — the Fal lane silently dropping a negative prompt is
 * the behaviour this type exists to make impossible.
 */
export const tasteAdapterRefusalSchema = z
  .object({
    capability: z.string().min(1).max(120),
    reason: boundedText(3, 300),
    stepIndex: z.number().int().min(1).max(20).nullable(),
    remedy: boundedText(3, 300),
  })
  .strict();
export type TasteAdapterRefusal = z.infer<typeof tasteAdapterRefusalSchema>;

export const TASTE_APPROVAL_POLICIES = ['none', 'before-publish', 'before-generation'] as const;
export type TasteApprovalPolicy = (typeof TASTE_APPROVAL_POLICIES)[number];

export const tasteEvaluationGateSchema = z
  .object({
    checkId: z.string().min(1).max(80),
    kind: z.string().min(1).max(60),
    failurePolicy: z.enum(['reject', 'warn']),
  })
  .strict();
export type TasteEvaluationGate = z.infer<typeof tasteEvaluationGateSchema>;

export const previewTastePlanOutputSchema = z
  .object({
    planKind: z.enum(PLAN_KINDS),
    steps: z.array(tastePlanStepSummarySchema).min(1).max(20),
    exactCopyStrategy: z.enum(COPY_STRATEGIES),
    selectedSkills: z
      .array(
        z
          .object({
            id: z.string().min(1).max(120),
            version: z.number().int().min(1),
            name: boundedText(1, 120),
          })
          .strict(),
      )
      .max(8),
    referenceRoles: z
      .array(
        z
          .object({
            asset: durableAssetRefSchema,
            role: z.enum(REFERENCE_ROLES),
            providerSlot: z.string().min(1).max(60),
            index: z.number().int().min(0).max(15),
          })
          .strict(),
      )
      .max(16),
    degradations: z.array(degradationSchema).max(20),
    refusals: z.array(tasteAdapterRefusalSchema).max(20),
    budget: budgetReportSchema,
    candidateCount: z.number().int().min(1).max(10),
    humanApprovalPolicy: z.enum(TASTE_APPROVAL_POLICIES),
    evaluationGates: z.array(tasteEvaluationGateSchema).max(30),
    compilationHash: z.string().min(8).max(128),
    /** True only when every step has a server executor. Never inferred by the caller. */
    serverRunnable: z.boolean(),
  })
  .strict();
export type PreviewTastePlanOutput = z.infer<typeof previewTastePlanOutputSchema>;

/* -------------------------------------------------------------------------- */
/*  Write tools                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Who is asking. Carried explicitly because the publish refusal depends on it.
 *
 * `serviceIdentity` is the agent's own id. `publish_taste_version` refuses when the
 * declared approver equals it — an agent approving its own proposal is the single
 * failure that turns a review queue into a rubber stamp.
 */
export const tasteActorSchema = z
  .object({
    userId: z.string().min(1).max(120).nullable(),
    serviceIdentity: z.string().min(1).max(120).nullable(),
    roles: z
      .array(z.enum(['viewer', 'brand-editor', 'brand-owner', 'agent']))
      .min(1)
      .max(4),
  })
  .strict();
export type TasteActor = z.infer<typeof tasteActorSchema>;

/** Kinds a caller may author. Receipts, manifests and profiles are system-written. */
export const TASTE_AUTHORABLE_KINDS = [
  'taste-preset',
  'prompt-template',
  'brief-template',
  'taste-shortcut',
  'skill',
] as const;
export type TasteAuthorableKind = (typeof TASTE_AUTHORABLE_KINDS)[number];

export const saveTasteDraftInputSchema = z
  .object({
    brandId: z.string().uuid(),
    actor: tasteActorSchema,
    kind: z.enum(TASTE_AUTHORABLE_KINDS),
    name: boundedText(1, 120),
    summary: boundedText(8, 300),
    body: boundedText(1, 20_000),
    familyId: z.enum(CONTENT_FAMILIES).nullable().default(null),
    scope: z.enum(['brand', 'user']).default('brand'),
    basedOn: z
      .object({ id: z.string().min(1).max(120), version: z.number().int().min(1) })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();
export type SaveTasteDraftInput = z.infer<typeof saveTasteDraftInputSchema>;

export const forkTasteObjectInputSchema = z
  .object({
    brandId: z.string().uuid(),
    actor: tasteActorSchema,
    sourceId: z.string().min(1).max(120),
    sourceVersion: z.number().int().min(1),
    scope: z.enum(['brand', 'user']),
    name: boundedText(1, 120),
    changes: boundedTextArray(3, 300).min(1).max(20),
  })
  .strict();
export type ForkTasteObjectInput = z.infer<typeof forkTasteObjectInputSchema>;

export const proposeTasteObjectInputSchema = z
  .object({
    brandId: z.string().uuid(),
    actor: tasteActorSchema,
    draftId: z.string().min(1).max(120),
    rationale: boundedText(12, 1_000),
    sourceIds: z.array(z.string().min(1).max(120)).max(12).default([]),
  })
  .strict();
export type ProposeTasteObjectInput = z.infer<typeof proposeTasteObjectInputSchema>;

export const publishTasteVersionInputSchema = z
  .object({
    brandId: z.string().uuid(),
    actor: tasteActorSchema,
    draftId: z.string().min(1).max(120),
    qualificationManifestId: z.string().min(1).max(120).nullable(),
    /** The human accountable for the publish. Never the acting service identity. */
    approverUserId: z.string().min(1).max(120),
    targetQualification: z.enum(['curated', 'qualified']),
  })
  .strict();
export type PublishTasteVersionInput = z.infer<typeof publishTasteVersionInputSchema>;

/**
 * Example attachment.
 *
 * `.strict()` on a schema whose only asset field is a durable `{assetId, versionId}` is
 * the refusal doc 25 asks for: a signed URL or an inline base64 blob is not "rejected by
 * a check", it has nowhere to go. A receipt that stored a signed URL is not reproducible
 * six months later, which defeats the reason examples are pinned at all.
 */
export const attachTasteExampleInputSchema = z
  .object({
    brandId: z.string().uuid(),
    actor: tasteActorSchema,
    objectId: z.string().min(1).max(120),
    version: z.number().int().min(1),
    asset: durableAssetRefSchema,
    kind: z.enum(['positive', 'negative']),
    annotation: boundedText(8, 600),
    authority: z.enum(['approved', 'proposed']),
  })
  .strict();
export type AttachTasteExampleInput = z.infer<typeof attachTasteExampleInputSchema>;

export const tasteWriteOutputSchema = z
  .object({
    id: z.string().min(1).max(120),
    version: z.number().int().min(1),
    kind: z.enum(TASTE_OBJECT_KINDS),
    /** A fork and a save both land here, never at the source's status. */
    qualification: z.enum(QUALIFICATION_STATUSES),
    scope: z.enum(OWNERSHIP_SCOPES),
    derivedFrom: z
      .object({ id: z.string().min(1).max(120), version: z.number().int().min(1) })
      .strict()
      .nullable(),
    /** Set when the write entered a review queue rather than taking effect. */
    reviewQueueId: z.string().min(1).max(120).nullable(),
  })
  .strict();
export type TasteWriteOutput = z.infer<typeof tasteWriteOutputSchema>;

/* -------------------------------------------------------------------------- */
/*  Ranking vocabulary                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The ranking ladder, highest priority first, exactly as doc 25 states it.
 *
 * Exported as data so a test can pin the order rather than infer it from a comparator's
 * statement sequence. The single property that makes the ladder correct is that it is
 * LEXICOGRAPHIC: `semantic-similarity` is compared only when every tier above it has
 * tied, so no similarity score however high can promote a candidate past a brand or
 * provider incompatibility. A weighted sum cannot make that promise.
 */
export const TASTE_RANKING_TIERS = [
  'tenancy-and-status',
  'family-placement-provider-eligibility',
  'brand-hard-compatibility',
  'required-input-availability',
  'job-and-mechanism-relevance',
  'qualification-evidence',
  'brand-approved-examples',
  'cost-and-latency',
  'semantic-similarity',
  'controlled-diversity',
] as const;
export type TasteRankingTier = (typeof TASTE_RANKING_TIERS)[number];

/** Tiers that eliminate rather than order. A candidate failing one is never returned. */
export const TASTE_ELIMINATING_TIERS: readonly TasteRankingTier[] = Object.freeze([
  'tenancy-and-status',
  'family-placement-provider-eligibility',
]);

export const tasteRankTraceSchema = z
  .object({
    objectId: z.string().min(1).max(120),
    /** One score per ordering tier, in `TASTE_RANKING_TIERS` order. Higher wins. */
    tierScores: z.array(z.number()).max(TASTE_RANKING_TIERS.length),
    diversitySignature: z.string().min(1).max(200),
  })
  .strict();
export type TasteRankTrace = z.infer<typeof tasteRankTraceSchema>;
