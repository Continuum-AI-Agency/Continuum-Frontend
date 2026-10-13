import type { ZodType } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RequestOptions<TResponse> = {
  path: string;
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  schema?: ZodType<TResponse, any, any>;
  cache?: RequestCache;
  next?: NextFetchRequestConfig;
  signal?: AbortSignal;
  /** Overrides the policy bound (a GET is a read at READ_TIMEOUT_MS, anything else a job at
   *  LONG_OPERATION_TIMEOUT_MS). `null` removes the bound: the caller owns the wait. */
  timeoutMs?: number | null;
};
