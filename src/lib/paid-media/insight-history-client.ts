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

type RawInsightRow = {
  id: string;
  snapshot_id: string;
  brand_id: string;
  ad_account_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  scope: GeneratedCampaignInsight["scope"];
  severity: GeneratedCampaignInsight["severity"];
  status: CampaignInsightStatus;
  primary_metric: CampaignInsightMetric;
  title: string;
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
    adAccountId: row.ad_account_id,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    scope: row.scope,
    severity: row.severity,
    status: row.status,
    primaryMetric: row.primary_metric,
    title: row.title,
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
    .rpc("get_latest_paid_media_insights", {
      p_brand_id: params.brandId,
      p_ad_account_id: params.adAccountId,
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
    .rpc("get_paid_media_insight_streak", {
      p_brand_id: params.brandId,
      p_ad_account_id: params.adAccountId,
      p_fingerprint: params.fingerprint,
      p_lookback_days: params.lookbackDays ?? 14,
    });

  if (error) {
    throw new Error(`Failed to load insight streak: ${error.message}`);
  }
  return typeof data === "number" ? data : 0;
}
