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
import { type FieldProvenance, fieldProvenanceSchema } from '../streaming/jaina-campaign-structure';

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
  /**
   * P5 design 08: a campaign COPY's ad set carries its source's targeting verbatim — cities,
   * interests, custom audiences — which neither a published group nor broad targeting can
   * hold. The spec rides in the hashed node payload; this names where it came from. The
   * canvas cannot edit it (`paidScaffoldCopiedAudienceSaveIssue`).
   */
  z.object({
    kind: z.literal('copied'),
    source_adset_id: z.string().min(1),
    source_adset_name: z.string(),
    /** One line read off the copied spec, e.g. 'MX · 3 cities · 22-45 · all genders'. */
    targeting_summary: z.string().nullable(),
    reach: paidScaffoldReachSchema.nullable(),
  }),
]);
export type PaidScaffoldAudience = z.infer<typeof paidScaffoldAudienceSchema>;

/** How a card names a copied audience: "copied from <source ad set name>". */
export const paidScaffoldCopiedAudienceLabel = (sourceAdSetName: string): string =>
  `copied from ${sourceAdSetName}`;

/** Why a canvas save refuses a copied audience, and the next step. */
export const paidScaffoldCopiedAudienceSaveIssue = (sourceAdSetName: string): string =>
  `This audience was copied from ${sourceAdSetName}; edit it by asking Jaina or in Ads Manager.`;

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
// Budget mode, bid, schedule, conversion event, URL tags (P5, 2026-10-29)
// ---------------------------------------------------------------------------

/**
 * Who holds the budget. ABO (the default, and the only shape the Optimizer moves on its
 * own) puts it on each ad set; CBO puts it, and the bid strategy, on the campaign.
 */
export const PAID_SCAFFOLD_BUDGET_MODES = ['abo', 'cbo'] as const;
export const paidScaffoldBudgetModeSchema = z.enum(PAID_SCAFFOLD_BUDGET_MODES);
export type PaidScaffoldBudgetMode = z.infer<typeof paidScaffoldBudgetModeSchema>;

/**
 * Meta's bid strategies, the same list as the Backend's `META_BID_STRATEGIES`
 * (`App/shared/meta/scaffoldVocabulary.ts`; a Backend spec pins the two equal). Declared
 * here because the canvas and the card print them: the Frontend cannot import the
 * Backend's vocabulary.
 */
export const PAID_SCAFFOLD_BID_STRATEGIES = [
  'LOWEST_COST_WITHOUT_CAP',
  'COST_CAP',
  'LOWEST_COST_WITH_BID_CAP',
  'LOWEST_COST_WITH_MIN_ROAS',
] as const;
export const paidScaffoldBidStrategySchema = z.enum(PAID_SCAFFOLD_BID_STRATEGIES);
export type PaidScaffoldBidStrategy = z.infer<typeof paidScaffoldBidStrategySchema>;

/** The strategies that need an amount: a cost per result, or a bid per auction. */
export const PAID_SCAFFOLD_CAPPED_BID_STRATEGIES: readonly PaidScaffoldBidStrategy[] = [
  'COST_CAP',
  'LOWEST_COST_WITH_BID_CAP',
];

/**
 * The pixel events a person may name as an ad set's optimization event — a subset of Meta's
 * `custom_event_type` enum, string members only. Null on the node keeps today's rule: the
 * event is derived from the objective (PURCHASE for sales, LEAD for leads).
 */
export const PAID_SCAFFOLD_CONVERSION_EVENTS = [
  'PURCHASE',
  'LEAD',
  'COMPLETE_REGISTRATION',
  'ADD_TO_CART',
  'INITIATED_CHECKOUT',
  'ADD_PAYMENT_INFO',
  'ADD_TO_WISHLIST',
  'CONTENT_VIEW',
  'SEARCH',
  'CONTACT',
  'SCHEDULE',
  'SUBMIT_APPLICATION',
  'SUBSCRIBE',
  'START_TRIAL',
] as const;
export const paidScaffoldConversionEventSchema = z.enum(PAID_SCAFFOLD_CONVERSION_EVENTS);
export type PaidScaffoldConversionEvent = z.infer<typeof paidScaffoldConversionEventSchema>;

/** The query string Meta appends to every link click, e.g. "utm_source=meta&utm_medium=paid". */
export const PAID_SCAFFOLD_URL_TAGS_MAX = 1_000;

