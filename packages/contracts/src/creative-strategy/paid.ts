// Paid Creative Intelligence — "What's Working for Ads".
//
// Per-creative AI labels (asset type, messaging angle, hook tactic, funnel
// stage) over the brand's OWN Meta ads, plus the derived win-rate rows,
// kill/scale/iterate/watch verdicts, iteration briefs, and the materialized
// per-brand report. Produced by the Backend paid-creative-intel pipeline
// (Vertex Gemini over thumbnail + copy, plus the audio-track transcript for
// videos — hooks live in the spoken opening line), persisted to
// paid_media.{ad_creatives,ads,creative_reports}, and read by the paid
// dashboard, the creative_strategy MCP umbrella, and the weekly report.
//
// Extends — does not fork — the first-party creative taxonomy (analysis.ts),
// so paid labels, organic labels, competitor-spy labels, and the Optimizer's
// CommunicationAngle all share one hook-archetype vocabulary.
//
// Plain objects (not .strict()) so an LLM adding an extra key never fails
// parse — same rule as analysis.ts and competitor-spy.

import { z } from 'zod';
import { firstPartyCreativeAnalysisSchema } from './analysis';

export const paidFunnelStageSchema = z.enum(['tof', 'mof', 'bof', 'unknown']);
export type PaidFunnelStage = z.infer<typeof paidFunnelStageSchema>;

export const paidAssetTypeSchema = z.enum([
  'static_image',
  'video',
  'carousel',
  'catalog',
  'unknown',
]);
export type PaidAssetType = z.infer<typeof paidAssetTypeSchema>;

// What the labeler actually saw. 'thumbnail_transcript_copy' is the default
// path for videos (audio-track transcript only — the full video is never
// pulled); 'video_frames_transcript' is the spend-gated frame-sampling
// escalation; 'copy_only' is the degraded path when media is unavailable.
// What the model ACTUALLY saw. This is not bookkeeping — it is the difference
// between a label you can trust and one you cannot.
//
// Meta hands back `thumbnail_url` for a video creative at 64x64 (`stp=…p64x64…`),
// which is ~4,000 pixels: enough for a model to confabulate "User Generated
// Content/Raw" from the ad copy and present it as a visual reading. The real
// poster comes from `GET /{video_id}/thumbnails` at 480x848 — ~100x the pixels.
//
//   poster_copy    — a real poster (480x848-class) + copy. Visually grounded.
//   thumbnail_copy — the 64x64 fallback + copy. The visual fields are barely more
//                    than a restatement of the copy; weight them accordingly.
export const paidCreativeLabelSourceSchema = z.enum([
  'poster_copy',
  'poster_transcript_copy',
  'thumbnail_copy',
  'thumbnail_transcript_copy',
  'video_frames_transcript',
  'copy_only',
]);

/** Label sources whose visual fields are grounded in enough pixels to believe. */
export const VISUALLY_GROUNDED_LABEL_SOURCES = [
  'poster_copy',
  'poster_transcript_copy',
  'video_frames_transcript',
] as const;

export const isVisuallyGroundedLabelSource = (source: string | null | undefined): boolean =>
  VISUALLY_GROUNDED_LABEL_SOURCES.includes(
    source as (typeof VISUALLY_GROUNDED_LABEL_SOURCES)[number],
  );
export type PaidCreativeLabelSource = z.infer<typeof paidCreativeLabelSourceSchema>;

export const paidCreativeLabelsSchema = firstPartyCreativeAnalysisSchema.extend({
  assetType: paidAssetTypeSchema.default('unknown'),
  // AI-labeled funnel stage. Never silently overrides the stage declared by the
  // brand's ad-naming schema — a mismatch is surfaced as a conflict upstream.
  funnelStage: paidFunnelStageSchema.default('unknown'),
  funnelStageConfidence: z.number().min(0).max(1).nullable().default(null),
  funnelStageRationale: z.string().nullable().default(null),
  // Verbatim opening line(s) of the spoken transcript that carry the hook.
  // Only present when a video transcript was ingested.
  hookTranscript: z.string().nullable().default(null),
});
export type PaidCreativeLabels = z.infer<typeof paidCreativeLabelsSchema>;

