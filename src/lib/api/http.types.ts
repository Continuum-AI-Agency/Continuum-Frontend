import type { ZodType } from "zod";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RequestOptions<TResponse> = {
  path: string;
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  schema?: ZodType<TResponse>;
  cache?: RequestCache;
  next?: NextFetchRequestConfig;
};
