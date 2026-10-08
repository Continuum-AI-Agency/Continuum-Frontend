import 'server-only';

import { getApiBaseUrl } from '@/lib/api/config';
import { assertOk } from '@/lib/api/errors';
import type { RequestOptions } from '@/lib/api/http.types';
import { mapBackendInsightsResponse } from '@/lib/brand-insights/backend';
import { tags } from '@/lib/cache/tags';
import { BRAND_TRENDS_SCHEMA, type BrandInsights } from '@/lib/schemas/brandInsights';

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

export async function fetchBrandInsights(
  brandId: string,
  options?: FetchOptions,
): Promise<BrandInsights> {
  const revalidate = options?.revalidateSeconds ?? DEFAULT_REVALIDATE_SECONDS;
  const next = { revalidate, tags: [tags.brandInsights(brandId)] };
  const response = await request({
    path: '/api/trends/read',
    method: 'POST',
    body: {
      brand_id: brandId,
      week_start_date: options?.weekStartDate,
    },
    next,
  });

  return mapBackendInsightsResponse(response);
}
