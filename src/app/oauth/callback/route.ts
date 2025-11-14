import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRequestOrigin } from "@/lib/server/origin";

type PopupPayload =
  | {
      type: "oauth:success";
      provider: string | null;
      context: string;
      accountId: string | null;
    }
  | {
      type: "oauth:error";
      provider: string | null;
      context: string;
      message: string;
    };

function renderPopupResult(
  payload: PopupPayload,
  fallbackRedirect: string,
  status = 200,
  postMessageOrigin?: string
): NextResponse {
  const safePayload = JSON.stringify(payload);
  const targetOrigin = postMessageOrigin ?? new URL(fallbackRedirect).origin;
  const html = `<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8" /><title>OAuth</title></head>
  <body style="font-family: sans-serif; display: grid; min-height: 100vh; place-items: center;">
    <div>
      <p>${payload.type === "oauth:success" ? "Authentication complete." : "Authentication failed."}</p>
      <p>You can close this window.</p>
    </div>
    <script>
      (function () {
        try {
          const payload = ${safePayload};
          if (window.opener) {
            window.opener.postMessage(payload, ${JSON.stringify(targetOrigin)});
            try { window.close(); } catch (_) {}
            return;
          }
        } catch (error) {
          console.error("Failed to notify opener", error);
        }
        // Fallback when opened in the main window
        window.location.replace(${JSON.stringify(fallbackRedirect)});
      })();
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const context = url.searchParams.get("context") ?? "onboarding";
  const code = url.searchParams.get("code");
  const errorDescription = url.searchParams.get("error_description");
  const targetOrigin = resolveRequestOrigin(request, url, url.searchParams.get("origin"));

  if (errorDescription) {
    return renderPopupResult(
      {
        type: "oauth:error",
        provider,
        context,
        message: errorDescription,
      },
      `${targetOrigin}/login?error=auth_callback_failed`,
      400,
      targetOrigin
    );
  }

  if (!code) {
    return renderPopupResult(
      {
        type: "oauth:error",
        provider,
        context,
        message: "Missing authorization code.",
      },
      `${targetOrigin}/login?error=auth_callback_failed`,
      400,
      targetOrigin
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return renderPopupResult(
      {
        type: "oauth:error",
        provider,
        context,
        message: error.message,
      },
      `${targetOrigin}/login?error=auth_callback_failed`,
      400,
      targetOrigin
    );
  }

  return renderPopupResult(
    {
      type: "oauth:success",
      provider,
      context,
      accountId: null,
    },
    `${targetOrigin}/dashboard`,
    200,
    targetOrigin
  );
}
