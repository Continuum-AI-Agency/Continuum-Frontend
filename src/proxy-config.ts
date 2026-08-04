export function authRedirectTarget(url: { pathname: string; search: string }): string {
  return `${url.pathname}${url.search}`;
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
