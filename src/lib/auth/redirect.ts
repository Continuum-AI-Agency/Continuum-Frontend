type ResolveAuthRedirectOptions = {
  requestedRedirect?: string;
  siteUrl: string;
  fallbackPath?: string;
};

type BuildAuthCallbackUrlOptions = {
  siteUrl: string;
  next?: string;
  provider?: string;
  context?: string;
};

const UNSAFE_REDIRECT_PREFIXES = ["/api", "/_next", "/oauth"];

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
}

function normalizeFallbackPath(fallbackPath: string): string {
  if (!fallbackPath || !fallbackPath.startsWith("/") || fallbackPath.startsWith("//")) {
    return "/dashboard";
  }
  return fallbackPath;
}

function isSafeRedirectPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  return !UNSAFE_REDIRECT_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

export function resolveAuthRedirectPath({
  requestedRedirect,
  siteUrl,
  fallbackPath = "/dashboard",
}: ResolveAuthRedirectOptions): string {
  const fallback = normalizeFallbackPath(fallbackPath);

  if (!requestedRedirect) {
    return fallback;
  }

  const trimmed = requestedRedirect.trim();
  if (trimmed.length === 0 || trimmed.startsWith("//")) {
    return fallback;
  }

  if (trimmed.startsWith("/")) {
    return isSafeRedirectPath(trimmed) ? trimmed : fallback;
  }

  try {
    const siteOrigin = new URL(normalizeSiteUrl(siteUrl)).origin;
    const parsed = new URL(trimmed);
    if (parsed.origin !== siteOrigin) {
      return fallback;
    }

    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return isSafeRedirectPath(path) ? path : fallback;
  } catch {
    return fallback;
  }
}

export function resolveAuthRedirect({
  requestedRedirect,
  siteUrl,
  fallbackPath = "/dashboard",
}: ResolveAuthRedirectOptions): string {
  const origin = normalizeSiteUrl(siteUrl);
  return `${origin}${resolveAuthRedirectPath({ requestedRedirect, siteUrl: origin, fallbackPath })}`;
}

export function buildAuthCallbackUrl({
  siteUrl,
  next,
  provider,
  context,
}: BuildAuthCallbackUrlOptions): string {
  const callbackUrl = new URL("/auth/callback", normalizeSiteUrl(siteUrl));
  callbackUrl.searchParams.set(
    "next",
    resolveAuthRedirectPath({ requestedRedirect: next, siteUrl, fallbackPath: "/dashboard" })
  );

  if (context) {
    callbackUrl.searchParams.set("context", context);
  }

  if (provider) {
    callbackUrl.searchParams.set("provider", provider);
  }

  return callbackUrl.toString();
}
