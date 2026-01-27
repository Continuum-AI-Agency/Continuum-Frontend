import "server-only";

import { mapBackendInsightsResponse, mapBackendProfileResponse } from "@/lib/brand-insights/backend";
import { getBrandInsightsApiUrl } from "@/lib/api/config";
import { assertOk } from "@/lib/api/errors";
import type { RequestOptions } from "@/lib/api/http.types";
import type { BrandInsights, BrandInsightsProfile } from "@/lib/schemas/brandInsights";

type FetchOptions = {
  revalidateSeconds?: number;
};

const DEFAULT_REVALIDATE_SECONDS = 3600;

async function getServerAccessToken(): Promise<string | undefined> {
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
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

  const token = await getServerAccessToken();
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
    return schema.parse(json) as TResponse;
  }
  return json as TResponse;
}

export async function fetchBrandInsights(brandId: string, options?: FetchOptions): Promise<BrandInsights> {
  const response = await request({
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
  const response = await request({
    path: `/api/brand-insights/profile/${encodeURIComponent(brandId)}`,
    method: "GET",
    next: { revalidate: options?.revalidateSeconds ?? DEFAULT_REVALIDATE_SECONDS },
  });

  return mapBackendProfileResponse(response);
}
