// Buyer-Intent Personas — who is actually buying, and what creative got them there.
//
// A persona is the join of two things the ad account already gives away but
// nothing correlated before:
//
//   1. INTENT DEPTH — for one audience segment (age / gender / geo / placement /
//      device), how far down view-content → add-to-cart → checkout → conversion
//      it got, what each rung cost, and where it leaked. Produced by Jaina's
//      `get_buyer_intent_funnel` tool over Meta insights with `actions` attached.
//
//   2. CREATIVE AFFINITY — which angles, hooks and asset types the ads that
//      served that segment were carrying, read from the labels the
//      paid-creative-intel pipeline already writes to
//      paid_media.ad_creatives.labels, plus the library asset each creative
//      was matched to.
//
// The result is consumable in three directions: rendered as Jaina checkpoint
// blocks, used to propose Meta targeting, and (later) grounded into organic
// headless generation and the AI Studio canvas agent.
//
// Extends — never forks — the cross-side creative taxonomy. Personas, paid
// win-rates, organic labels and competitor-spy analysis all speak one
// vocabulary, so a persona's creative fingerprint can be compared to a
// win-rate row without a translation layer.
//
// Plain objects (not .strict()) so an extra key from an upstream payload never
// fails a parse — same rule as creative-strategy/paid.ts.

import { z } from 'zod';
import {
  creativeWinRateFlagSchema,
  META_REPORTED_ATTRIBUTION_NOTE,
  paidAssetTypeSchema,
  paidFunnelStageSchema,
  paidMetricWindowSchema,
} from '../creative-strategy/paid';
import { creativeHookArchetypeSchema } from '../creative-strategy/taxonomy';

// ---------------------------------------------------------------------------
// The intent ladder
// ---------------------------------------------------------------------------

/**
 * Rungs, shallow → deep. `conversion` deliberately collapses purchase, lead and
 * messaging: an ecommerce account converts on `purchase`, a lead-gen account on
 * `lead`, and a MESSAGES-objective account on `messaging`. Three separate rungs
 * would make a messaging account look like it never converts and would make
 * depth incomparable across accounts.
 */
export const intentRungSchema = z.enum(['view_content', 'add_to_cart', 'checkout', 'conversion']);
export type IntentRung = z.infer<typeof intentRungSchema>;

export const INTENT_LADDER = [
  'view_content',
  'add_to_cart',
  'checkout',
  'conversion',
] as const satisfies readonly IntentRung[];

/**
 * Meta `action_type` → intent rung. Lives in the contract, not in either
 * backend, because two places consume it — Jaina's `get_buyer_intent_funnel`
 * projection and the persona correlation — and a segment's depth would be
 * meaningless if the two disagreed about what counts as a conversion.
 *
 * Types not listed here are not funnel actions (link_click, post_engagement,
 * video_view, …) and are deliberately ignored rather than bucketed as 'other':
 * a rung is a step toward buying, not any interaction.
 */
export const INTENT_RUNG_ACTION_TYPES: Readonly<Record<IntentRung, readonly string[]>> = {
  view_content: ['view_content', 'omni_view_content', 'offsite_conversion.fb_pixel_view_content'],
  add_to_cart: ['add_to_cart', 'omni_add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'],
  checkout: [
    'initiate_checkout',
    'omni_initiated_checkout',
    'offsite_conversion.fb_pixel_initiate_checkout',
  ],
  // The terminal rung spans all three conversion currencies (see intentRungSchema).
  conversion: [
    'purchase',
    'omni_purchase',
    'offsite_conversion.fb_pixel_purchase',
    'lead',
    'onsite_conversion.lead_grouped',
    'offsite_conversion.fb_pixel_lead',
    'messaging_conversation_started_7d',
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.messaging_first_reply',
    'onsite_conversion.total_messaging_connection',
  ],
};

const RUNG_BY_ACTION_TYPE: ReadonlyMap<string, IntentRung> = new Map(
  (Object.entries(INTENT_RUNG_ACTION_TYPES) as Array<[IntentRung, readonly string[]]>).flatMap(
    ([rung, types]) => types.map((type) => [type, rung] as const),
  ),
);

/** The rung a Meta action type belongs to, or null when it is not a funnel action. */
export const intentRungForActionType = (actionType: string): IntentRung | null =>
  RUNG_BY_ACTION_TYPE.get(actionType.trim().toLowerCase()) ?? null;

