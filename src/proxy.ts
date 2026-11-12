import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { localeCookieName } from './i18n/config';
import { externalPathname, isLocalizedPage } from './i18n/paths';
import { resolveUiLocale, routing } from './i18n/routing';
import { applySupabaseCookies, getSupabaseCookieOptions } from './lib/supabase/cookies';
import { authedAuthPageDestination, authRedirectTarget, isProtectedRoute } from './proxy-config';

const localize = createIntlMiddleware(routing);

export async function proxy(request: NextRequest) {
  const pathname = externalPathname(request.nextUrl.pathname);
  // Share pages remain anonymous; adding locale routing must not introduce auth work.
  if (pathname.startsWith('/share/')) {
    return isLocalizedPage(pathname) ? localize(request) : NextResponse.next();
  }
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase proxy configuration missing NEXT_PUBLIC_SUPABASE_URL or key env var.',
    );
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      async setAll(cookiesToSet) {
        const nextResponse = NextResponse.next({
          request: { headers: request.headers },
        });

        await applySupabaseCookies(cookiesToSet, {
          getExisting: () => request.cookies.getAll(),
          set: (name, value, options) => {
            request.cookies.set(name, value);
            nextResponse.cookies.set(name, value, options);
          },
          remove: (name, options) => {
            request.cookies.delete(name);
            nextResponse.cookies.set(name, '', options);
          },
        });

        supabaseResponse = nextResponse;
      },
    },
  });

  // getClaims verifies the JWT locally against the project's cached ES256 JWKS;
  // getUser costs a round trip to Supabase on every matched request. The rest of
  // the app already identifies users this way (lib/auth/claims.ts).
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims?.sub ? claimsData.claims : null;

  function withAuthCookies(response: NextResponse): NextResponse {
    for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie);
    return response;
  }

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup');

  if (!user && isProtectedRoute(pathname)) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirectTo', authRedirectTarget(request.nextUrl));
    return withAuthCookies(NextResponse.redirect(redirectUrl));
  }

  if (user && isAuthPage) {
    const destination = authedAuthPageDestination(request.nextUrl.searchParams);
    return withAuthCookies(NextResponse.redirect(new URL(destination, request.url)));
  }

  if (!isLocalizedPage(pathname)) return supabaseResponse;
  const metadata = user?.user_metadata as { ui_locale?: unknown } | undefined;
  const locale = resolveUiLocale({
    cookie: request.cookies.get(localeCookieName)?.value,
    account: metadata?.ui_locale,
    acceptLanguage: request.headers.get('accept-language'),
  });
  request.cookies.set(localeCookieName, locale);
  const response = withAuthCookies(localize(request));
  response.cookies.set(localeCookieName, locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: 31_536_000,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}

export const config = {
  // Keep this literal statically analyzable by Next.js. Its behavior is covered
  // by the equivalent pure config in proxy-config.ts.
  matcher: [
    '/((?!_next/static|_next/image|_vercel(?:/.*)?|favicon.ico|robots.txt|sitemap.xml|manifest.json|icon.png|apple-icon.png|socket\\.io(?:/.*)?|\\.well-known/appspecific(?:/.*)?|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|js|css|map)$).*)',
  ],
};
