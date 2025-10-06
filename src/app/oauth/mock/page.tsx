"use client";

import { useEffect } from "react";

export default function MockOAuthPopup() {
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        window.opener?.postMessage({ type: "oauth:success", provider: "mock", accountId: "acct_123" }, window.location.origin);
      } catch {}
      window.close();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Connecting…</div>
        <div style={{ color: "#666" }}>This window will close automatically.</div>
      </div>
    </div>
  );
}


