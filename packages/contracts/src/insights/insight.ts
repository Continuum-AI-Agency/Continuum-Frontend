// Canonical, channel-agnostic Insight surface — the single shape the durable
// brand_profiles.media_insights store, the Frontend tables, and (later) agents
// all speak. It reconciles the previously fragmented organic
// (positive/negative/neutral) and paid (info/opportunity/warning/critical +
// strong/watch/risk/unknown) vocabularies into one severity + status pair.
//
// The DB columns are the wire boundary for the Deno edge functions (which can't
// import this package); they write these column values and the Frontend/Backend
// read them back through `insightSchema`.

import { z } from "zod";

import {
  primaryMetricFor,
  primaryStatusFor,
  type CampaignInsightDataPoint,
  type GeneratedCampaignInsight,
} from "../paid/insight-model";
import type { OrganicComputedInsight } from "../organic/insights";

export const insightChannelSchema = z.enum(["organic", "paid"]);
export type InsightChannel = z.infer<typeof insightChannelSchema>;

// Actionable severity scale (paid's, which sorts naturally critical→info).
export const insightSeveritySchema = z.enum(["critical", "warning", "opportunity", "info"]);
export type InsightSeverity = z.infer<typeof insightSeveritySchema>;

// Orthogonal health band.
export const insightStatusSchema = z.enum(["strong", "watch", "risk", "unknown"]);
export type InsightStatus = z.infer<typeof insightStatusSchema>;

export const insightScopeSchema = z.enum(["account", "campaign", "index", "post", "creative"]);
export type InsightScope = z.infer<typeof insightScopeSchema>;

// Agent-pickup scaffold: an insight starts open and is worked to resolved.
export const insightActionStateSchema = z.enum(["open", "acknowledged", "resolved"]);
export type InsightActionState = z.infer<typeof insightActionStateSchema>;

export const insightSourceSchema = z.enum([
  "computed", // organic deterministic heuristic
  "llm", // organic Gemini sub-agent
  "matrix", // paid peer-rank
  "budget_pacing",
  "timeline",
  "action_logs",
]);
export type InsightSource = z.infer<typeof insightSourceSchema>;

export const insightEvidenceSchema = z.object({
  metric: z.string(),
  currentValue: z.number(),
  previousValue: z.number().optional(),
  deltaPct: z.number().optional(),
  percentileRank: z.number().optional(),
  direction: z.enum(["higher_is_better", "lower_is_better", "neutral"]).optional(),
  status: insightStatusSchema.optional(),
  window: z.string().optional(),
});
export type InsightEvidence = z.infer<typeof insightEvidenceSchema>;

export const insightEntityRefSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  permalink: z.string().optional(),
});
export type InsightEntityRef = z.infer<typeof insightEntityRefSchema>;

export const insightSchema = z.object({
  id: z.string(),
  channel: insightChannelSchema,
  platform: z.string(),
  scope: insightScopeSchema,
  category: z.string().optional(),
  severity: insightSeveritySchema,
  status: insightStatusSchema,
  // Absent for organic LLM insights that aren't tied to a single metric.
  primaryMetric: z.string().optional(),
  // Paid carries a templated title; organic only has the human `summary`.
  title: z.string().optional(),
  summary: z.string(),
  recommendation: z.string().optional(),
  evidence: z.array(insightEvidenceSchema).default([]),
  entityRef: insightEntityRefSchema.optional(),
  source: insightSourceSchema,
  fingerprint: z.string(),
  confidence: z.number().optional(),
  actionState: insightActionStateSchema.default("open"),
  generatedAt: z.string(),
});
export type Insight = z.infer<typeof insightSchema>;

export const insightSnapshotSchema = z.object({
  id: z.string(),
  brandId: z.string(),
  accountId: z.string(),
  channel: insightChannelSchema,
  platform: z.string(),
  rangePreset: z.string(),
  rangeSince: z.string().optional(),
  rangeUntil: z.string().optional(),
  peerSetSize: z.number().int().nonnegative(),
  insightCount: z.number().int().nonnegative(),
  computedAt: z.string(),
  source: z.enum(["client", "server", "agent"]),
});
export type InsightSnapshot = z.infer<typeof insightSnapshotSchema>;