/** A bid as the plan states it: the strategy, and the amount or ratio it needs (null otherwise). */
export const paidScaffoldBidPlanSchema = z.object({
  strategy: paidScaffoldBidStrategySchema,
  bid_amount_minor_units: z.number().int().positive().nullable(),
  roas_floor: z.number().positive().nullable(),
});
export type PaidScaffoldBidPlan = z.infer<typeof paidScaffoldBidPlanSchema>;

export const paidScaffoldSchedulePlanSchema = z.object({
  /** ISO-8601 with offset; null = delivers as soon as a person activates it. */
  start_time: z.string().nullable(),
  /** ISO-8601 with offset; null = runs until paused. */
  end_time: z.string().nullable(),
});
export type PaidScaffoldSchedulePlan = z.infer<typeof paidScaffoldSchedulePlanSchema>;

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
  // P5. Defaulted, so a plan stored before these existed still parses — and reads as what
  // it built: an ABO ad set, uncapped, with no schedule.
  /** True under a CBO campaign: this ad set sends no budget, `daily_budget_minor_units` is null. */
  budget_held_by_campaign: z.boolean().default(false),
  /** The bid this ad set is created with; null = uncapped (LOWEST_COST_WITHOUT_CAP). */
  bid: paidScaffoldBidPlanSchema.nullable().default(null),
  /** When it may deliver; null = no start or end is sent. */
  schedule: paidScaffoldSchedulePlanSchema.nullable().default(null),
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
  /** The URL parameters every click carries; null = none (P5). */
  url_tags: z.string().nullable().default(null),
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
  // P5. Defaulted to what every older plan built: ABO, no campaign budget, no campaign bid.
  budget_mode: paidScaffoldBudgetModeSchema.default('abo'),
  /** CBO only: the campaign's daily budget, already checked against Meta's floor. */
  campaign_daily_budget_minor_units: z.number().int().positive().nullable().default(null),
  /** CBO only: the campaign's bid strategy (its ad sets carry none of their own). */
  campaign_bid: paidScaffoldBidPlanSchema.nullable().default(null),
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

  // P5 (2026-10-29). `.nullable().default(null)`, not `.nullish()`: a save from a Frontend that
  // predates these keys, and a manifest stored before them, both parse to null — "not set",
  // which builds exactly what was built before (ABO, uncapped, no schedule, no URL tags, the
  // derived event) — while every reader still sees a value, never undefined. Cross-node rules
  // (CBO needs a campaign budget, its ad sets carry none) are `paidScaffoldFullFieldIssues`.
  /** campaign only. Null = ABO. */
  budget_mode: paidScaffoldBudgetModeSchema.nullable().default(null),
  /** campaign only, CBO only: the campaign's daily budget in minor units. */
  campaign_daily_budget_minor_units: z.number().int().positive().nullable().default(null),
  /** adset under ABO, or the campaign under CBO. Null = uncapped (LOWEST_COST_WITHOUT_CAP). */
  bid_strategy: paidScaffoldBidStrategySchema.nullable().default(null),
  /** Required by COST_CAP / LOWEST_COST_WITH_BID_CAP, minor units; null otherwise. */
  bid_amount_minor_units: z.number().int().positive().nullable().default(null),
  /** Required by LOWEST_COST_WITH_MIN_ROAS: the return a person reads (2.5 = 2.5x). */
  roas_floor: z.number().positive().max(1000).nullable().default(null),
  /** adset only. ISO-8601 with offset; null = as soon as it is activated. */
  start_time: z.string().datetime({ offset: true }).nullable().default(null),
  /** adset only. ISO-8601 with offset, after `start_time`; null = runs until paused. */
  end_time: z.string().datetime({ offset: true }).nullable().default(null),
  /** adset only. The pixel event it optimizes for; null derives it from the objective. */
  custom_event_type: paidScaffoldConversionEventSchema.nullable().default(null),
  /** adset only. The pixel it optimizes on; null uses the account's only pixel. */
  pixel_id: z
    .string()
    .regex(/^\d{5,32}$/, 'a Meta pixel id is digits')
    .nullable()
    .default(null),
  /** ad only. "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}". */
  url_tags: z.string().trim().min(1).max(PAID_SCAFFOLD_URL_TAGS_MAX).nullable().default(null),
  /**
   * Who supplied each field: the person ('user_gave'), Jaina ('jaina_filled'), or nobody yet
   * ('jaina_asks'). PRESENTATION ONLY — it is stored on the node row and never enters the
   * manifest, so the content hash an approval covers does not move when a label does. Not the
   * canvas's NodeProvenance (the approval state of a hydrated node). Keyed by draft-node key.
   */
  field_provenance: z.record(z.string(), fieldProvenanceSchema).nullable().default(null),
});
export type PaidScaffoldDraftNode = z.infer<typeof paidScaffoldDraftNodeSchema>;
/** What a caller may hand the schema: the P5 keys are optional on the way in. */
export type PaidScaffoldDraftNodeInput = z.input<typeof paidScaffoldDraftNodeSchema>;

