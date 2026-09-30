/**
 * The typed plan behind one paid campaign scaffold version, and the Campaign Canvas
 * save that produces a new version.
 *
 * ONE SCHEMA, TWO HOMES. The same `paidScaffoldPlanSchema` object is persisted at
 * `brand_profiles.paid_scaffold_versions.manifest.plan` — so the content hash, and
 * therefore the approval, covers it — and emitted as `scaffoldPlan` on
 * `paid.scaffold_proposed`. A card rendered from the live frame and a card rendered
 * from rows on reload read one shape.
 *
 * EVERY DECISION CITES NUMBERS. `evidence[]` carries one entry per decision (budget,
 * objective, audience, creative, optimizer) with the metrics it rests on. The server
 * derives what it can — CPA and spend from the account's own insights, Meta's floor,
 * audience reach — and a model-authored claim that cites nothing is not evidence.
 *
 * `expected.conversions_per_day` is deterministic: total daily budget ÷ CPA. It is null,
 * never guessed, when the account has no measured CPA.
 */

import { z } from 'zod';
import { ApplyModeSchema, AutopilotScopesSchema } from '../optimization/service';

export const PAID_SCAFFOLD_PLAN_SCHEMA_VERSION = 1 as const;

/** The only tool an operator action may deploy a scaffold with. */
export const PAID_SCAFFOLD_DEPLOY_TOOL_NAME = 'paid_scaffold_deploy' as const;

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/** One number a claim rests on. */
export const paidScaffoldEvidenceMetricSchema = z.object({
  label: z.string().min(1),
  value: z.union([z.number(), z.string()]),
  /** What to print beside `value` — 'MXN', 'conversions/day', 'people'. Null when bare. */
  unit: z.string().nullable(),
  /** The window it was measured over ('last_30d'); null for a fact with no window. */
  window: z.string().nullable(),
  /**
   * Where it came from: 'meta_insights', 'meta_minimum_budgets', 'meta_reachestimate',
   * 'audience_group', 'angle_evidence', 'derived', 'user'.
   */
  source: z.string().min(1),
});
export type PaidScaffoldEvidenceMetric = z.infer<typeof paidScaffoldEvidenceMetricSchema>;

export const PAID_SCAFFOLD_DECISIONS = [
  'budget',
  'objective',
  'audience',
  'creative',
  'optimizer',
] as const;
export const paidScaffoldDecisionSchema = z.enum(PAID_SCAFFOLD_DECISIONS);
export type PaidScaffoldDecision = z.infer<typeof paidScaffoldDecisionSchema>;

export const paidScaffoldEvidenceSchema = z.object({
  decision: paidScaffoldDecisionSchema,
  /** The node the claim is about; null for a scaffold-wide claim (objective, optimizer). */
  path_key: z.string().nullable(),
  claim: z.string().min(1),
  metrics: z.array(paidScaffoldEvidenceMetricSchema),
  /** Who authored the claim: a server derivation, the model, or a person on the canvas. */
  provenance: z.enum(['server', 'model', 'user']),
  /** The editing user's id when `provenance` is 'user'; null otherwise. */
  author_id: z.string().nullable(),
});
export type PaidScaffoldEvidence = z.infer<typeof paidScaffoldEvidenceSchema>;

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

/**
 * Explicit broad targeting — the only alternative to a published audience group. An ad
 * set with neither is refused at propose/save by name.
 *
 * `genders` null means all genders; string members, never Meta's 1|2 codes, because a
 * numeric enum anywhere in a Gemini tool declaration kills the whole declaration.
 */
export const paidScaffoldBroadTargetingSchema = z
  .object({
    countries: z
      .array(z.string().regex(/^[A-Z]{2}$/, 'ISO-3166 alpha-2, upper case'))
      .min(1)
      .max(25),
    age_min: z.number().int().min(18).max(65),
    age_max: z.number().int().min(18).max(65),
    genders: z
      .array(z.enum(['male', 'female']))
      .min(1)
      .max(2)
      .nullable(),
  })
  .refine((value) => value.age_min <= value.age_max, {
    message: 'age_min must not exceed age_max',
    path: ['age_min'],
  });
export type PaidScaffoldBroadTargeting = z.infer<typeof paidScaffoldBroadTargetingSchema>;