/** The audience dimension a segment was cut on. One dimension per read. */
export const segmentDimensionSchema = z.enum([
  'age',
  'gender',
  'country',
  'region',
  'publisher_platform',
  'platform_position',
  'impression_device',
  'device_platform',
]);
export type SegmentDimension = z.infer<typeof segmentDimensionSchema>;

// ---------------------------------------------------------------------------
// Intent funnel
// ---------------------------------------------------------------------------

/**
 * Stage-to-stage survival. Where a segment leaks is where the campaign gets
 * fixed — a segment that browses hard and never carts is a landing-page or
 * offer problem, not a targeting problem.
 *
 * `0` and `null` mean different things and must not be collapsed: 0 = the
 * denominator existed and nobody progressed (a finding); null = there was no
 * denominator at all (nothing to say).
 */
export const intentProgressionSchema = z.object({
  atcFromView: z.number().nullable().default(null),
  checkoutFromAtc: z.number().nullable().default(null),
  conversionFromCheckout: z.number().nullable().default(null),
});
export type IntentProgression = z.infer<typeof intentProgressionSchema>;

// Every rung is always present — a fold emits all four, and an absent key would
// be indistinguishable from a measured zero. Spelled out rather than
// `z.record(enum, …)` so the type stays exhaustive on both sides.
const intentStageCountsSchema = z.object({
  view_content: z.number().default(0),
  add_to_cart: z.number().default(0),
  checkout: z.number().default(0),
  conversion: z.number().default(0),
});

const intentStageCostsSchema = z.object({
  view_content: z.number().nullable().default(null),
  add_to_cart: z.number().nullable().default(null),
  checkout: z.number().nullable().default(null),
  conversion: z.number().nullable().default(null),
});

export const intentFunnelSchema = z.object({
  spend: z.number().default(0),
  impressions: z.number().default(0),
  clicks: z.number().default(0),
  /** Absolute count at each rung, summed over the window. */
  stages: intentStageCountsSchema.default({
    view_content: 0,
    add_to_cart: 0,
    checkout: 0,
    conversion: 0,
  }),
  /** spend ÷ count at that rung. null where the rung has no count. */
  costPerStage: intentStageCostsSchema.default({
    view_content: null,
    add_to_cart: null,
    checkout: null,
    conversion: null,
  }),
  /** Deepest rung with a non-zero count. 'none' when the segment never acted. */
  intentDepth: z.union([intentRungSchema, z.literal('none')]).default('none'),
  /** Conversions ÷ impressions — the comparable "is this segment buying" number. */
  intentRate: z.number().nullable().default(null),
  progression: intentProgressionSchema,
  /** This segment's share of the read's total spend (0-1). */
  spendShare: z.number().min(0).max(1).nullable().default(null),
});
export type IntentFunnel = z.infer<typeof intentFunnelSchema>;

/** One measured slice feeding a funnel fold — a segment row, or one ad within it. */
export interface IntentFunnelInput {
  spend: number;
  impressions: number;
  clicks: number;
  stages: Partial<Record<IntentRung, number>>;
}

const roundTo = (value: number, places: number): number =>
  Number.isFinite(value) ? Number(value.toFixed(places)) : 0;

/** null when the denominator is absent; 0 when it existed and nothing progressed. */
const ratioOrNull = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? roundTo(numerator / denominator, 4) : null;

const costOrNull = (spend: number, count: number): number | null =>
  count > 0 ? roundTo(spend / count, 2) : null;

/**
 * Sum slices into one funnel and derive every ratio from the totals.
 *
 * The single definition of what cost-per-stage, depth, intent rate and
 * progression MEAN. Both the Jaina tool's model-facing projection and the
 * persona correlation fold through here, so a number shown in chat and the same
 * number grounded into a campaign cannot disagree.
 */
