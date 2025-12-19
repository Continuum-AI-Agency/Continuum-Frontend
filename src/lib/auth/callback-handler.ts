import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallbackContext } from "@/lib/auth/callback-context";

function renderPopupAwareResult(options: {
  success: boolean;
  context: string;
  provider: string | null;
  message?: string;
  fallbackRedirect: string;
}) {
  const { success, message, fallbackRedirect, context, provider } = options;
  const payload = success
    ? {
        type: "oauth:success",
        provider,
        context,
        accountId: null,
      }
    : {
        type: "oauth:error",
        provider,
        context,
        message: message ?? "Authentication failed",
      };

  const html = `<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Authentication</title></head>
  <body style="font-family: sans-serif; display: grid; min-height: 100vh; place-items: center;">
    <div>
      <p>${success ? "Authentication complete." : "Authentication failed."}</p>
      <p>You can close this window.</p>
    </div>
    <script>
      (function () {
        try {
          var payload = ${JSON.stringify(payload)};
          if (window.opener) {
            window.opener.postMessage(payload, window.location.origin);
            try { window.close(); } catch (_) {}
            return;
          }
        } catch (e) {
          // ignore and continue to fallback navigation
        }
        // Fallback for when this page is opened in the main window
        window.location.replace(${JSON.stringify(fallbackRedirect)});
      })();
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    status: success ? 200 : 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function handleAuthCallbackRequest(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const context = requestUrl.searchParams.get("context");
  const provider = requestUrl.searchParams.get("provider");
  const origin = requestUrl.origin;
  const cookieContext = request.cookies.get("continuum_oauth_context")?.value;
  const cookieProvider = request.cookies.get("continuum_oauth_provider")?.value;

  const resolved = resolveCallbackContext({
    queryContext: context,
    queryProvider: provider,
    cookieContext,
    cookieProvider,
    defaultContext: "login",
  });

  if (!code) {
    const response = renderPopupAwareResult({
      success: false,
      context: resolved.context,
      provider: resolved.provider,
      message: "Missing authorization code.",
      fallbackRedirect: `${origin}/login?error=auth_callback_failed`,
    });
    response.cookies.delete("continuum_oauth_context");
    response.cookies.delete("continuum_oauth_provider");
    return response;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[AUTH_CALLBACK] Failed to exchange code for session:", {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      const response = renderPopupAwareResult({
        success: false,
        context: resolved.context,
        provider: resolved.provider,
        message: error.message,
        fallbackRedirect: `${origin}/login?error=auth_callback_failed`,
      });
      response.cookies.delete("continuum_oauth_context");
      response.cookies.delete("continuum_oauth_provider");
      return response;
    }
  } catch (error) {
    console.error("[AUTH_CALLBACK] Unexpected error during OAuth callback:", {
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
    const response = renderPopupAwareResult({
      success: false,
      context: resolved.context,
      provider: resolved.provider,
      message: "Unexpected error",
      fallbackRedirect: `${origin}/login?error=unexpected_error`,
    });
    response.cookies.delete("continuum_oauth_context");
    response.cookies.delete("continuum_oauth_provider");
    return response;
  }

  const response = renderPopupAwareResult({
    success: true,
    context: resolved.context,
    provider: resolved.provider,
    fallbackRedirect: `${origin}/dashboard`,
  });
  response.cookies.delete("continuum_oauth_context");
  response.cookies.delete("continuum_oauth_provider");
  return response;
}
