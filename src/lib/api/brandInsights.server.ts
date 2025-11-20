import "server-only";

import { mapBackendInsightsResponse, mapBackendProfileResponse } from "@/lib/brand-insights/backend";
import { httpServer } from "@/lib/api/http.server";
import type { BrandInsights, BrandInsightsProfile } from "@/lib/schemas/brandInsights";

type FetchOptions = {
  revalidateSeconds?: number;
};

const DEFAULT_REVALIDATE_SECONDS = 3600;

export async function fetchBrandInsights(brandId: string, options?: FetchOptions): Promise<BrandInsights> {
  const response = await httpServer.request({
    path: `/api/brand-insights/${encodeURIComponent(brandId)}`,
    method: "GET",
    next: { revalidate: options?.revalidateSeconds ?? DEFAULT_REVALIDATE_SECONDS },
  });

  return mapBackendInsightsResponse(response);
}

export async function fetchBrandInsightsProfile(
  brandId: string,
  options?: FetchOptions
): Promise<BrandInsightsProfile> {
  const response = await httpServer.request({
    path: `/api/brand-insights/profile/${encodeURIComponent(brandId)}`,
    method: "GET",
    next: { revalidate: options?.revalidateSeconds ?? DEFAULT_REVALIDATE_SECONDS },
  });

  return mapBackendProfileResponse(response);
}
