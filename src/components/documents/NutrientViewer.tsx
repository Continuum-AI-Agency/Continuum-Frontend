"use client";

import { useEffect, useRef, useState } from "react";

type NutrientViewerProps = {
  documentUrl: string;
  className?: string;
};

type NutrientModule = {
  load: (config: {
    container: HTMLElement;
    document: string;
    baseUrl?: string;
    licenseKey?: string;
  }) => Promise<unknown>;
  unload: (container: HTMLElement) => boolean;
};

export function NutrientViewer({ documentUrl, className }: NutrientViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let nutrient: NutrientModule | null = null;

    (async () => {
      try {
        const mod = (await import("@nutrient-sdk/viewer")) as unknown as {
          default?: NutrientModule;
        } & NutrientModule;
        nutrient = (mod.default ?? mod) as NutrientModule;
        if (cancelled || !container) return;
        nutrient.unload(container);
        await nutrient.load({
          container,
          document: documentUrl,
          baseUrl: `${window.location.origin}/nutrient-viewer/`,
          licenseKey: process.env.NEXT_PUBLIC_NUTRIENT_LICENSE_KEY || undefined,
        });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      }
    })();

    return () => {
      cancelled = true;
      if (nutrient && container) {
        try {
          nutrient.unload(container);
        } catch {
          // unload after unmount is best-effort
        }
      }
    };
  }, [documentUrl]);

  if (error) {
    return (
      <div className={className} role="alert">
        <p className="p-4 text-sm text-rose-600">
          Failed to load preview: {error}
        </p>
      </div>
    );
  }

  return <div ref={containerRef} className={className} style={{ height: "100%", width: "100%" }} />;
}
