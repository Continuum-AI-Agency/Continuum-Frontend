"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CampaignInsightDataPoint,
  CampaignInsightMetric,
  CampaignInsightStatus,
  GeneratedCampaignInsight,
} from "@/lib/paid-media/insight-data-points";

export type PersistedCampaignInsight = GeneratedCampaignInsight & {
  rowId: string;
  snapshotId: string;
  brandId: string;
  adAccountId: string;
  campaignId: string | null;
  campaignName: string | null;
  status: CampaignInsightStatus;
  primaryMetric: CampaignInsightMetric;
  fingerprint: string;
  createdAt: string;
};

// The durable paid insights now live in the unified brand_profiles.media_insights
// surface (channel='paid'); ad_account_id→account_id, campaign_id→entity_id,
// campaign_name→entity_name. We project that row back onto the stable
// PersistedCampaignInsight shape so paid consumers are unchanged.
type RawInsightRow = {
  id: string;
  snapshot_id: string;
  brand_id: string;
  account_id: string;
  entity_id: string | null;
  entity_name: string | null;
  scope: GeneratedCampaignInsight["scope"];
  severity: GeneratedCampaignInsight["severity"];
  status: CampaignInsightStatus;
  primary_metric: CampaignInsightMetric;
  title: string | null;
  summary: string;
  recommendation: string | null;
  source: GeneratedCampaignInsight["source"];
  evidence: CampaignInsightDataPoint[];
  fingerprint: string;
  created_at: string;
};

function toPersistedInsight(row: RawInsightRow): PersistedCampaignInsight {
  return {
    id: `${row.snapshot_id}:${row.id}`,
    rowId: row.id,
    snapshotId: row.snapshot_id,
    brandId: row.brand_id,
    adAccountId: row.account_id,
    campaignId: row.entity_id,
    campaignName: row.entity_name,
    scope: row.scope,
    severity: row.severity,
    status: row.status,
    primaryMetric: row.primary_metric,
    title: row.title ?? "",
    summary: row.summary,
    recommendation: row.recommendation ?? undefined,
    source: row.source,
    evidence: row.evidence,
    fingerprint: row.fingerprint,
    createdAt: row.created_at,
  };
}

export async function getLatestInsights(params: {
  brandId: string;
  adAccountId: string;
  limit?: number;
}): Promise<PersistedCampaignInsight[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("brand_profiles")
    .rpc("get_latest_media_insights", {
      p_brand_id: params.brandId,
      p_account_id: params.adAccountId,
      p_channel: "paid",
      p_limit: params.limit ?? 20,
    });

  if (error) {
    throw new Error(`Failed to load latest insights: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as RawInsightRow[];
  return rows.map(toPersistedInsight);
}

export async function getInsightStreak(params: {
  brandId: string;
  adAccountId: string;
  fingerprint: string;
  lookbackDays?: number;
}): Promise<number> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("brand_profiles")
    .rpc("get_media_insight_streak", {
      p_brand_id: params.brandId,
      p_account_id: params.adAccountId,
      p_fingerprint: params.fingerprint,
      p_channel: "paid",
      p_lookback_days: params.lookbackDays ?? 14,
    });

  if (error) {
    throw new Error(`Failed to load insight streak: ${error.message}`);
  }
  return typeof data === "number" ? data : 0;
}
