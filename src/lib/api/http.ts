import { getApiBaseUrl } from '@/lib/api/config';
import { assertOk, markFetchFailure } from '@/lib/api/errors';
import type { RequestOptions } from '@/lib/api/http.types';
import { backendTimeoutPolicy, fetchWithTimeout } from '@/lib/api/timeout';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';

export async function request<TResponse = unknown>(
  options: RequestOptions<TResponse>,
): Promise<TResponse> {
  const {
    path,
    method = 'GET',
    body,
    headers = {},
    schema,
    cache,
    next,
    signal,
    timeoutMs,
  } = options;
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const token = await getBrowserAccessToken();
  const finalHeaders: Record<string, string> = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  console.log(`[http] ${method} ${url}`);

  // One bound per request (src/lib/api/timeout.ts): a hung Backend call ends as a
  // RequestTimeoutError the surface can name, never as a skeleton that stays.
  const bounded = fetchWithTimeout(
    timeoutMs === undefined ? backendTimeoutPolicy : () => timeoutMs,
  );
  const response = await bounded(url, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
    cache,
    next,
    signal,
  }).catch((error: unknown) => {
    throw markFetchFailure(error);
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

export const http = {
  request,
};
