import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRequestOrigin } from "@/lib/server/origin";

const SUPABASE_PROVIDERS = new Set(["google"]);

function buildRedirectTo(origin: string, provider: string, context: string): string {
  // Always use the request origin for popup flows so the callback returns
  // to the same app that opened the popup, enabling postMessage + close.
  const trimmed = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  const url = new URL(`${trimmed}/oauth/callback`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("context", context);
  url.searchParams.set("origin", trimmed);
  return url.toString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const context = url.searchParams.get("context") ?? "onboarding";

  const resolvedOrigin = resolveRequestOrigin(request, url, url.searchParams.get("origin"));

  if (!provider) {
    return NextResponse.json({ error: "provider is required" }, { status: 400 });
  }

  if (!SUPABASE_PROVIDERS.has(provider)) {
    const fallback = new URL("/oauth/mock", resolvedOrigin);
    fallback.searchParams.set("provider", provider);
    fallback.searchParams.set("context", context);
    return NextResponse.redirect(fallback);
  }

  const supabase = await createSupabaseServerClient();
  const redirectTo = buildRedirectTo(resolvedOrigin, provider, context);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as "google",
    options: { redirectTo },
  });

  if (error || !data?.url) {
    const errorMessage = error?.message ?? "Unable to start OAuth flow.";
    const fallback = new URL("/oauth/mock", resolvedOrigin);
    fallback.searchParams.set("provider", provider);
    fallback.searchParams.set("context", context);
    fallback.searchParams.set("error", errorMessage);
    return NextResponse.redirect(fallback);
  }

  return NextResponse.redirect(data.url);
}
