function normalizeOrigin(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    return new URL(input).origin;
  } catch {
    try {
      return new URL(`https://${input}`).origin;
    } catch {
      return null;
    }
  }
}

export function buildOAuthStartUrl(provider: string, context: string): string {
  const params = new URLSearchParams({ provider, context });
  const runtimeOrigin =
    typeof window !== "undefined" && typeof window.location?.origin === "string"
      ? window.location.origin
      : null;
  const fallbackOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  const selectedOrigin = runtimeOrigin ?? fallbackOrigin;

  if (selectedOrigin) {
    params.set("origin", selectedOrigin);
  }

  return `/oauth/start?${params.toString()}`;
}
