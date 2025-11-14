import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function renderPopupAwareResult(options: {
  success: boolean;
  message?: string;
  fallbackRedirect: string;
}) {
  const { success, message, fallbackRedirect } = options;
  const payload = success
    ? {
        type: "oauth:success",
        provider: null,
        context: "login",
        accountId: null,
      }
    : {
        type: "oauth:error",
        provider: null,
        context: "login",
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

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  if (!code) {
    return renderPopupAwareResult({
      success: false,
      message: "Missing authorization code.",
      fallbackRedirect: `${origin}/login?error=auth_callback_failed`,
    });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[AUTH_CALLBACK] Failed to exchange code for session:", {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return renderPopupAwareResult({
        success: false,
        message: error.message,
        fallbackRedirect: `${origin}/login?error=auth_callback_failed`,
      });
    }
  } catch (error) {
    console.error("[AUTH_CALLBACK] Unexpected error during OAuth callback:", {
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
    return renderPopupAwareResult({
      success: false,
      message: "Unexpected error",
      fallbackRedirect: `${origin}/login?error=unexpected_error`,
    });
  }

  return renderPopupAwareResult({
    success: true,
    fallbackRedirect: `${origin}/dashboard`,
  });
}

