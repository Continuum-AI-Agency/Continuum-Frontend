import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("[AUTH_CALLBACK] Failed to exchange code for session:", {
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
      }
    } catch (error) {
      console.error("[AUTH_CALLBACK] Unexpected error during OAuth callback:", {
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
      return NextResponse.redirect(`${origin}/login?error=unexpected_error`);
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}