/** The draft-node keys whose value carries a provenance, by level. Structure keys carry none. */
export const PAID_SCAFFOLD_PROVENANCE_KEYS = {
  campaign: [
    'name',
    'objective',
    'special_ad_categories',
    'budget_mode',
    'campaign_daily_budget_minor_units',
    'bid_strategy',
    'bid_amount_minor_units',
    'roas_floor',
  ],
  adset: [
    'name',
    'optimization_goal',
    'custom_event_type',
    'pixel_id',
    'funnel_stage',
    'placement_mode',
    'publisher_platforms',
    'facebook_positions',
    'instagram_positions',
    'device_platforms',
    'audience_group_version_id',
    'broad_targeting',
    'daily_budget_minor_units',
    'target_conversions_per_day',
    'bid_strategy',
    'bid_amount_minor_units',
    'roas_floor',
    'start_time',
    'end_time',
  ],
  ad: [
    'name',
    'link',
    'message',
    'headline',
    'description',
    'call_to_action_type',
    'url_tags',
    'creative',
  ],
} as const satisfies Record<
  PaidScaffoldDraftNode['level'],
  readonly (keyof PaidScaffoldDraftNode)[]
>;
export type PaidScaffoldProvenanceKey =
  (typeof PAID_SCAFFOLD_PROVENANCE_KEYS)[keyof typeof PAID_SCAFFOLD_PROVENANCE_KEYS][number];

/**
 * The four decisions Jaina asks for before proposing when the person has not given them
 * (Ramiro, 2026-10-21). The same names as the evidence decisions they become.
 */
export const PAID_SCAFFOLD_CRITICAL_DECISIONS = [
  'budget',
  'objective',
  'audience',
  'creative',
] as const satisfies readonly PaidScaffoldDecision[];
export type PaidScaffoldCriticalDecision = (typeof PAID_SCAFFOLD_CRITICAL_DECISIONS)[number];

/** Which draft-node keys answer each critical decision. */
export const PAID_SCAFFOLD_CRITICAL_KEYS = {
  budget: ['daily_budget_minor_units', 'campaign_daily_budget_minor_units'],
  objective: ['objective', 'optimization_goal', 'custom_event_type'],
  audience: ['audience_group_version_id', 'broad_targeting'],
  creative: ['creative'],
} as const satisfies Record<PaidScaffoldCriticalDecision, readonly (keyof PaidScaffoldDraftNode)[]>;

/**
 * The provenance a reader is shown for one field. A field stored as 'jaina_asks' that has a
 * value now (a creative attached after propose, which the attach RPC does not relabel) reads
 * as 'jaina_filled'; a field with no recorded provenance reads 'jaina_filled' when it has a
 * value and 'jaina_asks' when it has none — the honest default for a version stored before
 * provenance existed.
 */
export const effectiveFieldProvenance = (
  recorded: FieldProvenance | null | undefined,
  hasValue: boolean,
): FieldProvenance => {
  if (!hasValue) return recorded === 'user_gave' ? 'user_gave' : 'jaina_asks';
  if (!recorded || recorded === 'jaina_asks') return 'jaina_filled';
  return recorded;
};

const BID_KEYS = ['bid_strategy', 'bid_amount_minor_units', 'roas_floor'] as const;
const CAMPAIGN_ONLY_KEYS = ['budget_mode', 'campaign_daily_budget_minor_units'] as const;
const ADSET_ONLY_KEYS = ['start_time', 'end_time', 'custom_event_type', 'pixel_id'] as const;
const AD_ONLY_KEYS = ['url_tags'] as const;

const isSet = (value: unknown): boolean => value !== null && value !== undefined;

/**
 * The P5 field rules, refused BY NAME at propose and at save (the compiler runs this before
 * any read), the same way an ad set with no audience is. One sentence per broken rule, each
 * naming the node — a Meta 400 mid-build would name nothing and leave objects above it.
 *
 * `now` only judges an end date already past; the caller passes its clock.
 */
