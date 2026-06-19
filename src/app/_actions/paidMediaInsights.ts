"use server";

import { z } from "zod";

import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeInsightFingerprint,
  primaryMetricFor,
  primaryStatusFor,
  type GeneratedCampaignInsight,
} from "@/lib/paid-media/insight-data-points";

const dataPointSchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  metric: z.enum(["spend", "roas", "impressions", "clicks", "ctr", "cpc", "cpa", "pace"]),
  currentValue: z.number(),
  previousValue: z.number().optional(),
  deltaPct: z.number().optional(),
  percentileRank: z.number(),
  direction: z.enum(["higher_is_better", "lower_is_better", "neutral"]),
  status: z.enum(["strong", "watch", "risk", "unknown"]),
  evidenceWindow: z.string(),
});

const insightSchema = z.object({
  id: z.string(),
  scope: z.enum(["account", "campaign", "index"]),
  severity: z.enum(["info", "opportunity", "warning", "critical"]),
  title: z.string(),
  summary: z.string(),
  recommendation: z.string().optional(),
  evidence: z.array(dataPointSchema).min(1),
  source: z.enum(["matrix", "budget_pacing", "timeline", "action_logs"]),
});

const inputSchema = z.object({
  brandId: z.uuid(),
  adAccountId: z.string().min(1),
  platform: z.string().default("meta"),
  rangePreset: z.string().min(1),
  rangeSince: z.string().optional(),
  rangeUntil: z.string().optional(),
  peerSetSize: z.number().int().nonnegative(),
  insights: z.array(insightSchema),
});

export type PersistCampaignInsightsInput = z.input<typeof inputSchema>;

export type PersistCampaignInsightsResult =
  | { ok: true; snapshotId: string; insightsPersisted: number }
  | { ok: false; error: string };

export async function persistCampaignInsightsSnapshot(
  input: PersistCampaignInsightsInput
): Promise<PersistCampaignInsightsResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `Invalid input: ${parsed.error.message}` };
  }
  const { brandId, adAccountId, platform, rangePreset, rangeSince, rangeUntil, peerSetSize, insights } =
    parsed.data;

  if (insights.length === 0) {
    return { ok: false, error: "No insights to persist." };
  }

  const ctx = await getActiveBrandContext();
  if (!ctx.user) {
    return { ok: false, error: "Not authenticated." };
  }

  const hasAccess = ctx.permissions.some((p) => p.brand_profile_id === brandId);
  if (!hasAccess) {
    return { ok: false, error: "No access to brand." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: snapshot, error: snapshotError } = await supabase
    .schema("brand_profiles")
    .from("media_insight_snapshots")
    .insert({
      brand_id: brandId,
      account_id: adAccountId,
      channel: "paid",
      platform,
      range_preset: rangePreset,
      range_since: rangeSince ?? null,
      range_until: rangeUntil ?? null,
      peer_set_size: peerSetSize,
      insight_count: insights.length,
      computed_by: ctx.user.id,
      source: "client",
    })
    .select("id")
    .single();

  if (snapshotError || !snapshot) {
    return {
      ok: false,
      error: snapshotError?.message ?? "Failed to insert insight snapshot.",
    };
  }

  const rows = insights.map((insight) =>
    buildInsightRow(insight, snapshot.id, brandId, adAccountId, platform),
  );

  const { error: insightsError } = await supabase
    .schema("brand_profiles")
    .from("media_insights")
    .insert(rows);

  if (insightsError) {
    // Roll back the snapshot so we don't keep an empty parent row.
    await supabase
      .schema("brand_profiles")
      .from("media_insight_snapshots")
      .delete()
      .eq("id", snapshot.id);
    return { ok: false, error: insightsError.message };
  }

  return { ok: true, snapshotId: snapshot.id, insightsPersisted: rows.length };
}

function buildInsightRow(
  insight: GeneratedCampaignInsight,
  snapshotId: string,
  brandId: string,
  adAccountId: string,
  platform: string
) {
  const primaryMetric = primaryMetricFor(insight);
  const status = primaryStatusFor(insight);
  const campaignId =
    insight.scope === "campaign" ? insight.evidence[0]?.campaignId ?? null : null;
  const campaignName =
    insight.scope === "campaign" ? insight.evidence[0]?.campaignName ?? null : null;

  // Fingerprint is also a generated column on the DB; we compute it here only
  // for callers that want it returned eagerly (e.g., streak lookups).
  void computeInsightFingerprint({ campaignId, primaryMetric, status });

  return {
    snapshot_id: snapshotId,
    brand_id: brandId,
    account_id: adAccountId,
    channel: "paid",
    platform,
    entity_id: campaignId,
    entity_name: campaignName,
    scope: insight.scope,
    severity: insight.severity,
    status,
    primary_metric: primaryMetric,
    title: insight.title,
    summary: insight.summary,
    recommendation: insight.recommendation ?? null,
    source: insight.source,
    evidence: insight.evidence,
  };
}
