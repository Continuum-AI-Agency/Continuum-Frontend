import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getCookieLocale, restoreAccountLocale } from '@/i18n/server';
import { escapePopupHtml, popupScriptJson } from '@/lib/auth/popup-html';
import { OAUTH_BROADCAST_CHANNEL_NAME } from '@/lib/popup';
import { resolveRequestOrigin } from '@/lib/server/origin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type PopupPayload =
  | {
      type: 'oauth:success';
      provider: string | null;
      context: string;
      accountId: string | null;
    }
  | {
      type: 'oauth:error';
      provider: string | null;
      context: string;
      message: string;
    };

async function renderPopupResult(
  payload: PopupPayload,
  fallbackRedirect: string,
  status = 200,
  postMessageOrigin?: string,
  isPopup?: boolean,
): Promise<NextResponse> {
  const locale = await getCookieLocale();
  const t = await getTranslations({ locale, namespace: 'auth' });
  const safePayload = popupScriptJson(payload);
  const targetOrigin = postMessageOrigin ?? new URL(fallbackRedirect).origin;
  const html = `<!DOCTYPE html>
<html lang="${locale}">
  <head><meta charset="utf-8" /><title>${escapePopupHtml(t('authentication'))}</title></head>
  <body style="font-family: sans-serif; display: grid; min-height: 100vh; place-items: center;">
    <div>
      <p>${escapePopupHtml(t(payload.type === 'oauth:success' ? 'authenticationComplete' : 'authenticationFailed'))}</p>
      <p>${escapePopupHtml(t(isPopup ? 'closeWindow' : 'redirecting'))}</p>
    </div>
    <script>
      (function () {
        const isPopup = ${!!isPopup};
        const payload = ${safePayload};
        if (isPopup) {
          // accounts.google.com sends its own Cross-Origin-Opener-Policy:
          // same-origin header, which permanently severs window.opener on
          // this popup for Google flows. window.opener.postMessage below
          // then silently no-ops, so the BroadcastChannel post (same-origin
          // delivery, no window reference required) is the signal the
          // opener can still rely on. Broadcast first, then still attempt
          // postMessage for providers that don't sever the opener.
          try {
            if (typeof BroadcastChannel !== "undefined") {
              const channel = new BroadcastChannel(${popupScriptJson(OAUTH_BROADCAST_CHANNEL_NAME)});
              channel.postMessage(payload);
              channel.close();
            }
          } catch (error) {
            console.error("Failed to broadcast oauth completion", error);
          }
          if (window.opener) {
            try {
              window.opener.postMessage(payload, ${popupScriptJson(targetOrigin)});
              window.close();
              return;
            } catch (error) {
              console.error("Failed to notify opener", error);
            }
          }
        }
        // Fallback when opened in the main window, or when the opener
        // postMessage above failed/was unavailable.
        window.location.replace(${popupScriptJson(fallbackRedirect)});
      })();
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider');
  const context = url.searchParams.get('context') ?? 'onboarding';
  const code = url.searchParams.get('code');
  const isPopup = url.searchParams.get('popup') === 'true';
  const errorDescription = url.searchParams.get('error_description');
  const targetOrigin = resolveRequestOrigin(request, url, url.searchParams.get('origin'));

  if (errorDescription) {
    return renderPopupResult(
      {
        type: 'oauth:error',
        provider,
        context,
        message: errorDescription,
      },
      `${targetOrigin}/login?error=auth_callback_failed`,
      400,
      targetOrigin,
      isPopup,
    );
  }

  if (!code) {
    return renderPopupResult(
      {
        type: 'oauth:error',
        provider,
        context,
        message: 'Missing authorization code.',
      },
      `${targetOrigin}/login?error=auth_callback_failed`,
      400,
      targetOrigin,
      isPopup,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return renderPopupResult(
      {
        type: 'oauth:error',
        provider,
        context,
        message: error.message,
      },
      `${targetOrigin}/login?error=auth_callback_failed`,
      400,
      targetOrigin,
      isPopup,
    );
  }

  if (data?.user) await restoreAccountLocale(data.user.user_metadata);

  return renderPopupResult(
    {
      type: 'oauth:success',
      provider,
      context,
      accountId: null,
    },
    `${targetOrigin}/dashboard`,
    200,
    targetOrigin,
    isPopup,
  );
}
