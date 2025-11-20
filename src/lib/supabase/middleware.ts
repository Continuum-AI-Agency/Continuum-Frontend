import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { applySupabaseCookies, getSupabaseCookieOptions } from "./cookies";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
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


