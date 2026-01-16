"use client";

import { instagramOrganicMetricsResponseSchema, type OrganicPlatform } from "@/lib/schemas/organicMetrics";
import type { OrganicDateRangePreset } from "@/lib/schemas/organicMetrics";

export type InsightsRequest = {
  metrics: string[];
  metric_type?: "total_value" | "time_series";
  period?: "day" | "lifetime";
  breakdown?: string | string[];
  timeframe?: string;
  since?: string;
  until?: string;
};

export type OrganicMetricsRequest = {
  brandId: string;
  integrationAccountId: string;
  platform?: OrganicPlatform;
  range: {
    preset: OrganicDateRangePreset;
    custom?: { from: string; to: string };
  };
  insightsRequests?: InsightsRequest[];
  forceRefresh?: boolean;
};

export type InstagramOrganicMetricsRequest = OrganicMetricsRequest;

export async function fetchOrganicMetrics(request: OrganicMetricsRequest) {
  const platform = request.platform ?? "instagram";
  const response = await fetch(`/api/organic-metrics/${platform}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = `Unable to load ${platform} organic metrics.`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // ignore non-JSON
    }
    throw new Error(message);
  }

  const json = (await response.json()) as unknown;
  return instagramOrganicMetricsResponseSchema.parse(json);
}

export const fetchInstagramOrganicMetrics = fetchOrganicMetrics;
