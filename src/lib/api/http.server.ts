import "server-only";

import { getApiBaseUrl } from "@/lib/api/config";
import { assertOk } from "@/lib/api/errors";
import type { RequestOptions } from "@/lib/api/http.types";

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

export async function request<TResponse = unknown>(options: RequestOptions<TResponse>): Promise<TResponse> {
  const { path, method = "GET", body, headers = {}, schema, cache, next } = options;
  const baseUrl = getApiBaseUrl();
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
    return schema.parse(json);
  }
  return json as TResponse;
}

export const httpServer = {
  request,
};
