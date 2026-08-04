import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, getSupabaseCookieOptions } from './lib/supabase/cookies';
import { authRedirectTarget, isProtectedRoute } from './proxy-config';

export async function proxy(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage =
    request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup');

  if (!user && isProtectedRoute(request.nextUrl.pathname)) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirectTo', authRedirectTarget(request.nextUrl));
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return supabaseResponse;
}

export const config = {
  // Keep this literal statically analyzable by Next.js. Its behavior is covered
  // by the equivalent pure config in proxy-config.ts.
  matcher: [
    '/((?!_next/static|_next/image|_vercel(?:/.*)?|share/.*|favicon.ico|robots.txt|sitemap.xml|manifest.json|icon.png|apple-icon.png|socket\\.io(?:/.*)?|\\.well-known/appspecific(?:/.*)?|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|js|css|map)$).*)',
  ],
};
