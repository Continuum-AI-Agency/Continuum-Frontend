'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { useEffect, useMemo } from 'react';
import { publishOAuthCompletion } from '@/lib/popup';

type PopupSuccessPayload = {
  type: 'oauth:success';
  provider: string | null;
  context: string;
  accountId: string | null;
  state?: string | null;
  returnTo?: string | null;
  warning?: string | null;
};

// A successful OAuth connect can still carry a non-fatal warning (e.g. the token
// was stored but no Google Ads accounts could be enumerated). Surface that rather
// than reporting a clean "connected".
function successMessage(reason?: string | null): string {
  if (reason === 'no_ads_accounts' || reason === 'ads_enrichment_failed') {
    return 'Connected, but no Google Ads accounts were found.';
  }
  if (reason === 'meta_partial_sync') {
    return "Connected, but some Meta accounts may be missing. We'll keep trying to load them.";
  }
  return 'Integration connected.';
}

type PopupErrorPayload = {
  type: 'oauth:error';
  provider: string | null;
  context: string;
  message: string;
  state?: string | null;
};

function buildFallbackRedirect(origin: string, status: string, reason?: string | null): string {
  // Integrations now live inside Settings; the dedicated /integrations page is
  // gone. This fallback only fires when the OAuth popup has no opener to
  // postMessage back to.
  const url = new URL('/settings', origin);
  url.searchParams.set('section', 'integrations');
  url.searchParams.set('status', status);
  if (reason) {
    url.searchParams.set('reason', reason);
  }
  return url.toString();
}

export default function IntegrationCallbackPage() {
  const params = useSearchParams();
  const router = useRouter();

  const payload = useMemo(() => {
    const provider = params.get('provider');
    const context = params.get('context') ?? 'onboarding';
    const state = params.get('state');
    const status = params.get('status');
    const reason = params.get('reason');
    const returnTo = params.get('return_to');

    if (status === 'connection_successful') {
      const successPayload: PopupSuccessPayload = {
        type: 'oauth:success',
        provider,
        context,
        accountId: null,
        state,
        returnTo,
        warning: reason,
      };
      return { payload: successPayload, status: true, reason };
    }

    const errorPayload: PopupErrorPayload = {
      type: 'oauth:error',
      provider,
      context,
      message: reason ?? 'Connection failed.',
      state,
    };
    return { payload: errorPayload, status: false, reason };
  }, [params]);

  useEffect(() => {
    const origin = window.location.origin;
    const provider = (payload.payload as { provider?: string | null }).provider ?? null;
    const context = (payload.payload as { context?: string }).context ?? null;

    if (payload.status) {
      posthog.capture('integration_connected', {
        provider,
        context,
        warning: payload.reason ?? null,
      });
    } else {
      posthog.capture('integration_connection_failed', {
        provider,
        context,
        reason: payload.reason ?? null,
      });
    }

    const fallback = buildFallbackRedirect(
      origin,
      payload.status ? 'connection_successful' : 'connection_error',
      payload.reason,
    );
    if (publishOAuthCompletion(payload.payload, origin)) {
      window.close();
      return;
    }
    router.replace(fallback);
  }, [payload, router]);

  const isSuccess = payload.status;
  const message = isSuccess ? successMessage(payload.reason) : 'Integration failed.';
  return (
    <div
      style={{
        display: 'grid',
        minHeight: '100vh',
        placeItems: 'center',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <p>{message}</p>
        <p>You can close this window.</p>
      </div>
    </div>
  );
}