/** Meta's reachestimate bounds. Null on the audience when the estimate was unavailable. */
export const paidScaffoldReachSchema = z.object({
  lower: z.number().int().nonnegative(),
  upper: z.number().int().nonnegative(),
});
export type PaidScaffoldReach = z.infer<typeof paidScaffoldReachSchema>;

export const paidScaffoldAudienceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('group'),
    group_version_id: z.string().uuid(),
    group_name: z.string().nullable(),
    member_count: z.number().int().nonnegative(),
    /** Each member as a person reads it — 'Lookalike 1% · purchasers'. */
    members: z.array(z.object({ label: z.string(), kind: z.string() })),
    /** A one-line geo/age summary of the compiled targeting, e.g. 'MX · 25-54 · all genders'. */
    targeting_summary: z.string().nullable(),
    reach: paidScaffoldReachSchema.nullable(),
  }),
  z.object({
    kind: z.literal('broad'),
    targeting: paidScaffoldBroadTargetingSchema,
    targeting_summary: z.string(),
    reach: paidScaffoldReachSchema.nullable(),
  }),
]);
export type PaidScaffoldAudience = z.infer<typeof paidScaffoldAudienceSchema>;

// ---------------------------------------------------------------------------
// Creative
// ---------------------------------------------------------------------------

export const PAID_SCAFFOLD_CREATIVE_FORMATS = ['image', 'video', 'carousel'] as const;
export const paidScaffoldCreativeFormatSchema = z.enum(PAID_SCAFFOLD_CREATIVE_FORMATS);
export type PaidScaffoldCreativeFormat = z.infer<typeof paidScaffoldCreativeFormatSchema>;

/** One card. A single image or video is one card; a carousel is 2-10, in order. */
export const paidScaffoldCreativeCardSchema = z.object({
  /** `media.assets.id` of a Library asset owned by the brand. */
  asset_id: z.string().uuid(),
  /** Carousel only: this card's own headline. Null on a single-asset creative. */
  headline: z.string().trim().min(1).max(255).nullable(),
  /** Carousel only: this card's own destination. Null falls back to the ad's link. */
  link: z.string().url().nullable(),
});
export type PaidScaffoldCreativeCard = z.infer<typeof paidScaffoldCreativeCardSchema>;

export const paidScaffoldCreativeSchema = z
  .object({
    format: paidScaffoldCreativeFormatSchema,
    cards: z.array(paidScaffoldCreativeCardSchema).min(1).max(10),
  })
  .superRefine((value, ctx) => {
    const count = value.cards.length;
    if (value.format === 'carousel' ? count < 2 : count !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['cards'],
        message:
          value.format === 'carousel'
            ? 'a carousel carries 2 to 10 cards'
            : `a single ${value.format} creative carries exactly one card`,
      });
    }
  });
export type PaidScaffoldCreative = z.infer<typeof paidScaffoldCreativeSchema>;

// ---------------------------------------------------------------------------
// Optimizer enrollment
// ---------------------------------------------------------------------------

/**
 * What happens to the ad sets after a deploy lands them PAUSED: enrolled into an
 * optimizer portfolio. Defaults to `recommend` with EVERY autopilot scope explicitly
 * false — nothing the optimizer proposes runs unattended until a person turns it on.
 * Autopilot is not offered here: it requires guardrails a scaffold does not carry.
 */
export const paidScaffoldOptimizerEnrollmentSchema = z.object({
  portfolio: z.union([
    z.object({ existing_id: z.string().uuid() }).strict(),
    z.object({ new_name: z.string().trim().min(1).max(200) }).strict(),
  ]),
  apply_mode: ApplyModeSchema.exclude(['autopilot']),
  autopilot_scopes: AutopilotScopesSchema,
});
export type PaidScaffoldOptimizerEnrollment = z.infer<typeof paidScaffoldOptimizerEnrollmentSchema>;