export function foldIntentFunnel(
  inputs: readonly IntentFunnelInput[],
  opts: { totalSpend?: number } = {},
): IntentFunnel {
  const stages: Record<IntentRung, number> = {
    view_content: 0,
    add_to_cart: 0,
    checkout: 0,
    conversion: 0,
  };
  let spend = 0;
  let impressions = 0;
  let clicks = 0;

  for (const input of inputs) {
    spend += input.spend;
    impressions += input.impressions;
    clicks += input.clicks;
    for (const rung of INTENT_LADDER) {
      stages[rung] += input.stages[rung] ?? 0;
    }
  }

  spend = roundTo(spend, 2);
  const costPerStage = {
    view_content: costOrNull(spend, stages.view_content),
    add_to_cart: costOrNull(spend, stages.add_to_cart),
    checkout: costOrNull(spend, stages.checkout),
    conversion: costOrNull(spend, stages.conversion),
  } satisfies Record<IntentRung, number | null>;

  const deepest = [...INTENT_LADDER].reverse().find((rung) => stages[rung] > 0);

  return {
    spend,
    impressions,
    clicks,
    stages,
    costPerStage,
    intentDepth: deepest ?? 'none',
    intentRate: ratioOrNull(stages.conversion, impressions),
    progression: {
      atcFromView: ratioOrNull(stages.add_to_cart, stages.view_content),
      checkoutFromAtc: ratioOrNull(stages.checkout, stages.add_to_cart),
      conversionFromCheckout: ratioOrNull(stages.conversion, stages.checkout),
    },
    spendShare:
      opts.totalSpend !== undefined ? ratioOrNull(spend, roundTo(opts.totalSpend, 2)) : null,
  };
}

/**
 * Rank order for personas: segments that convert lead, cheapest first; the rest
 * fall back to how deep they got, then to spend. A segment that reached checkout
 * outranks one that only browsed even if the browser spent more.
 */
export function compareByIntentValue(a: IntentFunnel, b: IntentFunnel): number {
  const aCost = a.costPerStage.conversion ?? null;
  const bCost = b.costPerStage.conversion ?? null;
  if (aCost !== null && bCost !== null) return aCost - bCost;
  if (aCost !== null) return -1;
  if (bCost !== null) return 1;
  const rank = (funnel: IntentFunnel): number =>
    funnel.intentDepth === 'none' ? -1 : INTENT_LADDER.indexOf(funnel.intentDepth);
  const depth = rank(b) - rank(a);
  return depth !== 0 ? depth : b.spend - a.spend;
}

// ---------------------------------------------------------------------------
// Creative affinity
// ---------------------------------------------------------------------------

/**
 * One creative attribute this persona's ads carried, with the evidence behind
 * it. `share` is the attribute's share of the persona's spend, NOT a win rate —
 * a persona-scoped win rate would need per-segment per-ad conversion data that
 * Meta does not return in one read. Naming it `share` keeps the claim honest.
 */
export const creativeAffinityRowSchema = z.object({
  dimension: z.enum(['angle', 'hook_archetype', 'asset_type', 'theme', 'visual_style']),
  value: z.string(),
  /** Ads serving this persona that carried the value. */
  ads: z.number().int().nonnegative().default(0),
  /** Share of the persona's spend behind this value (0-1). */
  share: z.number().min(0).max(1).nullable().default(null),
  flags: z.array(creativeWinRateFlagSchema).default([]),
});
export type CreativeAffinityRow = z.infer<typeof creativeAffinityRowSchema>;

/**
 * A concrete ad the persona actually saw, kept so a recommendation can point at
 * something real. `libraryAssetId` is present only when paid-creative-intel
 * matched the creative to a library asset (byte-hash or image embedding) — that
 * link is what lets headless generation reuse the asset rather than re-describe it.
 */
export const personaCreativeExemplarSchema = z.object({
  adId: z.string(),
  adName: z.string().nullable().default(null),
  angle: z.string().nullable().default(null),
  hookArchetype: creativeHookArchetypeSchema.default('unknown'),
  assetType: paidAssetTypeSchema.default('unknown'),
  funnelStage: paidFunnelStageSchema.default('unknown'),
  spend: z.number().nullable().default(null),
  libraryAssetId: z.string().nullable().default(null),
  posterUrl: z.string().nullable().default(null),
  permalinkUrl: z.string().nullable().default(null),
});
export type PersonaCreativeExemplar = z.infer<typeof personaCreativeExemplarSchema>;

// ---------------------------------------------------------------------------
// Targeting proposal
// ---------------------------------------------------------------------------

