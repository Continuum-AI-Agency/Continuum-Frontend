import { z } from "zod";
import { getApiBaseUrl } from "@/lib/api/config";
import { assertOk } from "@/lib/api/errors";
// Use dynamic imports to avoid bundling client code in server context and vice versa.

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RequestOptions<TResponse> = {
  path: string;
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  schema?: z.ZodType<TResponse>;
  cache?: RequestCache;
  next?: NextFetchRequestConfig;
};

async function getAccessToken(): Promise<string | undefined> {
  const isBrowser = typeof window !== "undefined";
  try {
    if (isBrowser) {
      const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? undefined;
    }
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

  const token = await getAccessToken();
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

export const http = {
  request,
};


