import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, getSupabaseCookieOptions } from './lib/supabase/cookies';

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

  const isProtectedRoute =
    request.nextUrl.pathname.startsWith('/dashboard') ||
    request.nextUrl.pathname.startsWith('/organic') ||
    request.nextUrl.pathname.startsWith('/scale') ||
    request.nextUrl.pathname.startsWith('/paid-media') ||
    request.nextUrl.pathname.startsWith('/ai-studio') ||
    request.nextUrl.pathname.startsWith('/integrations') ||
    request.nextUrl.pathname.startsWith('/settings');

  if (!user && isProtectedRoute) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return supabaseResponse;
}

export const config = {
  // share/.* is the anonymous share-link viewer: the token is the credential,
  // so no Supabase session handling should run for it.
  matcher: [
    '/((?!_next/static|_next/image|_vercel(?:/.*)?|share/.*|favicon.ico|robots.txt|sitemap.xml|manifest.json|icon.png|apple-icon.png|socket\\.io(?:/.*)?|\\.well-known/appspecific(?:/.*)?|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|js|css|map)$).*)',
  ],
};