// ---------------------------------------------------------------------------
// Win-rate analytics
// ---------------------------------------------------------------------------

// Trust-layer flags on a category win-rate (the confounding critique): a
// category "winning" means little if it had almost no evidence, one ad carried
// the spend, the spend sat on warm audiences, or the lift disappears once
// audience/funnel are held constant (Apriori corroboration).
export const creativeWinRateFlagSchema = z.enum([
  'low_evidence',
  'spend_concentrated',
  'warm_audience_skew',
  'confounded',
]);
export type CreativeWinRateFlag = z.infer<typeof creativeWinRateFlagSchema>;

export const creativeWinRateDimensionSchema = z.enum([
  'asset_type',
  'hook_archetype',
  'angle',
  'theme',
  'funnel_stage',
  'visual_style',
]);
export type CreativeWinRateDimension = z.infer<typeof creativeWinRateDimensionSchema>;


export const paidMetricWindowSchema = z.enum(['d7', 'd14', 'd30']);
export type PaidMetricWindow = z.infer<typeof paidMetricWindowSchema>;

// Flags specific to the WITHIN-AD-SET index. Ads in one ad set share an audience
// and a budget, which is what makes comparing them the cleanest read on the
// creative — but it creates two failure modes the brand-wide index does not have.
//   single_variant           — every ad in the ad set carries the SAME value for
//                              this dimension. The win rate is then arithmetic, not
//                              evidence: there was nothing to beat. REFUSE to read
//                              a win rate carrying this flag.
//   thumbnail_derived_labels — at least one contributing label was read off Meta's
//                              64x64 thumbnail rather than a real poster, so its
//                              "visual" fields are largely inferred from the copy.
export const adsetWinRateFlagSchema = z.enum([
  'single_variant',
  'low_evidence',
  'spend_concentrated',
  'thumbnail_derived_labels',
]);
export type AdsetWinRateFlag = z.infer<typeof adsetWinRateFlagSchema>;

/** A win rate that is true by construction rather than by evidence. */
export const isDegenerateWinRate = (flags: readonly AdsetWinRateFlag[]): boolean =>
  flags.includes('single_variant');

// One cell of the within-ad-set index: among the eligible ads of ONE ad set, the
// share carrying this label value that beat that AD SET'S OWN median efficiency.
// The cohort is the ad set, so audience/budget/placement are held roughly constant
// — this is the closest thing to a controlled creative test the account gives away.
export const adsetCreativeWinRateRowSchema = z.object({
  adsetId: z.string(),
  adsetName: z.string().nullable().default(null),
  dimension: creativeWinRateDimensionSchema,
  value: z.string(),
  window: paidMetricWindowSchema.default('d30'),
  /** The conversion currency the ad set was judged in (purchases | leads | clicks). */
  kpi: z.string().default('clicks'),
  /** Ads in this ad set carrying this label value. */
  eligibleAds: z.number().int().nonnegative(),
  /** Eligible ads in the ad set overall — the denominator that makes winRate readable. */
  adsetAds: z.number().int().nonnegative().default(0),
  winners: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  spend: z.number().nullable().default(null),
  /** This value's share of the ad set's spend (0-1). */
  spendShare: z.number().min(0).max(1).nullable().default(null),
  /** The AD SET's own median cost-per-KPI — what an ad here had to beat. */
  adsetMedianCpa: z.number().nullable().default(null),
  flags: z.array(adsetWinRateFlagSchema).default([]),
});
export type AdsetCreativeWinRateRow = z.infer<typeof adsetCreativeWinRateRowSchema>;

