import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_COOKIE_NAME, applySupabaseCookies, getSupabaseCookieOptions } from "./cookies";

const SUPABASE_COOKIE_NAMES = new Set([
  "sb",
  SUPABASE_COOKIE_NAME,
  "sb-access-token",
  "sb-refresh-token",
  "sb-auth-token",
  "supabase-auth-token",
  "supabase-refresh-token",
  "supabase-session",
]);

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  const cookies = request.cookies.getAll();
  if (cookies.length === 0) return false;
  return cookies.some(({ name }) => {
    if (SUPABASE_COOKIE_NAMES.has(name)) return true;
    if (name.startsWith("sb-") || name.startsWith("supabase-")) return true;
    return false;
  });
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase middleware client misconfigured: missing URL or key env vars.");
  }

  if (!hasSupabaseAuthCookie(request)) {
    return supabaseResponse;
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

  // IMPORTANT: Avoid logic between client creation and getUser to prevent random logouts
  await supabase.auth.getUser();

  return supabaseResponse;
}
