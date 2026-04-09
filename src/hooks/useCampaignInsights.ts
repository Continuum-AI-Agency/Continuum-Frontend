"use client";

import * as React from "react";

import type {
  AccountInsightsResponse,
  ComputedInsight,
} from "@/lib/paid-media/account-insights.types";
import type { PaidMediaTimeRange } from "@/components/paid-media/dashboard/timeRange";

type UseCampaignInsightsParams = {
  brandId: string;
  adAccountId: string | null;
  campaignId: string | null;
  campaignName?: string;
  campaignObjective?: string;
  timeRange: PaidMediaTimeRange;
  enabled?: boolean;
};

type UseCampaignInsightsReturn = {
  insights: ComputedInsight[];
  generatedAt: string | null;
  expiresAt: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

function buildRequestBody(params: UseCampaignInsightsParams) {
  const range =
    params.timeRange.preset === "custom"
      ? {
          preset: "custom" as const,
          since: params.timeRange.since,
          until: params.timeRange.until,
        }
      : { preset: params.timeRange.preset };

  return {
    brandId: params.brandId,
    adAccountId: params.adAccountId,
    campaignId: params.campaignId,
    campaignName: params.campaignName,
    campaignObjective: params.campaignObjective,
    range,
  };
}

export function useCampaignInsights(
  params: UseCampaignInsightsParams
): UseCampaignInsightsReturn {
  const { brandId, adAccountId, campaignId, timeRange, enabled = true } = params;

  const [data, setData] = React.useState<AccountInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshTick, setRefreshTick] = React.useState(0);

  const requestIdRef = React.useRef(0);

  const timeRangeKey =
    timeRange.preset === "custom"
      ? `custom:${timeRange.since}:${timeRange.until}`
      : timeRange.preset;

  React.useEffect(() => {
    if (!enabled || !adAccountId || !campaignId) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    const controller = new AbortController();

    fetch("/api/paid-media/campaign-insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildRequestBody({ brandId, adAccountId, campaignId, timeRange })
      ),
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
      .then((resp: AccountInsightsResponse) => {
        if (requestId !== requestIdRef.current) return;
        setData(resp);
        setError(null);
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to load campaign insights"
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
  }, [brandId, adAccountId, campaignId, timeRangeKey, enabled, refreshTick]);

  const refresh = React.useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  return {
    insights: data?.insights ?? [],
    generatedAt: data?.generated_at ?? null,
    expiresAt: data?.expires_at ?? null,
    isLoading,
    error,
    refresh,
  };
}
