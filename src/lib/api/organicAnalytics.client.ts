"use client";

import {
  instagramOrganicMetricsResponseSchema,
  type OrganicDateRangePreset,
  type OrganicAnalyticsScope,
  type OrganicPlatform,
} from "@/lib/schemas/organicMetrics";

export type OrganicAnalyticsRequest = {
  brandId: string;
  integrationAccountId: string;
  platform: Extract<OrganicPlatform, "instagram" | "facebook" | "tiktok">;
  range: {
    preset: OrganicDateRangePreset;
    custom?: { from: string; to: string };
  };
  scope?: OrganicAnalyticsScope;
  selectedPostId?: string;
  forceRefresh?: boolean;
};

export async function fetchOrganicAnalytics(request: OrganicAnalyticsRequest) {
  const response = await fetch(`/api/organic-analytics/${request.platform}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = `Unable to load ${request.platform} organic analytics.`;
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