export const PAID_SCAFFOLD_AUTOPILOT_SCOPES_OFF = {
  budget: false,
  creative_swap: false,
  audience_change: false,
  new_audience: false,
  new_creatives: false,
} as const satisfies z.infer<typeof AutopilotScopesSchema>;

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export const paidScaffoldAdSetPlanSchema = z.object({
  path_key: z.string(),
  name: z.string(),
  optimization_goal: z.string(),
  /** The billing event the Meta floor was resolved for (IMPRESSIONS, THRUPLAY, LINK_CLICKS). */
  billing_event: z.string(),
  /** What will be sent — already clamped to Meta's floor. Null only when no floor resolved. */
  daily_budget_minor_units: z.number().int().positive().nullable(),
  /** How the figure was reached, for the person approving it. */
  budget_basis: z.string(),
  /** 'derived' from the account's CPA, set by a 'user' on the canvas, or the Meta 'floor'. */
  budget_source: z.enum(['derived', 'user', 'floor']),
  meta_floor_minor_units: z.number().int().positive().nullable(),
  /** True when the derived or edited figure sat below the floor and was raised to it. */
  raised_to_floor: z.boolean(),
  expected_conversions_per_day: z.number().nonnegative().nullable(),
  audience: paidScaffoldAudienceSchema,
  /** Meta's `promoted_object` (pixel/page/app ids) for this ad set; null when none applies. */
  promoted_object: z.record(z.string(), z.string()).nullable(),
});
export type PaidScaffoldAdSetPlan = z.infer<typeof paidScaffoldAdSetPlanSchema>;

export const paidScaffoldAdPlanSchema = z.object({
  path_key: z.string(),
  adset_path_key: z.string(),
  name: z.string(),
  angle_key: z.string().nullable(),
  /**
   * The creative this VERSION was saved with. Null when the ad was proposed without one
   * (the agent attaches creative after propose): the node row's `creative_asset_id` /
   * `creative_media` is then the current attachment.
   */
  creative: paidScaffoldCreativeSchema.nullable(),
});
export type PaidScaffoldAdPlan = z.infer<typeof paidScaffoldAdPlanSchema>;

export const paidScaffoldExpectedSchema = z.object({
  /** Sum of every ad set's daily budget, in the account currency's minor units. */
  daily_budget_minor_units: z.number().int().nonnegative(),
  currency: z.string().nullable(),
  /** The account's measured cost per conversion, MAJOR units; null with no conversions. */
  cpa: z.number().positive().nullable(),
  cpa_window: z.string().nullable(),
  /** daily budget ÷ CPA. Null, never guessed, when `cpa` is null. */
  conversions_per_day: z.number().nonnegative().nullable(),
  basis: z.string(),
});
export type PaidScaffoldExpected = z.infer<typeof paidScaffoldExpectedSchema>;

/**
 * Something that stops a deploy. Known at compile time and hashed with the plan:
 * `page_unresolved`, `promoted_object_unresolved`, `targeting_uncompiled`,
 * `meta_floor_unresolved`. Creative readiness is NOT here — creative can be attached
 * after propose; it is checked when the deploy gate opens and read off the node rows.
 */
export const paidScaffoldBlockerSchema = z.object({
  code: z.string().min(1),
  path_key: z.string().nullable(),
  message: z.string().min(1),
});
export type PaidScaffoldBlocker = z.infer<typeof paidScaffoldBlockerSchema>;

export const paidScaffoldPlanSchema = z.object({
  schema_version: z.literal(PAID_SCAFFOLD_PLAN_SCHEMA_VERSION),
  /** The campaign objective (Meta vocabulary, e.g. OUTCOME_SALES). */
  objective: z.string(),
  currency: z.string().nullable(),
  adsets: z.array(paidScaffoldAdSetPlanSchema),
  ads: z.array(paidScaffoldAdPlanSchema),
  evidence: z.array(paidScaffoldEvidenceSchema),
  expected: paidScaffoldExpectedSchema,
  optimizer_enrollment: paidScaffoldOptimizerEnrollmentSchema,
  blockers: z.array(paidScaffoldBlockerSchema),
});
export type PaidScaffoldPlan = z.infer<typeof paidScaffoldPlanSchema>;

// ---------------------------------------------------------------------------
// Campaign Canvas save: POST /api/agents/jaina/scaffolds/:scaffoldId/versions
// ---------------------------------------------------------------------------

