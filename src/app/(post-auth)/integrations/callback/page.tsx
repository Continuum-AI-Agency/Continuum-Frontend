"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type PopupSuccessPayload = {
  type: "oauth:success";
  provider: string | null;
  context: string;
  accountId: string | null;
  state?: string | null;
};

type PopupErrorPayload = {
  type: "oauth:error";
  provider: string | null;
  context: string;
  message: string;
  state?: string | null;
};

function buildFallbackRedirect(origin: string, status: string, reason?: string | null): string {
  const url = new URL("/integrations", origin);
  url.searchParams.set("status", status);
  if (reason) {
    url.searchParams.set("reason", reason);
  }
  return url.toString();
}

export default function IntegrationCallbackPage() {
  const params = useSearchParams();
  const router = useRouter();

  const payload = useMemo(() => {
    const provider = params.get("provider");
    const context = params.get("context") ?? "onboarding";
    const state = params.get("state");
    const status = params.get("status");
    const reason = params.get("reason");

    if (status === "connection_successful") {
      const successPayload: PopupSuccessPayload = {
        type: "oauth:success",
        provider,
        context,
        accountId: null,
        state,
      };
      return { payload: successPayload, status: true, reason: null };
    }

    const errorPayload: PopupErrorPayload = {
      type: "oauth:error",
      provider,
      context,
      message: reason ?? "Connection failed.",
      state,
    };
    return { payload: errorPayload, status: false, reason };
  }, [params]);

  useEffect(() => {
    const origin = window.location.origin;
    const fallback = buildFallbackRedirect(
      origin,
      payload.status ? "connection_successful" : "connection_error",
      payload.reason
    );
    if (window.opener) {
      try {
        window.opener.postMessage(payload.payload, origin);
        window.close();
        return;
      } catch {
        // fall through to fallback navigation
      }
    }
    router.replace(fallback);
  }, [payload, router]);

  const isSuccess = payload.status;
  return (
    <div style={{ display: "grid", minHeight: "100vh", placeItems: "center", fontFamily: "sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <p>{isSuccess ? "Integration connected." : "Integration failed."}</p>
        <p>You can close this window.</p>
      </div>
    </div>
  );
}
