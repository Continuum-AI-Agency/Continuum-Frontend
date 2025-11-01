import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

function renderPopupResult(payload: PopupPayload, status = 200): NextResponse {
  const safePayload = JSON.stringify(payload);
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
            window.opener.postMessage(payload, window.location.origin);
          }
        } catch (error) {
          console.error("Failed to notify opener", error);
        }
        window.close();
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

  if (errorDescription) {
    return renderPopupResult(
      {
        type: "oauth:error",
        provider,
        context,
        message: errorDescription,
      },
      400
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
      400
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
      400
    );
  }

  return renderPopupResult({
    type: "oauth:success",
    provider,
    context,
    accountId: null,
  });
}
