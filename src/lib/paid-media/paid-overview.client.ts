"use client";

import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PaidMetricsRange } from "@/lib/schemas/paidMetrics";
import type { PaidMediaPlatform } from "@/lib/paid-media/performance-types";

const metricComparisonSchema = z.object({
  current: z.number().nullable().optional(),
  previous: z.number().nullable().optional(),
  percentageChange: z.number().nullable().optional(),
});

// Lenient on purpose: the edge emits more metric keys than the dashboard reads,
// and Meta/Google diverge. Require only the three headline KPIs; everything else
// is optional and passthrough.
const paidAccountOverviewSchema = z.object({
  metrics: z.object({
    spend: z.number(),
    roas: z.number(),
    ctr: z.number(),
    impressions: z.number().optional(),
    clicks: z.number().optional(),
    cpc: z.number().optional(),
    cpa: z.number().optional(),
    purchases: z.number().optional(),
    purchase_value: z.number().optional(),
  }),
  comparison: z.record(z.string(), metricComparisonSchema).optional(),
  trends: z
    .array(
      z.object({
        date: z.string().optional(),
        spend: z.number().optional(),
        roas: z.number().optional(),
        ctr: z.number().optional(),
      }),
    )
    .optional(),
});

export type PaidAccountOverview = z.infer<typeof paidAccountOverviewSchema>;

// Account-level totals + period-over-period comparison + daily series from the
// paid-media reporting edge function. The missing wrapper for the account_overview
// scope (the leaderboards only had the ranking scopes wrapped).
export async function fetchPaidAccountOverview(params: {
  brandId: string;
  adAccountId: string;
  platform: PaidMediaPlatform;
  range: PaidMetricsRange;
}): Promise<PaidAccountOverview> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke("paid-media-reporting/metrics", {
    method: "POST",
    body: {
      platform: params.platform,
      brandId: params.brandId,
      adAccountId: params.adAccountId,
      scope: "account_overview",
      range: params.range,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return paidAccountOverviewSchema.parse(data);
}