// One cell of win-rate-by-category: within a cohort (brand × KPI × funnel
// stage × window), the share of eligible ads carrying this label value that
// beat the cohort's spend-weighted median efficiency.
export const creativeWinRateRowSchema = z.object({
  dimension: creativeWinRateDimensionSchema,
  value: z.string(),
  funnelStage: paidFunnelStageSchema,
  window: paidMetricWindowSchema.default('d30'),
  eligibleAds: z.number().int().nonnegative(),
  winners: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  spendWeightedWinRate: z.number().min(0).max(1).nullable().default(null),
  // This category's share of the cohort's spend (0-1) — the confounding lens.
  spendShare: z.number().min(0).max(1).nullable().default(null),
  medianCpa: z.number().nullable().default(null),
  flags: z.array(creativeWinRateFlagSchema).default([]),
});
export type CreativeWinRateRow = z.infer<typeof creativeWinRateRowSchema>;

// An Apriori association rule corroborating (or undermining) a win-rate row:
// "ads with these label attributes win with lift X". lift <= 1 on a
// nominally-winning category is what fires the 'confounded' flag.
export const creativeLiftRuleSchema = z.object({
  // Attribute conjunction, e.g. ["hook_archetype=social_proof", "funnel_stage=tof"].
  antecedent: z.array(z.string()).min(1),
  support: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  lift: z.number().nonnegative(),
});
export type CreativeLiftRule = z.infer<typeof creativeLiftRuleSchema>;

// ---------------------------------------------------------------------------
// Verdicts + iteration briefs
// ---------------------------------------------------------------------------

export const paidCreativeVerdictKindSchema = z.enum(['kill', 'scale', 'iterate', 'watch']);
export type PaidCreativeVerdictKind = z.infer<typeof paidCreativeVerdictKindSchema>;

export const paidCreativeVerdictSchema = z.object({
  adId: z.string(),
  adsetId: z.string().nullable().default(null),
  campaignId: z.string().nullable().default(null),
  adName: z.string().nullable().default(null),
  funnelStage: paidFunnelStageSchema.default('unknown'),
  verdict: paidCreativeVerdictKindSchema,
  // Deterministic and figure-bearing — the sole grounding source for any AI
  // rephrase (the optimizer-insight rule: never invent a number).
  reason: z.string(),
  flags: z.array(creativeWinRateFlagSchema).default([]),
  spend: z.number().nullable().default(null),
  cpa: z.number().nullable().default(null),
  // cpa / cohort spend-weighted median; > 1 is worse than the cohort.
  cpaVsCohortMedian: z.number().nullable().default(null),
  window: paidMetricWindowSchema.default('d30'),
  // Read-only cross-reference to a pending optimizer recommendation touching
  // the same ad set, so the two systems reference — not duplicate — each other.
  optimizerRecommendationId: z.string().nullable().default(null),
  thumbnailUrl: z.string().nullable().default(null),
  // Loose string (not .url()) — a malformed permalink must not fail the report
  // parse; the UI guards on http(s) before linking (same rule as exemplars).
  permalinkUrl: z.string().nullable().default(null),
});
export type PaidCreativeVerdict = z.infer<typeof paidCreativeVerdictSchema>;

export const paidIterationBriefSchema = z.object({
  adId: z.string(),
  title: z.string(),
  // What to make instead — grounded ONLY in the brand's measured winning label
  // combinations, never free-floating ideation.
  brief: z.string(),
  // The winning combinations cited, e.g. "hook_archetype=social_proof @ tof".
  groundedOn: z.array(z.string()).default([]),
});
export type PaidIterationBrief = z.infer<typeof paidIterationBriefSchema>;

// ---------------------------------------------------------------------------
// The materialized report (one row per brand in paid_media.creative_reports)
// ---------------------------------------------------------------------------

// Fixed trust-layer disclosure rendered wherever win-rates or verdicts are
// shown. CAPI/server-side reconciliation is explicitly out of scope for v1.
export const META_REPORTED_ATTRIBUTION_NOTE =
  'Performance figures are Meta-reported attribution as configured in the ad account ' +
  '(pixel/CAPI); they are not independently reconciled. Under-attributed ads can look ' +
  'like underperformers — treat borderline kill calls accordingly.';

