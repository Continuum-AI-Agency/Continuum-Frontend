/**
 * Resolves the configured API base URL.
 *
 * Priority (Server): API_URL → API_BASE_URL → NEXT_PUBLIC_API_URL → NEXT_PUBLIC_API_BASE_URL
 * Priority (Browser): NEXT_PUBLIC_API_URL → NEXT_PUBLIC_API_BASE_URL → API_URL → API_BASE_URL
 *
 * Falls back to http://localhost:8000 and trims any trailing slash.
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
  return (baseUrl && baseUrl.trim().length > 0 ? baseUrl : "http://localhost:8000").replace(/\/$/, "");
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


