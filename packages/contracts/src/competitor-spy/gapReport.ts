// The own-vs-competitor creative gap report — the headline artifact of
// Competitor Spy V2. Deterministic TS join (backend gap/gapReportAssembler.ts)
// of the competitor angle map (angleMap.ts — longevity/volume/variant proxies)
// against the brand's own paid win-rates (creative-strategy/paid.ts,
// paid_media_get_creative_winrates) plus a labeled-coverage query. Categories
// are rule-based with evidence floors; the optional narrative is the ONLY LLM
// output and every bullet must cite the computed rows it stands on.
// Persisted into competitor_ad_spy.competitive_reports.report; served by
// GET /api/competitor-ad-spy/gap-report; grounded into Jaina/MCP/Pulse.

import { z } from 'zod';
import { creativeWinRateFlagSchema } from '../creative-strategy/paid';
import {
  competitorAngleMapDimensionSchema,
  competitorAngleMapSchema,
  competitorScaleTierSchema,
} from './angleMap';

export const COMPETITOR_LONGEVITY_PROXY_NOTE =
  'Competitor "scaling" is inferred from Meta Ad Library longevity, ad volume, and variant ' +
  'repetition — Meta exposes no spend or impressions for commercial ads, and coverage is ' +
  'limited to the fetched market countries. Own-side win rates are Meta-reported attribution.';

export const gapCategorySchema = z.enum([
  // Competitor is scaling the value; the brand has zero labeled ads carrying it.
  'they_scale_you_absent',
  // Competitor is scaling it; the brand runs it and is losing (low win rate, evidence-floored).
  'they_scale_you_losing',
  // The brand wins on it; competitors ignore it or are fading — offensive opportunity.
  'you_win_they_ignore',
  // Both sides invest above the evidence floors.
  'shared_battleground',
]);
export type GapCategory = z.infer<typeof gapCategorySchema>;

export const gapCompetitorEvidenceSchema = z.object({
  adCount: z.number().int().nonnegative(),
  activeAdCount: z.number().int().nonnegative(),
  medianLongevityDays: z.number().nonnegative(),
  longevityWeightedShare: z.number().min(0).max(1),
  variantFamilies: z.number().int().nonnegative(),
  tier: competitorScaleTierSchema,
  /** Names of the competitors carrying the value (cross-competitor rows). */
  competitors: z.array(z.string()).default([]),
  exemplarSnapshotIds: z.array(z.string()).max(3).default([]),
});
export type GapCompetitorEvidence = z.infer<typeof gapCompetitorEvidenceSchema>;

export const gapOwnEvidenceSchema = z.object({
  /** Own ads whose labels carry this value at all (coverage, no spend floor). */
  labeledAds: z.number().int().nonnegative(),
  /** Own ads above the win-rate eligibility floors ($50 / 3k impressions). */
  eligibleAds: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1).nullable(),
  spendShare: z.number().min(0).max(1).nullable(),
  flags: z.array(creativeWinRateFlagSchema).default([]),
  exemplarAdIds: z.array(z.string()).max(3).default([]),
});
export type GapOwnEvidence = z.infer<typeof gapOwnEvidenceSchema>;

export const gapAngleMatchSchema = z.object({
  /** How the two sides' values were paired: enum dims join exact; freeform angle/theme pair by text-embedding cosine. */
  method: z.enum(['exact', 'embedding']),
  similarity: z.number().min(-1).max(1).nullable(),
  /** The own-side label the competitor value was paired to (differs from `value` on embedding matches). */
  ownValue: z.string().nullable().default(null),
});
export type GapAngleMatch = z.infer<typeof gapAngleMatchSchema>;

export const competitiveGapRowSchema = z.object({
  dimension: competitorAngleMapDimensionSchema,
  value: z.string(),
  category: gapCategorySchema,
  competitorEvidence: gapCompetitorEvidenceSchema,
  /** null when the brand has no own-side paid creative report at all. */
  ownEvidence: gapOwnEvidenceSchema.nullable(),
  angleMatch: gapAngleMatchSchema,
});
export type CompetitiveGapRow = z.infer<typeof competitiveGapRowSchema>;

// Compact denormalized exemplars, keyed by id, so the FE renders evidence
// drill-downs without N+1 fetches (media bytes still resolve via the signed
// creative-url route). Same survive-the-takedown idiom as savedBoards.
export const gapCompetitorExemplarSchema = z.object({
  snapshotId: z.string(),
  competitorId: z.string().nullable(),
  competitorName: z.string().nullable(),
  sourceAdId: z.string(),
  status: z.string(),
  body: z.string().nullable(),
  hook: z.string().nullable(),
  snapshotUrl: z.string().nullable(),
  hasCreativeMedia: z.boolean().default(false),
  firstSeenAt: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  fetchedCountries: z.array(z.string()).default([]),
});
export type GapCompetitorExemplar = z.infer<typeof gapCompetitorExemplarSchema>;

export const gapOwnAdExemplarSchema = z.object({
  adId: z.string(),
  adName: z.string().nullable(),
  funnelStage: z.string().nullable(),
  spendD30: z.number().nullable(),
  thumbnailUrl: z.string().nullable(),
  permalinkUrl: z.string().nullable(),
});
export type GapOwnAdExemplar = z.infer<typeof gapOwnAdExemplarSchema>;

export const gapNarrativeItemSchema = z.object({
  text: z.string(),
  /** Row keys ("dimension:value") this bullet stands on — LLM names, never counts. */
  groundedOn: z.array(z.string()).min(1),
});
export type GapNarrativeItem = z.infer<typeof gapNarrativeItemSchema>;

export const competitiveGapReportSchema = z.object({
  brandId: z.string(),
  windowDays: z.number().int().positive(),
  taxonomyVersion: z.number().int(),
  generatedAt: z.string(),
  attributionNote: z.string().default(COMPETITOR_LONGEVITY_PROXY_NOTE),
  sourceCounts: z.object({
    competitors: z.number().int().nonnegative(),
    competitorSnapshots: z.number().int().nonnegative(),
    competitorV2Labeled: z.number().int().nonnegative(),
    ownAds: z.number().int().nonnegative(),
    ownLabeled: z.number().int().nonnegative(),
  }),
  gaps: z.array(competitiveGapRowSchema),
  exemplars: z
    .object({
      competitor: z.record(z.string(), gapCompetitorExemplarSchema).default({}),
      own: z.record(z.string(), gapOwnAdExemplarSchema).default({}),
    })
    .default({ competitor: {}, own: {} }),
  narrative: z.array(gapNarrativeItemSchema).default([]),
});
export type CompetitiveGapReport = z.infer<typeof competitiveGapReportSchema>;

// GET /api/competitor-ad-spy/gap-report response envelope. status mirrors the
// competitive_reports row lifecycle; report/angleMap are null until the first
// scan materializes them (the FE zero-state keys off that).
export const competitiveReportResponseSchema = z.object({
  status: z.enum(['assembling', 'ready', 'empty', 'error']),
  windowDays: z.number().int().positive(),
  refreshedAt: z.string().nullable(),
  angleMap: competitorAngleMapSchema.nullable(),
  report: competitiveGapReportSchema.nullable(),
});
export type CompetitiveReportResponse = z.infer<typeof competitiveReportResponseSchema>;

// Evidence floors for category assignment (mirrored in the assembler + bench).
export const GAP_EVIDENCE_RULES = {
  losingMaxWinRate: 0.4,
  winningMinWinRate: 0.6,
  minEligibleAds: 3,
  /** Embedding-pairing threshold for freeform angle/theme values. */
  minAngleSimilarity: 0.82,
} as const;