/**
 * A targeting option resolved out of the embedded Meta catalog
 * (ad_targeting.behaviors / .interests / .demographics) by semantic match on the
 * persona's description. `distance` is the raw vector distance the RPC returned —
 * kept so a consumer can see how loose the match was rather than trusting a rank.
 */
export const targetingCandidateSchema = z.object({
  kind: z.enum(['behavior', 'interest', 'demographic']),
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().default(null),
  audienceSizeLowerBound: z.number().nullable().default(null),
  audienceSizeUpperBound: z.number().nullable().default(null),
  distance: z.number().nullable().default(null),
});
export type TargetingCandidate = z.infer<typeof targetingCandidateSchema>;

/**
 * A proposal, never an applied change. `spec` is shaped for Meta's targeting
 * object so a human or the canvas can apply it verbatim; `estimatedReach` is
 * filled only when `estimate_audience_reach` was actually called.
 */
export const proposedTargetingSchema = z.object({
  rationale: z.string(),
  spec: z.record(z.string(), z.unknown()).default({}),
  candidates: z.array(targetingCandidateSchema).default([]),
  estimatedReach: z
    .object({
      usersLowerBound: z.number().nullable().default(null),
      usersUpperBound: z.number().nullable().default(null),
    })
    .nullable()
    .default(null),
});
export type ProposedTargeting = z.infer<typeof proposedTargetingSchema>;

// ---------------------------------------------------------------------------
// The persona
// ---------------------------------------------------------------------------

export const audiencePersonaSchema = z.object({
  personaId: z.string(),
  /** Human-readable name, e.g. "Women 25-34 on Reels". */
  label: z.string(),
  dimension: segmentDimensionSchema,
  /** The segment's own value on that dimension, e.g. "25-34". */
  segment: z.string(),
  funnel: intentFunnelSchema,
  creativeAffinity: z.array(creativeAffinityRowSchema).default([]),
  exemplars: z.array(personaCreativeExemplarSchema).default([]),
  proposedTargeting: proposedTargetingSchema.nullable().default(null),
  /**
   * Why this persona might be wrong. Reuses the paid win-rate trust vocabulary
   * so a persona's caveats read the same as a creative verdict's.
   */
  flags: z.array(creativeWinRateFlagSchema).default([]),
  confidence: z.number().min(0).max(1).nullable().default(null),
});
export type AudiencePersona = z.infer<typeof audiencePersonaSchema>;

export const buyerIntentSourceCountsSchema = z.object({
  segments: z.number().int().nonnegative().default(0),
  ads: z.number().int().nonnegative().default(0),
  labeledCreatives: z.number().int().nonnegative().default(0),
  libraryMatched: z.number().int().nonnegative().default(0),
});
export type BuyerIntentSourceCounts = z.infer<typeof buyerIntentSourceCountsSchema>;

export const buyerIntentReportSchema = z.object({
  brandId: z.string(),
  adAccountId: z.string().nullable().default(null),
  window: paidMetricWindowSchema.default('d30'),
  generatedAt: z.string(),
  personas: z.array(audiencePersonaSchema).default([]),
  sourceCounts: buyerIntentSourceCountsSchema.default({
    segments: 0,
    ads: 0,
    labeledCreatives: 0,
    libraryMatched: 0,
  }),
  /**
   * Ships with the report so the caveat cannot be dropped on the way to a human.
   * Meta-reported attribution is not independently reconciled — an
   * under-attributed segment looks like a non-buying segment.
   */
  attributionNote: z.string().default(META_REPORTED_ATTRIBUTION_NOTE),
  caveats: z.array(z.string()).default([]),
});
export type BuyerIntentReport = z.infer<typeof buyerIntentReportSchema>;

/**
 * Fixed disclosure for the creative half of a persona. A persona's creative
 * fingerprint says what the segment WAS SHOWN, weighted by spend — it is not a
 * controlled test of what that segment prefers. The only clean creative
 * comparison the account gives away is within one ad set (see
 * adsetCreativeWinRateRowSchema), and it is not segment-aware.
 */
export const PERSONA_CREATIVE_AFFINITY_NOTE =
  'Creative affinity describes what this segment was actually served, weighted by spend — ' +
  'not a controlled test of what it prefers. A segment can appear to "like" an angle simply ' +
  'because that angle carried the budget. Treat it as a hypothesis to test, not a finding.';
