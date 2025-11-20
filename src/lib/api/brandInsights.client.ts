"use client";

import { mapBackendGenerationResponse, mapBackendStatusResponse } from "@/lib/brand-insights/backend";
import { http } from "@/lib/api/http";
import { brandInsightsGenerateInputSchema } from "@/lib/schemas/brandInsights";

export async function generateBrandInsights(input: unknown) {
  const parsed = brandInsightsGenerateInputSchema.parse(input);
  const response = await http.request({
    path: "/api/brand-insights/generate",
    method: "POST",
    body: {
      brand_id: parsed.brandId,
      force_regenerate: parsed.forceRegenerate ?? false,
      selected_social_platforms: parsed.selectedSocialPlatforms ?? undefined,
    },
    cache: "no-store",
  });

  return mapBackendGenerationResponse(response);
}

export async function fetchBrandInsightsStatus(taskId: string) {
  const response = await http.request({
    path: `/api/brand-insights/status/${encodeURIComponent(taskId)}`,
    method: "GET",
    cache: "no-store",
  });

  return mapBackendStatusResponse(response);
}
