import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SUPABASE_PROVIDERS = new Set(["google"]);

function buildRedirectTo(origin: string, provider: string, context: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || origin;
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  const url = new URL(`${trimmed}/oauth/callback`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("context", context);
  return url.toString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const context = url.searchParams.get("context") ?? "onboarding";

  if (!provider) {
    return NextResponse.json({ error: "provider is required" }, { status: 400 });
  }

  if (!SUPABASE_PROVIDERS.has(provider)) {
    const fallback = new URL("/oauth/mock", url.origin);
    fallback.searchParams.set("provider", provider);
    fallback.searchParams.set("context", context);
    return NextResponse.redirect(fallback);
  }

  const supabase = await createClient();
  const redirectTo = buildRedirectTo(url.origin, provider, context);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as "google",
    options: { redirectTo },
  });

  if (error || !data?.url) {
    const errorMessage = error?.message ?? "Unable to start OAuth flow.";
    const fallback = new URL("/oauth/mock", url.origin);
    fallback.searchParams.set("provider", provider);
    fallback.searchParams.set("context", context);
    fallback.searchParams.set("error", errorMessage);
    return NextResponse.redirect(fallback);
  }

  return NextResponse.redirect(data.url);
}