/**
 * One node of the tree the canvas saves. The SAME flat vocabulary the agent proposes
 * with, so both run through one compiler. Every key is required; `null` means "not set
 * at this level". Enum-valued strings (objective, optimization_goal, placements,
 * call_to_action_type) are validated server-side against Meta's vocabulary and refused
 * by name.
 */
export const paidScaffoldDraftNodeSchema = z.object({
  path_key: z.string().min(1).max(200),
  parent_path_key: z.string().min(1).max(200).nullable(),
  level: z.enum(['campaign', 'adset', 'ad']),
  ordinal: z.number().int().min(0),
  name: z.string().min(1).max(400),
  product_key: z.string().min(1).max(200).nullable(),
  angle_key: z.string().min(1).max(200).nullable(),
  concept_key: z.string().min(1).max(200).nullable(),
  objective: z.string().nullable(),
  /**
   * campaign only (null elsewhere): Meta's special ad categories — 'EMPLOYMENT', 'HOUSING',
   * 'CREDIT', 'ISSUES_ELECTIONS_POLITICS', 'ONLINE_GAMBLING_AND_GAMING',
   * 'FINANCIAL_PRODUCTS_SERVICES', or [] for none. A compliance declaration applied to
   * every campaign of the version, so all campaigns in one save must agree.
   */
  special_ad_categories: z.array(z.string()).nullable(),
  optimization_goal: z.string().nullable(),
  funnel_stage: z.string().nullable(),
  placement_mode: z.enum(['advantage_plus', 'manual']).nullable(),
  publisher_platforms: z.array(z.string()).nullable(),
  facebook_positions: z.array(z.string()).nullable(),
  instagram_positions: z.array(z.string()).nullable(),
  device_platforms: z.array(z.string()).nullable(),
  /** adset: a published audience group version, or null with `broad_targeting` set. */
  audience_group_version_id: z.string().uuid().nullable(),
  /** adset: explicit broad targeting, or null with `audience_group_version_id` set. */
  broad_targeting: paidScaffoldBroadTargetingSchema.nullable(),
  /** adset: a person's budget (clamped to the floor); null derives it from the CPA. */
  daily_budget_minor_units: z.number().int().positive().nullable(),
  /** adset: the conversions/day the derived budget buys; null means 3. */
  target_conversions_per_day: z.number().int().min(1).max(50).nullable(),
  // Ad copy — ad only.
  link: z.string().url().nullable(),
  message: z.string().trim().min(1).max(2_200).nullable(),
  headline: z.string().trim().min(1).max(255).nullable(),
  description: z.string().trim().min(1).max(255).nullable(),
  call_to_action_type: z.string().nullable(),
  /** ad only. Null leaves the ad without creative (a deploy then refuses by name). */
  creative: paidScaffoldCreativeSchema.nullable(),
});
export type PaidScaffoldDraftNode = z.infer<typeof paidScaffoldDraftNodeSchema>;

export const paidScaffoldVersionSaveRequestSchema = z.object({
  /** The version the canvas was editing. A save on anything but the current one is 409. */
  base_version_id: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
  rationale: z.string().max(4000).nullable(),
  nodes: z.array(paidScaffoldDraftNodeSchema).min(1).max(200),
  optimizer_enrollment: paidScaffoldOptimizerEnrollmentSchema,
});
export type PaidScaffoldVersionSaveRequest = z.infer<typeof paidScaffoldVersionSaveRequestSchema>;

/** 201 body. `contentHash` is what an operator-action deploy of this version must carry. */
export const paidScaffoldVersionSaveResponseSchema = z.object({
  scaffoldId: z.string().uuid(),
  versionId: z.string().uuid(),
  version: z.number().int().positive(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  plan: paidScaffoldPlanSchema,
});
export type PaidScaffoldVersionSaveResponse = z.infer<typeof paidScaffoldVersionSaveResponseSchema>;

/**
 * 4xx body. `code` names the refusal: 'invalid_request' (400), 'forbidden' (403),
 * 'scaffold_not_found' (404), 'stale_base_version' (409), 'scaffold_rejected' (422, with
 * one `issues` line per broken rule — e.g. an ad set with no audience).
 */
export const paidScaffoldVersionSaveErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z.array(z.string()),
  }),
});
export type PaidScaffoldVersionSaveError = z.infer<typeof paidScaffoldVersionSaveErrorSchema>;
