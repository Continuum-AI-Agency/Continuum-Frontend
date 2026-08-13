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

const UNSAFE_REDIRECT_PREFIXES = ['/api', '/_next', '/oauth'];

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;
}

function normalizeFallbackPath(fallbackPath: string): string {
  if (!fallbackPath || !fallbackPath.startsWith('/') || fallbackPath.startsWith('//')) {
    return '/dashboard';
  }
  return fallbackPath;
}

function isSafeRedirectPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  return !UNSAFE_REDIRECT_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function resolveAuthRedirectPath({
  requestedRedirect,
  siteUrl,
  fallbackPath = '/dashboard',
}: ResolveAuthRedirectOptions): string {
  const fallback = normalizeFallbackPath(fallbackPath);

  if (!requestedRedirect) {
    return fallback;
  }

  const trimmed = requestedRedirect.trim();
  if (trimmed.length === 0 || trimmed.startsWith('//')) {
    return fallback;
  }

  if (trimmed.startsWith('/')) {
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

/**
 * The URL Supabase should return a user to after it verifies them.
 *
 * Always `/auth/callback`, with the real destination in `next` — because that route
 * handler is the only code that calls `exchangeCodeForSession`. Handing Supabase the
 * destination directly delivers a `?code=` to a page that never redeems it, so the
 * page sees no session; for `/invite/callback` that meant bouncing to `/login`, which
 * mailed another link to the same dead end. Invitees looped until they gave up and
 * onboarded into a duplicate of the brand they were invited to.
 *
 * (This replaced a `resolveAuthRedirect` that returned the bare destination. It was
 * only ever used as a Supabase redirect target, which is exactly what it must not be.)
 */
export function buildAuthCallbackUrl({
  siteUrl,
  next,
  provider,
  context,
}: BuildAuthCallbackUrlOptions): string {
  const callbackUrl = new URL('/auth/callback', normalizeSiteUrl(siteUrl));
  callbackUrl.searchParams.set(
    'next',
    resolveAuthRedirectPath({ requestedRedirect: next, siteUrl, fallbackPath: '/dashboard' }),
  );

  if (context) {
    callbackUrl.searchParams.set('context', context);
  }

  if (provider) {
    callbackUrl.searchParams.set('provider', provider);
  }

  return callbackUrl.toString();
}