export const paidScaffoldFullFieldIssues = (
  nodes: readonly PaidScaffoldDraftNodeInput[],
  now: number = Date.now(),
): string[] => {
  const issues: string[] = [];
  const byPathKey = new Map(nodes.map((node) => [node.path_key, node]));
  for (const node of nodes) {
    const where = `${node.level} ${node.path_key}`;
    const record = node as Record<string, unknown>;
    const forbid = (keys: readonly string[], why: string) => {
      for (const key of keys)
        if (isSet(record[key])) issues.push(`${where} must omit ${key} (${why})`);
    };
    if (node.level !== 'campaign') forbid(CAMPAIGN_ONLY_KEYS, 'campaign only');
    if (node.level !== 'adset') forbid(ADSET_ONLY_KEYS, 'ad set only');
    if (node.level !== 'ad') forbid(AD_ONLY_KEYS, 'ad only');
    if (node.level === 'ad') forbid(BID_KEYS, 'an ad carries no bid');

    const parent = node.parent_path_key ? byPathKey.get(node.parent_path_key) : undefined;
    const cbo =
      node.level === 'campaign' ? node.budget_mode === 'cbo' : parent?.budget_mode === 'cbo';
    const strategy = node.bid_strategy ?? null;

    if (node.level === 'campaign') {
      if (cbo && !isSet(node.campaign_daily_budget_minor_units)) {
        issues.push(
          `${where} uses campaign budget (CBO) and needs campaign_daily_budget_minor_units`,
        );
      }
      if (!cbo) forbid(['campaign_daily_budget_minor_units'], 'only a CBO campaign holds a budget');
      if (!cbo) forbid(BID_KEYS, 'under ABO each ad set holds its own bid');
    }
    if (node.level === 'adset' && cbo) {
      forbid(['daily_budget_minor_units'], 'its campaign uses CBO and holds the budget');
      forbid(['bid_strategy', 'roas_floor'], 'its campaign uses CBO and holds the bid strategy');
      const campaignStrategy = parent?.bid_strategy ?? null;
      if (
        isSet(node.bid_amount_minor_units) &&
        !(campaignStrategy && PAID_SCAFFOLD_CAPPED_BID_STRATEGIES.includes(campaignStrategy))
      ) {
        issues.push(
          `${where} names bid_amount_minor_units but its CBO campaign's strategy takes no amount`,
        );
      }
    }
    if ((node.level === 'campaign' && cbo) || (node.level === 'adset' && !cbo)) {
      const capped = strategy !== null && PAID_SCAFFOLD_CAPPED_BID_STRATEGIES.includes(strategy);
      if (capped && !isSet(node.bid_amount_minor_units)) {
        issues.push(`${where} uses ${strategy} and needs bid_amount_minor_units`);
      }
      if (!capped && isSet(node.bid_amount_minor_units)) {
        issues.push(
          `${where} names bid_amount_minor_units but ${strategy ?? 'an uncapped bid'} takes no amount`,
        );
      }
      const roas = strategy === 'LOWEST_COST_WITH_MIN_ROAS';
      if (roas && !isSet(node.roas_floor)) {
        issues.push(`${where} uses LOWEST_COST_WITH_MIN_ROAS and needs roas_floor`);
      }
      if (!roas && isSet(node.roas_floor)) {
        issues.push(
          `${where} names roas_floor but its bid strategy is not LOWEST_COST_WITH_MIN_ROAS`,
        );
      }
    }
    if (node.level === 'adset') {
      // Meta bids a ROAS floor on purchase value only.
      const heldStrategy = cbo ? (parent?.bid_strategy ?? null) : strategy;
      if (heldStrategy === 'LOWEST_COST_WITH_MIN_ROAS' && node.optimization_goal !== 'VALUE') {
        issues.push(`${where} bids a ROAS floor and must optimize for VALUE`);
      }
      const start = node.start_time ? Date.parse(node.start_time) : null;
      const end = node.end_time ? Date.parse(node.end_time) : null;
      if (start !== null && end !== null && end <= start) {
        issues.push(`${where} ends at or before it starts; end_time must be after start_time`);
      }
      if (end !== null && end <= now) issues.push(`${where} has an end_time already in the past`);
    }
    if (node.level === 'ad' && node.url_tags) {
      if (/^[?&]/.test(node.url_tags) || /\s/.test(node.url_tags)) {
        issues.push(
          `${where}: url_tags is a bare query string ("utm_source=meta&utm_medium=paid"), with no leading ? and no spaces`,
        );
      }
    }
  }
  return issues;
};

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
