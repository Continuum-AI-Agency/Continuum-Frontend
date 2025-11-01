export function getApiBaseUrl(): string {
  // Prefer server-only env when available; fall back to client env; default to localhost.
  const isBrowser = typeof window !== "undefined";
  const serverBase = process.env.API_BASE_URL;
  const clientBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  const baseUrl = isBrowser ? clientBase ?? serverBase : serverBase ?? clientBase;
  return (baseUrl && baseUrl.trim().length > 0 ? baseUrl : "http://localhost:8000").replace(/\/$/, "");
}


