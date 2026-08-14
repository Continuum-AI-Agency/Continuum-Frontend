import { normalizeInviteBrandId, normalizeInviteToken } from './lib/invites/params';
import { buildInviteCallbackPath } from './lib/invites/urls';

export function authRedirectTarget(url: { pathname: string; search: string }): string {
  return `${url.pathname}${url.search}`;
}

// A signed-in user on /login is normally sent to the dashboard. An invite link
// that bounced through `buildInviteLoginRedirect` carries the invite on the
// query string, and redirecting to a bare /dashboard drops it — the invite is
// silently lost and even the outcome toast has nothing left to render. Send
// them to redemption instead.
export function authedAuthPageDestination(searchParams: URLSearchParams): string {
  const token = normalizeInviteToken(searchParams.get('token'));
  const brandId = normalizeInviteBrandId(searchParams.get('brand'));
  if (token && brandId) {
    return buildInviteCallbackPath(token, brandId, {
      otp: searchParams.get('otp'),
      type: searchParams.get('type'),
    });
  }
  return '/dashboard';
}

export function isProtectedRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/organic') ||
    pathname.startsWith('/scale') ||
    pathname.startsWith('/paid-media') ||
    pathname.startsWith('/ai-studio') ||
    pathname.startsWith('/open') ||
    pathname.startsWith('/integrations') ||
    pathname.startsWith('/settings')
  );
}

export const config = {
  // share/.* is the anonymous share-link viewer: the token is the credential,
  // so no Supabase session handling should run for it.
  matcher: [
    '/((?!_next/static|_next/image|_vercel(?:/.*)?|share/.*|favicon.ico|robots.txt|sitemap.xml|manifest.json|icon.png|apple-icon.png|socket\\.io(?:/.*)?|\\.well-known/appspecific(?:/.*)?|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|js|css|map)$).*)',
  ],
};
