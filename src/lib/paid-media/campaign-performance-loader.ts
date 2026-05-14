"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PaidMetricsRange } from "@/lib/schemas/paidMetrics";
import type {
  CampaignPerformanceRow,
  PaidMediaPlatform,
} from "@/lib/paid-media/performance-types";

export type CampaignPerformanceParams = {
  brandId: string;
  adAccountId: string;
  platform: PaidMediaPlatform;
  range: PaidMetricsRange;
};

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<U>
): Promise<U[]> {
  const safeLimit = Math.max(1, Math.min(limit, items.length || 1));
  const results = new Array<U>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: safeLimit }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(items[index]);
      }
    })
  );

  return results;
}

export async function fetchCampaignPerformanceRows(
  params: CampaignPerformanceParams
): Promise<CampaignPerformanceRow[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke(
    `fetch-meta-campaigns?brandId=${params.brandId}&adAccountId=${params.adAccountId}`,
    {
      method: "POST",
      body: {
        brandId: params.brandId,
        adAccountId: params.adAccountId,
      },
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const rawCampaigns = Array.isArray(data?.campaigns)
    ? (data.campaigns as CampaignPerformanceRow[])
    : [];

  return mapWithConcurrency(rawCampaigns, 6, async (campaign) => {
    try {
      const response = await fetch("/api/paid-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: params.platform,
          brandId: params.brandId,
          accountId: params.adAccountId,
          campaignId: campaign.id,
          range: params.range,
        }),
      });

      if (!response.ok) return campaign;

      const metrics = await response.json();
      return {
        ...campaign,
        metrics: metrics.metrics,
        comparison: metrics.comparison,
        trends: metrics.trends,
      };
    } catch {
      return campaign;
    }
  });
}
