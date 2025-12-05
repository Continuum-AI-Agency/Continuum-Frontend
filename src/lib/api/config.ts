/**
 * Resolves the configured API base URL.
 *
 * Priority (Server): API_URL → API_BASE_URL → NEXT_PUBLIC_API_URL → NEXT_PUBLIC_API_BASE_URL
 * Priority (Browser): NEXT_PUBLIC_API_URL → NEXT_PUBLIC_API_BASE_URL → API_URL → API_BASE_URL
 *
 * Falls back to http://localhost:4000 and trims any trailing slash.
 */
export function getApiBaseUrl(): string {
  const isBrowser = typeof window !== "undefined";

  const serverBase =
    process.env.API_URL ??
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL;

  const clientBase =
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.API_URL ??
    process.env.API_BASE_URL;

  const baseUrl = isBrowser ? clientBase ?? serverBase : serverBase ?? clientBase;
  return (baseUrl && baseUrl.trim().length > 0 ? baseUrl : "http://localhost:4000").replace(/\/$/, "");
}

function resolveBaseUrl(envKeys: Array<string | undefined>, fallback: string) {
  const candidate = envKeys.find((value) => value && value.trim().length > 0);
  return (candidate ?? fallback).replace(/\/$/, "");
}

function getBrandInsightsBaseUrl(): string {
  const isBrowser = typeof window !== "undefined";

  const serverBase = resolveBaseUrl(
    [
      process.env.PYTHON_API_URL,
      process.env.PYTHON_API_BASE_URL,
      process.env.NEXT_PUBLIC_PYTHON_API_URL,
      process.env.NEXT_PUBLIC_PYTHON_API_BASE_URL,
      process.env.BRAND_INSIGHTS_API_URL,
      process.env.BRAND_INSIGHTS_API_BASE_URL,
      process.env.NEXT_PUBLIC_BRAND_INSIGHTS_API_URL,
      process.env.NEXT_PUBLIC_BRAND_INSIGHTS_API_BASE_URL,
    ],
    ""
  );

  const clientBase = resolveBaseUrl(
    [
      process.env.NEXT_PUBLIC_PYTHON_API_URL,
      process.env.NEXT_PUBLIC_PYTHON_API_BASE_URL,
      process.env.PYTHON_API_URL,
      process.env.PYTHON_API_BASE_URL,
      process.env.NEXT_PUBLIC_BRAND_INSIGHTS_API_URL,
      process.env.NEXT_PUBLIC_BRAND_INSIGHTS_API_BASE_URL,
      process.env.BRAND_INSIGHTS_API_URL,
      process.env.BRAND_INSIGHTS_API_BASE_URL,
    ],
    ""
  );

  const baseUrl = isBrowser ? clientBase || serverBase : serverBase || clientBase;
  if (baseUrl && baseUrl.trim().length > 0) return baseUrl;
  // Fallback to the general API base (defaults to localhost:8000).
  return getApiBaseUrl();
}

/**
 * Builds a full API URL for the provided path segment, ensuring clean slashes.
 *
 * Example:
 *   getApiUrl('/v1/users') → "https://api.example.com/v1/users"
 *   getApiUrl('v1/users')  → "https://api.example.com/v1/users"
 */
export function getApiUrl(path?: string): string {
  const base = getApiBaseUrl();
  if (!path || path.trim().length === 0) return base;
  const trimmedBase = base.replace(/\/$/, "");
  const trimmedPath = path.replace(/^\//, "");
  return `${trimmedBase}/${trimmedPath}`;
}

export function getBrandInsightsApiUrl(path?: string): string {
  const base = getBrandInsightsBaseUrl();
  if (!path || path.trim().length === 0) return base;
  const trimmedBase = base.replace(/\/$/, "");
  const trimmedPath = path.replace(/^\//, "");
  return `${trimmedBase}/${trimmedPath}`;
}
