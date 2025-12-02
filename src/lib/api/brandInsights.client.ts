"use client";

import { mapBackendGenerationResponse, mapBackendStatusResponse } from "@/lib/brand-insights/backend";
import { getBrandInsightsApiUrl } from "@/lib/api/config";
import { assertOk } from "@/lib/api/errors";
import type { RequestOptions } from "@/lib/api/http.types";
import { brandInsightsGenerateInputSchema } from "@/lib/schemas/brandInsights";

async function getBrowserAccessToken(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? undefined;
  } catch {
    return undefined;
  }
}

async function request<TResponse = unknown>(options: RequestOptions<TResponse>): Promise<TResponse> {
  const { path, method = "GET", body, headers = {}, schema, cache, next } = options;
  const baseUrl = getBrandInsightsApiUrl();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const token = await getBrowserAccessToken();
  const finalHeaders: Record<string, string> = {
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
    cache,
    next,
  });

  await assertOk(response);
  if (response.status === 204) {
    return undefined as unknown as TResponse;
  }
  const json = (await response.json()) as unknown;
  if (schema) {
    return schema.parse(json);
  }
  return json as TResponse;
}

export async function generateBrandInsights(input: unknown) {
  const parsed = brandInsightsGenerateInputSchema.parse(input);
  const response = await request({
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
  const response = await request({
    path: `/api/brand-insights/status/${encodeURIComponent(taskId)}`,
    method: "GET",
    cache: "no-store",
  });

  return mapBackendStatusResponse(response);
}
