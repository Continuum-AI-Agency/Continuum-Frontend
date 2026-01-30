import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { applySupabaseCookies, getSupabaseCookieOptions } from "./lib/supabase/cookies";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase middleware configuration missing NEXT_PUBLIC_SUPABASE_URL or key env var.");
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
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
              nextResponse.cookies.set(name, "", options);
            },
          });

          supabaseResponse = nextResponse;
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage = request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup") ||
    request.nextUrl.pathname.startsWith("/recovery");
  
  const isProtectedRoute = request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/organic") ||
    request.nextUrl.pathname.startsWith("/paid-media") ||
    request.nextUrl.pathname.startsWith("/ai-studio") ||
    request.nextUrl.pathname.startsWith("/integrations");

  if (!user && isProtectedRoute) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
