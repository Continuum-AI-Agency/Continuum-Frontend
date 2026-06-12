"use client";

import * as React from "react";

import type {
  OrganicInsightsResponse,
  OrganicComputedInsight,
} from "@/lib/organic/organic-insights.types";
import type { OrganicAwarenessReportPayload } from "@continuum/contracts";
import type { OrganicDateRangePreset } from "@/lib/schemas/organicMetrics";

type UseOrganicInsightsParams = {
  brandId: string;
  integrationAccountId: string | null;
  platform: "instagram" | "facebook" | "tiktok" | "youtube";
  rangePreset: OrganicDateRangePreset;
  enabled?: boolean;
};

type UseOrganicInsightsReturn = {
  insights: OrganicComputedInsight[];
  awareness: OrganicAwarenessReportPayload | null;
  generatedAt: string | null;
  expiresAt: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

export function useOrganicInsights(
  params: UseOrganicInsightsParams
): UseOrganicInsightsReturn {
  const { brandId, integrationAccountId, platform, rangePreset, enabled = true } = params;

  const [data, setData] = React.useState<OrganicInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshTick, setRefreshTick] = React.useState(0);

  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    if (!enabled || !integrationAccountId) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    const controller = new AbortController();

    fetch("/api/organic/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId,
        integrationAccountId,
        platform,
        range: { preset: rangePreset },
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            (body as Record<string, string>).error ??
              `Request failed with status ${response.status}`
          );
        }
        return response.json();
      })
      .then((resp: OrganicInsightsResponse) => {
        if (requestId !== requestIdRef.current) return;
        setData(resp);
        setError(null);
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to load organic insights"
        );
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, integrationAccountId, platform, rangePreset, enabled, refreshTick]);

  const refresh = React.useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  return {
    insights: data?.insights ?? [],
    awareness: data?.awareness ?? null,
    generatedAt: data?.generated_at ?? null,
    expiresAt: data?.expires_at ?? null,
    isLoading,
    error,
    refresh,
  };
}
