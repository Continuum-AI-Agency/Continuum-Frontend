"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PaidMetricsRange } from "@/lib/schemas/paidMetrics";
import type { PaidMediaPlatform } from "@/lib/paid-media/performance-types";

export type RankedCampaign = {
  id: string;
  name: string;
  rank: number;
  roas: number;
  spend: number | null;
};

type RankedRow = {
  id?: unknown;
  name?: unknown;
  rank?: unknown;
  kpi_value?: unknown;
  metrics?: { spend?: unknown; roas?: unknown } | null;
};

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Calls the server-ranked `top_campaigns` scope of the paid-media reporting edge
// function (kpi=roas). Ranking + KPI math run in the edge path; this only maps
// the response. Returns [] on a non-array payload so callers render an empty state.
export async function fetchTopCampaignsByRoas(params: {
  brandId: string;
  adAccountId: string;
  platform: PaidMediaPlatform;
  range: PaidMetricsRange;
  limit?: number;
}): Promise<RankedCampaign[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke("paid-media-reporting/metrics", {
    method: "POST",
    body: {
      platform: params.platform,
      brandId: params.brandId,
      adAccountId: params.adAccountId,
      scope: "top_campaigns",
      kpi: "roas",
      direction: "top",
      limit: params.limit ?? 5,
      range: params.range,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows: RankedRow[] = Array.isArray(data?.rows) ? data.rows : [];
  return rows.map((row, index) => ({
    id: typeof row.id === "string" ? row.id : String(row.id ?? index),
    name: typeof row.name === "string" && row.name.trim() ? row.name : "Untitled campaign",
    rank: toNumber(row.rank) ?? index + 1,
    roas: toNumber(row.kpi_value) ?? toNumber(row.metrics?.roas) ?? 0,
    spend: toNumber(row.metrics?.spend),
  }));
}
