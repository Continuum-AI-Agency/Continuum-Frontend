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

type OAuthUrlOptions = {
  popup?: boolean;
};

export function buildOAuthCallbackUrl(
  origin: string,
  provider: string,
  context: string,
  options?: OAuthUrlOptions
): string {
  const trimmedOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  const callbackUrl = new URL(`${trimmedOrigin}/oauth/callback`);
  callbackUrl.searchParams.set("provider", provider);
  callbackUrl.searchParams.set("context", context);
  callbackUrl.searchParams.set("origin", trimmedOrigin);
  if (options?.popup) {
    callbackUrl.searchParams.set("popup", "true");
  }
  return callbackUrl.toString();
}

export function buildOAuthStartUrl(provider: string, context: string, options?: OAuthUrlOptions): string {
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

  if (options?.popup) {
    params.set("popup", "true");
  }

  return `/oauth/start?${params.toString()}`;
}
