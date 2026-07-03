// The derived, first-party Creative Strategy artifacts: evidence-backed,
// context-tagged creative insights (winning angles / hooks / themes) fused with
// the measured performance that earned them, plus the report that groups them.
//
// This is what the materialized creative_strategy store persists, what the
// creative_strategy MCP umbrella serves, and what organic generation grounds on.
// Every insight carries `evidence` aligned with the angle-evidence namespace
// (streaming/organic.ts) so provenance is traceable end-to-end: top post/ad
// metric -> creative insight -> grounded angle -> copy claim.

import { z } from 'zod';
import { angleEvidenceMetricUnitEnum } from '../streaming/organic';
import { creativeHookArchetypeSchema } from './analysis';

export const creativeInsightKindSchema = z.enum([
  'angle',
  'hook',
  'theme',
  'format',
  'visual_motif',
  'audio_motif',
  'cta',
]);
export type CreativeInsightKind = z.infer<typeof creativeInsightKindSchema>;

export const creativeSurfaceSchema = z.enum(['organic', 'paid', 'both']);
export type CreativeSurface = z.infer<typeof creativeSurfaceSchema>;

// One measured performance datum backing an insight. `refId` resolves to a
// post_id (organic) or ad_id (paid); `metric` is the number that made the
// exemplar a top performer (hook rate, engagement rate, CTR, purchases…).
export const creativeEvidenceItemSchema = z.object({
  refId: z.string(),
  surface: z.enum(['organic', 'paid']),
  metric: z
    .object({
      name: z.string(),
      value: z.number(),
      unit: angleEvidenceMetricUnitEnum,
    })
    .nullable()
    .default(null),
  capturedAt: z.string(),
});
export type CreativeEvidenceItem = z.infer<typeof creativeEvidenceItemSchema>;

export const creativeExemplarSchema = z.object({
  refId: z.string(),
  kind: z.enum(['post', 'ad']),
  snippet: z.string().nullable().default(null),
  thumbnailRef: z.string().nullable().default(null),
});
export type CreativeExemplar = z.infer<typeof creativeExemplarSchema>;

// Who a winning angle actually reaches/converts, grounded in real analytics.
// `reach_type` (organic) captures the follower/non-follower split; `audience`
// captures a Meta custom/saved-audience name. sharePct is the segment's share of
// the measured audience (0-100), null when only a label is known.
export const audienceDimensionSchema = z.enum([
  'age',
  'gender',
  'country',
  'region',
  'placement',
  'device',
  'audience',
  'reach_type',
]);
export type AudienceDimension = z.infer<typeof audienceDimensionSchema>;

export const creativeAudienceSegmentSchema = z.object({
  dimension: audienceDimensionSchema,
  key: z.string(),
  label: z.string(),
  sharePct: z.number().nullable().default(null),
});
export type CreativeAudienceSegment = z.infer<typeof creativeAudienceSegmentSchema>;

export const creativeAudienceSchema = z.object({
  segments: z.array(creativeAudienceSegmentSchema).default([]),
  // A short human line, e.g. "skews female 25-34" or "broke into non-followers".
  note: z.string().nullable().default(null),
});
export type CreativeAudience = z.infer<typeof creativeAudienceSchema>;

export const creativeInsightSchema = z.object({
  id: z.string(),
  kind: creativeInsightKindSchema,
  archetype: creativeHookArchetypeSchema.nullable().default(null),
  surface: creativeSurfaceSchema,
  label: z.string(),
  description: z.string(),
  // One line: how to reuse this angle/hook in a new post.
  recommendation: z.string(),
  // Context tags for lexical filtering (funnel stage, audience, theme…).
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  performanceSummary: z.string().nullable().default(null),
  // Measured audience this angle reaches/converts (per-ad for paid; reach-type +
  // account skew for organic). null when no demographic signal is available.
  audience: creativeAudienceSchema.nullable().default(null),
  evidence: z.array(creativeEvidenceItemSchema).default([]),
  exemplars: z.array(creativeExemplarSchema).default([]),
});
export type CreativeInsight = z.infer<typeof creativeInsightSchema>;

export const creativeLeaderboardEntrySchema = z.object({
  label: z.string(),
  archetype: creativeHookArchetypeSchema.nullable().default(null),
  count: z.number().int().nonnegative(),
  avgMetric: z.number().nullable().default(null),
  metricName: z.string().nullable().default(null),
});
export type CreativeLeaderboardEntry = z.infer<typeof creativeLeaderboardEntrySchema>;

export const creativeStrategySourceCountsSchema = z.object({
  topOrganicPosts: z.number().int().nonnegative().default(0),
  topAds: z.number().int().nonnegative().default(0),
  analyzed: z.number().int().nonnegative().default(0),
});
export type CreativeStrategySourceCounts = z.infer<typeof creativeStrategySourceCountsSchema>;

export const creativeStrategyReportSchema = z.object({
  brandId: z.string(),
  windowDays: z.number().int().positive(),
  generatedAt: z.string(),
  insights: z.array(creativeInsightSchema).default([]),
  angleLeaderboard: z.array(creativeLeaderboardEntrySchema).default([]),
  hookLeaderboard: z.array(creativeLeaderboardEntrySchema).default([]),
  // The brand's overall audience snapshot (account-level organic demographics +
  // aggregate paid), used as grounding + shown on the dashboard header.
  audienceSnapshot: creativeAudienceSchema.nullable().default(null),
  sourceCounts: creativeStrategySourceCountsSchema,
});
export type CreativeStrategyReport = z.infer<typeof creativeStrategyReportSchema>;

// Materialized-row status, mirroring the brand_book lifecycle.
export const creativeStrategyStatusSchema = z.enum(['assembling', 'ready', 'error', 'empty']);
export type CreativeStrategyStatus = z.infer<typeof creativeStrategyStatusSchema>;
