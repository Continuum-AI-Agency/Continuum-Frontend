"use client";

import { instagramOrganicMetricsResponseSchema } from "@/lib/schemas/organicMetrics";
import type { OrganicDateRangePreset } from "@/lib/schemas/organicMetrics";

export type InstagramOrganicMetricsRequest = {
  brandId: string;
  integrationAccountId: string;
  range: {
    preset: OrganicDateRangePreset;
    custom?: { from: string; to: string };
  };
};

export async function fetchInstagramOrganicMetrics(request: InstagramOrganicMetricsRequest) {
  const response = await fetch("/api/organic-metrics/instagram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = "Unable to load Instagram organic metrics.";
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