// Mirrors the DB generated column:
//   coalesce(entity_id, 'account') || ':' || primary_metric || ':' || status
// Callers pass the already-resolved metric (metric ?? category ?? 'na').
export function computeMediaInsightFingerprint(params: {
  entityId: string | null;
  primaryMetric: string;
  status: InsightStatus;
}): string {
  return `${params.entityId ?? "account"}:${params.primaryMetric}:${params.status}`;
}

type CanonicalContext = {
  platform: string;
  generatedAt: string;
  actionState?: InsightActionState;
};

function evidenceFromCampaignDataPoint(point: CampaignInsightDataPoint): InsightEvidence {
  return {
    metric: point.metric,
    currentValue: point.currentValue,
    previousValue: point.previousValue,
    deltaPct: point.deltaPct,
    percentileRank: point.percentileRank,
    direction: point.direction,
    status: point.status,
    window: point.evidenceWindow,
  };
}

export function paidInsightToCanonical(
  insight: GeneratedCampaignInsight,
  context: CanonicalContext,
): Insight {
  const primaryMetric = primaryMetricFor(insight);
  const status = primaryStatusFor(insight);
  const isCampaign = insight.scope === "campaign";
  const entityId = isCampaign ? (insight.evidence[0]?.campaignId ?? null) : null;
  const entityName = isCampaign ? insight.evidence[0]?.campaignName : undefined;
  const fingerprint = computeMediaInsightFingerprint({ entityId, primaryMetric, status });

  return {
    id: `paid:${fingerprint}`,
    channel: "paid",
    platform: context.platform,
    scope: insight.scope,
    severity: insight.severity,
    status,
    primaryMetric,
    title: insight.title,
    summary: insight.summary,
    recommendation: insight.recommendation,
    evidence: insight.evidence.map(evidenceFromCampaignDataPoint),
    entityRef: entityId ? { id: entityId, name: entityName } : undefined,
    source: insight.source,
    fingerprint,
    actionState: context.actionState ?? "open",
    generatedAt: context.generatedAt,
  };
}

// Negative organic signals at or beyond this magnitude escalate to `critical`.
const ORGANIC_NEGATIVE_CRITICAL_DELTA_PCT = 25;

export function organicSeverityToCanonical(insight: OrganicComputedInsight): {
  severity: InsightSeverity;
  status: InsightStatus;
} {
  if (insight.severity === "positive") return { severity: "opportunity", status: "strong" };
  if (insight.severity === "neutral") return { severity: "info", status: "unknown" };
  const magnitude = Math.abs(insight.delta ?? 0);
  return {
    severity: magnitude >= ORGANIC_NEGATIVE_CRITICAL_DELTA_PCT ? "critical" : "warning",
    status: "risk",
  };
}

export function organicInsightToCanonical(
  insight: OrganicComputedInsight,
  context: CanonicalContext,
): Insight {
  const { severity, status } = organicSeverityToCanonical(insight);
  const entityId = insight.post_id ?? null;
  const resolvedMetric = insight.metric ?? insight.category;
  const fingerprint = computeMediaInsightFingerprint({
    entityId,
    primaryMetric: resolvedMetric,
    status,
  });
  const evidence: InsightEvidence[] =
    insight.metric && typeof insight.value === "number"
      ? [{ metric: insight.metric, currentValue: insight.value, deltaPct: insight.delta }]
      : [];

  return {
    id: `organic:${fingerprint}`,
    channel: "organic",
    platform: context.platform,
    scope: insight.post_id ? "post" : "account",
    category: insight.category,
    severity,
    status,
    primaryMetric: insight.metric,
    summary: insight.text,
    recommendation: insight.recommendation,
    evidence,
    entityRef: insight.post_id ? { id: insight.post_id } : undefined,
    source: insight.source,
    fingerprint,
    actionState: context.actionState ?? "open",
    generatedAt: context.generatedAt,
  };
}
