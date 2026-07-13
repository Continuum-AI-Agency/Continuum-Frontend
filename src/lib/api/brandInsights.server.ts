import 'server-only';

import { getApiBaseUrl } from '@/lib/api/config';
import { ApiError, assertOk } from '@/lib/api/errors';
import type { RequestOptions } from '@/lib/api/http.types';
import {
  mapBackendInsightsResponse,
  mapBackendProfileResponse,
} from '@/lib/brand-insights/backend';
import { tags } from '@/lib/cache/tags';
import {
  BRAND_TRENDS_SCHEMA,
  type BrandInsights,
  type BrandInsightsProfile,
} from '@/lib/schemas/brandInsights';

type FetchOptions = {
  revalidateSeconds?: number;
  weekStartDate?: string;
};

const DEFAULT_REVALIDATE_SECONDS = 3600;

async function getServerAccessToken(): Promise<string | undefined> {
  try {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server');
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? undefined;
  } catch {
    return undefined;
  }
}

async function request<TResponse = unknown>(
  options: RequestOptions<TResponse>,
): Promise<TResponse> {
  const { path, method = 'GET', body, headers = {}, schema, cache, next } = options;
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const token = await getServerAccessToken();
  const finalHeaders: Record<string, string> = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'X-Supabase-Schema': BRAND_TRENDS_SCHEMA,
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

async function requestWithFallback<TResponse = unknown>(
  primaryPath: string,
  fallbackPath: string,
  options?: Omit<RequestOptions<TResponse>, 'path'>,
) {
  try {
    return await request<TResponse>({ ...options, path: primaryPath });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) {
      throw error;
    }

    return request<TResponse>({ ...options, path: fallbackPath });
  }
}

export async function fetchBrandInsights(
  brandId: string,
  options?: FetchOptions,
): Promise<BrandInsights> {
  const encodedBrandId = encodeURIComponent(brandId);
  const revalidate = options?.revalidateSeconds ?? DEFAULT_REVALIDATE_SECONDS;
  const next = { revalidate, tags: [tags.brandInsights(brandId)] };
  let response: unknown;

  try {
    response = await request({
      path: '/api/trends/read',
      method: 'POST',
      body: {
        brand_id: brandId,
        week_start_date: options?.weekStartDate,
      },
      next,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) {
      throw error;
    }

    response = await requestWithFallback(
      `/api/trends/${encodedBrandId}`,
      `/api/brand-insights/${encodedBrandId}`,
      {
        method: 'GET',
        next,
      },
    );
  }

  return mapBackendInsightsResponse(response);
}

export async function fetchBrandInsightsProfile(
  brandId: string,
  options?: FetchOptions,
): Promise<BrandInsightsProfile> {
  const encodedBrandId = encodeURIComponent(brandId);
  const response = await requestWithFallback(
    `/api/trends/profile/${encodedBrandId}`,
    `/api/brand-insights/profile/${encodedBrandId}`,
    {
      method: 'GET',
      next: {
        revalidate: options?.revalidateSeconds ?? DEFAULT_REVALIDATE_SECONDS,
        tags: [tags.brandInsights(brandId)],
      },
    },
  );

  return mapBackendProfileResponse(response);
}