export const paidCreativeSourceCountsSchema = z.object({
  ads: z.number().int().nonnegative().default(0),
  creatives: z.number().int().nonnegative().default(0),
  labeled: z.number().int().nonnegative().default(0),
  videoTranscribed: z.number().int().nonnegative().default(0),
});
export type PaidCreativeSourceCounts = z.infer<typeof paidCreativeSourceCountsSchema>;

export const paidCreativeReportSchema = z.object({
  brandId: z.string(),
  adAccountId: z.string().nullable().default(null),
  windowDays: z.number().int().positive().default(90),
  generatedAt: z.string(),
  attributionNote: z.string().default(META_REPORTED_ATTRIBUTION_NOTE),
  winRates: z.array(creativeWinRateRowSchema).default([]),
  liftRules: z.array(creativeLiftRuleSchema).default([]),
  verdicts: z.array(paidCreativeVerdictSchema).default([]),
  iterationBriefs: z.array(paidIterationBriefSchema).default([]),
  sourceCounts: paidCreativeSourceCountsSchema.default({
    ads: 0,
    creatives: 0,
    labeled: 0,
    videoTranscribed: 0,
  }),
});
export type PaidCreativeReport = z.infer<typeof paidCreativeReportSchema>;


// ---------------------------------------------------------------------------
// Vector signals — "this creative is winning at something its ad set isn't buying"
// ---------------------------------------------------------------------------

// Every conversion vector is measured for every ad, but an ad is only JUDGED on the
// one its ad set declared it was bidding for. That asymmetry is the opportunity: a
// creative can be mid-table on the goal it was bought for and the best in its ad set
// at something else — which is a signal to reconsider the AD SET's configuration, not
// just the creative.
//
// THE CONFOUND, and why the comparison is scoped to one ad set. Meta's delivery
// optimizes toward the goal, so an ad in a CONVERSATIONS ad set is shown to people
// likely to start a conversation, and its lead rate is measured on that skewed
// audience. Comparing it to an ad in a different ad set would compare two audiences
// and call the difference "creative". Ads WITHIN one ad set share the optimization,
// the audience and the budget — so their relative standing on any vector is a clean
// read on the creative. That is the only comparison made.
//
// A strong off-goal vector is therefore a HYPOTHESIS (the creative pulls that action
// harder than its peers DESPITE the optimization), never a forecast of what would
// happen if the ad set were re-optimized.
export const creativeVectorStandingSchema = z.object({
  conversions: z.number().nullable().default(null),
  costPer: z.number().nullable().default(null),
  /** The AD SET's median cost for this vector — what this ad had to beat. */
  adsetMedian: z.number().nullable().default(null),
  /** 1.0 = exactly the ad set's median. Below 1.0 is cheaper, i.e. better. */
  vsAdsetMedian: z.number().nullable().default(null),
});
export type CreativeVectorStanding = z.infer<typeof creativeVectorStandingSchema>;

export const creativeVectorSignalSchema = z.object({
  adId: z.string(),
  adName: z.string().nullable().default(null),
  adsetName: z.string().nullable().default(null),
  /** What the ad set DECLARED it was bidding for. Without it, a cost-per-X is uninterpretable. */
  optimizationGoal: z.string().nullable().default(null),
  hookArchetype: z.string().nullable().default(null),
  spend: z.number().nullable().default(null),

  /** The vector the ad set actually bought, and how this creative did at it. */
  primaryKpi: z.string(),
  primaryVsAdsetMedian: z.number().nullable().default(null),
  primaryConversions: z.number().nullable().default(null),

  /** What this creative was quietly best at, among its own ad-set peers. */
  bestOffGoalKpi: z.string().nullable().default(null),
  bestOffGoalVsAdsetMedian: z.number().nullable().default(null),
  bestOffGoalConversions: z.number().nullable().default(null),

  /** Weak at what it was bought for, strong at something else. */
  misaligned: z.boolean().default(false),

  /** Standing on every vector this ad actually produced. */
  vectors: z.record(z.string(), creativeVectorStandingSchema).default({}),

  /** Ships with the row so the caveat cannot be dropped on the way to a human. */
  caveat: z.string(),
});
export type CreativeVectorSignal = z.infer<typeof creativeVectorSignalSchema>;
