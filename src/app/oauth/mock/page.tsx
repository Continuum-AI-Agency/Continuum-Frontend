"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

export default function MockOAuthPopup() {
  const params = useSearchParams();
  const provider = useMemo(() => params.get("provider") ?? "mock", [params]);
  const context = useMemo(() => params.get("context") ?? "onboarding", [params]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        window.opener?.postMessage(
          {
            type: "oauth:success",
            provider,
            context,
            accountId: `acct_${provider}`,
          },
          window.location.origin
        );
      } catch {
        // ignore postMessage errors and allow the popup to close
      }
      window.close();
    }, 1000);
    return () => clearTimeout(timer);
  }, [provider, context]);

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Connecting {provider}…</div>
        <div style={{ color: "#666" }}>This window will close automatically.</div>
      </div>
    </div>
  );
}

