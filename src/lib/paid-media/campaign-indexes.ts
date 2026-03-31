import { z } from "zod";

import type { PaidMetricsComparison, PaidMetricsTrendPoint } from "@/components/paid-media/dashboard/PerformanceDetails";

type CampaignMetrics = {
  spend: number;
  roas: number;
  ctr: number;
  cpc: number;
  cpa: number;
  impressions: number;
  clicks: number;
};

type CampaignLike = {
  id: string;
  metrics?: Partial<CampaignMetrics>;
  comparison?: PaidMetricsComparison;
  trends?: PaidMetricsTrendPoint[];
};

const COMPARISON_KEYS = ["spend", "roas", "ctr", "cpc", "cpa", "impressions", "clicks"] as const;

export const campaignIndexCreateSchema = z.object({
  brandId: z.string().min(1),
  metaAccountId: z.string().min(1),
  name: z.string().min(1).max(120),
  campaignIds: z.array(z.string().min(1)).min(1),
});

export const campaignIndexUpdateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    campaignIds: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((value) => value.name !== undefined || value.campaignIds !== undefined, {
    message: "At least one field must be provided.",
  });

export type CampaignIndexRecord = {
  id: string;
  brandId: string;
  metaAccountId: string;
  name: string;
  campaignIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CampaignIndexAggregate = {
  metrics: CampaignMetrics;
  comparison: PaidMetricsComparison;
  trends: PaidMetricsTrendPoint[];
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function numeric(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function buildCampaignIndexAggregate(campaigns: CampaignLike[]): CampaignIndexAggregate {
  const metricsByKey: Record<keyof CampaignMetrics, number[]> = {
    spend: [],
    roas: [],
    ctr: [],
    cpc: [],
    cpa: [],
    impressions: [],
    clicks: [],
  };

  const comparisonByKey = new Map<
    string,
    {
      current: number[];
      previous: number[];
      percentageChange: number[];
    }
  >();
  const trendsByDate = new Map<
    string,
    {
      spend: number[];
      roas: number[];
      ctr_pct: number[];
      cpc: number[];
      cpa: number[];
      impressions: number[];
      clicks: number[];
      conversions: number[];
      revenue: number[];
    }
  >();

  campaigns.forEach((campaign) => {
    if (campaign.metrics) {
      (Object.keys(metricsByKey) as Array<keyof CampaignMetrics>).forEach((key) => {
        const value = numeric(campaign.metrics?.[key]);
        if (value !== null) metricsByKey[key].push(value);
      });
    }

    if (campaign.comparison) {
      COMPARISON_KEYS.forEach((key) => {
        const comparisonValue = campaign.comparison?.[key];
        if (!comparisonValue) return;

        const current = numeric(comparisonValue.current);
        const previous = numeric(comparisonValue.previous);
        const percentageChange = numeric(comparisonValue.percentageChange);
        if (current === null || previous === null || percentageChange === null) return;

        const existing = comparisonByKey.get(key) ?? {
          current: [],
          previous: [],
          percentageChange: [],
        };
        existing.current.push(current);
        existing.previous.push(previous);
        existing.percentageChange.push(percentageChange);
        comparisonByKey.set(key, existing);
      });
    }

    campaign.trends?.forEach((trend) => {
      if (!trend.date) return;
      const existing = trendsByDate.get(trend.date) ?? {
        spend: [],
        roas: [],
        ctr_pct: [],
        cpc: [],
        cpa: [],
        impressions: [],
        clicks: [],
        conversions: [],
        revenue: [],
      };

      const spend = numeric(trend.spend);
      const roas = numeric(trend.roas);
      const ctr = numeric(trend.ctr_pct);
      const cpc = numeric(trend.cpc);
      const cpa = numeric(trend.cpa);
      const impressions = numeric(trend.impressions);
      const clicks = numeric(trend.clicks);
      const conversions = numeric(trend.conversions);
      const revenue = numeric(trend.revenue);

      if (spend !== null) existing.spend.push(spend);
      if (roas !== null) existing.roas.push(roas);
      if (ctr !== null) existing.ctr_pct.push(ctr);
      if (cpc !== null) existing.cpc.push(cpc);
      if (cpa !== null) existing.cpa.push(cpa);
      if (impressions !== null) existing.impressions.push(impressions);
      if (clicks !== null) existing.clicks.push(clicks);
      if (conversions !== null) existing.conversions.push(conversions);
      if (revenue !== null) existing.revenue.push(revenue);

      trendsByDate.set(trend.date, existing);
    });
  });

  const metrics: CampaignMetrics = {
    spend: sum(metricsByKey.spend),
    roas: average(metricsByKey.roas),
    ctr: average(metricsByKey.ctr),
    cpc: average(metricsByKey.cpc),
    cpa: average(metricsByKey.cpa),
    impressions: average(metricsByKey.impressions),
    clicks: average(metricsByKey.clicks),
  };

  const comparison: PaidMetricsComparison = {};
  COMPARISON_KEYS.forEach((key) => {
    const entry = comparisonByKey.get(key);
    if (!entry) return;
    if (key === "spend") {
      const totalCurrent = sum(entry.current);
      const totalPrevious = sum(entry.previous);
      const percentageChange =
        totalPrevious !== 0 ? ((totalCurrent - totalPrevious) / totalPrevious) * 100 : 0;
      comparison[key] = { current: totalCurrent, previous: totalPrevious, percentageChange };
    } else {
      comparison[key] = {
        current: average(entry.current),
        previous: average(entry.previous),
        percentageChange: average(entry.percentageChange),
      };
    }
  });

  const trends: PaidMetricsTrendPoint[] = Array.from(trendsByDate.entries())
    .sort((left, right) => new Date(left[0]).getTime() - new Date(right[0]).getTime())
    .map(([date, value]) => ({
      date,
      spend: value.spend.length > 0 ? sum(value.spend) : undefined,
      roas: value.roas.length > 0 ? average(value.roas) : undefined,
      ctr_pct: value.ctr_pct.length > 0 ? average(value.ctr_pct) : undefined,
      cpc: value.cpc.length > 0 ? average(value.cpc) : undefined,
      cpa: value.cpa.length > 0 ? average(value.cpa) : undefined,
      impressions: value.impressions.length > 0 ? average(value.impressions) : undefined,
      clicks: value.clicks.length > 0 ? average(value.clicks) : undefined,
      conversions: value.conversions.length > 0 ? average(value.conversions) : undefined,
      revenue: value.revenue.length > 0 ? average(value.revenue) : undefined,
    }));

  return {
    metrics,
    comparison,
    trends,
  };
}
