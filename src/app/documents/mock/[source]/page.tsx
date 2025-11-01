"use client";

import { useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";

export default function MockDocumentConnector() {
  const params = useParams<{ source: string }>();
  const search = useSearchParams();

  useEffect(() => {
    const timer = setTimeout(() => {
      const source = params?.source ?? "external";
      try {
        window.opener?.postMessage(
          {
            type: "documents:linked",
            source,
            name: search.get("name") ?? `${source} brand kit`,
            externalUrl: search.get("url") ?? `https://${source}.example.com/doc/${Math.random().toString(36).slice(2)}`,
          },
          window.location.origin
        );
      } catch {
        // ignore
      }
      window.close();
    }, 800);

    return () => clearTimeout(timer);
  }, [params, search]);

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Connecting {params?.source ?? "integration"}…</div>
        <div style={{ color: "#666" }}>This window will close automatically.</div>
      </div>
    </div>
  );
}
