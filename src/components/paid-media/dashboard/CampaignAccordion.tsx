"use client";

import * as React from "react";
import { ReloadIcon } from "@radix-ui/react-icons";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AdSetTable, type AdSet, type AdSetAdsLoadState } from "./AdSetTable";
import { PerformanceDetails, type PaidMetricsComparison, type PaidMetricsTrendPoint } from "./PerformanceDetails";

type Campaign = {
  id: string;
  name: string;
  status: string;
  objective?: string;
  dailyBudget?: string;
  lifetimeBudget?: string;
  metrics?: {
    spend: number;
    roas: number;
    ctr: number;
    cpc: number;
    cpa: number;
    impressions: number;
    clicks: number;
  };
  comparison?: PaidMetricsComparison;
  trends?: PaidMetricsTrendPoint[];
};

type CampaignAccordionProps = {
  campaigns: Campaign[];
  brandId: string;
  accountId: string;
  timeRange: { preset: string };
  resolution: "daily" | "hourly";
  activeOnly?: boolean;
  dcoManagedCampaignIds?: string[];
  onSelectedCampaignChange?: (campaignId: string | undefined) => void;
};

type AdSetLoadState = {
  [campaignId: string]: {
    status: "idle" | "loading" | "success" | "error";
    adSets: AdSet[];
    errorMessage?: string;
  };
};

const META_RATE_LIMIT_COOLDOWN_MS = 60000;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function getStatusColor(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return "default";
    case "PAUSED":
      return "secondary";
    case "ARCHIVED":
    case "DELETED":
      return "destructive";
    default:
      return "outline";
  }
}

function getCampaignSeverityScore(campaign: Campaign): number {
  if (!campaign.comparison) return 0;

  return Object.values(campaign.comparison).reduce((max, item) => {
    const score = Math.abs(item.percentageChange);
    return score > max ? score : max;
  }, 0);
}

function isMetaRateLimitMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("user request limit reached") ||
    normalized.includes("code 17") ||
    normalized.includes("error_subcode: 2446079") ||
    normalized.includes("2446079")
  );
}

async function extractInvokeErrorMessage(error: unknown): Promise<string> {
  if (!(error instanceof Error)) {
    return "Edge function request failed";
  }

  const baseMessage = error.message;
  const maybeContext = (error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }).context;
  if (!maybeContext) {
    return baseMessage;
  }

  try {
    if (typeof maybeContext.json === "function") {
      const payload = (await maybeContext.json()) as { error?: string };
      if (payload?.error) {
        return payload.error;
      }
    }
  } catch {
    // Ignore and fallback.
  }

  try {
    if (typeof maybeContext.text === "function") {
      const text = await maybeContext.text();
      if (text) {
        return text;
      }
    }
  } catch {
    // Ignore and return base message.
  }

  return baseMessage;
}

export function CampaignAccordion({
  campaigns,
  brandId,
  accountId,
  timeRange,
  resolution,
  activeOnly = false,
  dcoManagedCampaignIds = [],
  onSelectedCampaignChange,
}: CampaignAccordionProps) {
  const [adSetState, setAdSetState] = React.useState<AdSetLoadState>({});
  const [adStateByAdSet, setAdStateByAdSet] = React.useState<Record<string, AdSetAdsLoadState>>({});
  const [openCampaignId, setOpenCampaignId] = React.useState<string | undefined>();
  const rateLimitedUntilRef = React.useRef<number>(0);

  const filteredCampaigns = React.useMemo(() => {
    const dcoManagedIdSet = new Set(dcoManagedCampaignIds);
    const candidates = campaigns.filter((campaign) => {
      if (activeOnly && campaign.status.toUpperCase() !== "ACTIVE") {
        return false;
      }

      if (resolution === "hourly" && !dcoManagedIdSet.has(campaign.id)) {
        return false;
      }

      return true;
    });

    return candidates.sort((left, right) => {
      const severityDiff = getCampaignSeverityScore(right) - getCampaignSeverityScore(left);
      if (severityDiff !== 0) {
        return severityDiff;
      }

      const rightSpend = right.metrics?.spend ?? 0;
      const leftSpend = left.metrics?.spend ?? 0;
      return rightSpend - leftSpend;
    });
  }, [activeOnly, campaigns, dcoManagedCampaignIds, resolution]);

  React.useEffect(() => {
    setAdSetState({});
    setAdStateByAdSet({});
  }, [accountId, timeRange.preset]);

  const loadAdSets = React.useCallback(
    async (campaignId: string) => {
      if (adSetState[campaignId]?.status === "loading" || adSetState[campaignId]?.status === "success") {
        return;
      }

      if (Date.now() < rateLimitedUntilRef.current) {
        const secondsLeft = Math.ceil((rateLimitedUntilRef.current - Date.now()) / 1000);
        setAdSetState((prev) => ({
          ...prev,
          [campaignId]: {
            status: "error",
            adSets: prev[campaignId]?.adSets ?? [],
            errorMessage: `Meta API rate limit active. Retry in ~${secondsLeft}s.`,
          },
        }));
        return;
      }

      setAdSetState((prev) => ({
        ...prev,
        [campaignId]: { status: "loading", adSets: [] },
      }));

      try {
        const supabase = createSupabaseBrowserClient();

        const { data, error: fetchError } = await supabase.functions.invoke(
          `fetch-meta-adsets?brandId=${brandId}&adAccountId=${accountId}&campaignId=${campaignId}`,
          {
            method: "POST",
            body: {
              brandId,
              adAccountId: accountId,
              campaignId,
            },
          }
        );

        if (fetchError) {
          const message = await extractInvokeErrorMessage(fetchError);
          throw new Error(`Failed to fetch ad sets: ${message}`);
        }

        const rawAdSets = data?.adsets ?? [];

        const adSetsWithMetrics = await Promise.all(
          rawAdSets.map(async (adSet: AdSet) => {
            try {
              const metricsResponse = await fetch("/api/paid-metrics", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  platform: "meta",
                  brandId,
                  accountId,
                  adsetId: adSet.id,
                  range: timeRange,
                }),
              });

              if (metricsResponse.ok) {
                const metricsData = await metricsResponse.json();
                return {
                  ...adSet,
                  metrics: metricsData.metrics,
                  comparison: metricsData.comparison,
                  trends: metricsData.trends,
                };
              }
            } catch (err) {
              console.error(`Failed to load metrics for ad set ${adSet.id}`, err);
            }

            return adSet;
          })
        );

        setAdSetState((prev) => ({
          ...prev,
          [campaignId]: { status: "success", adSets: adSetsWithMetrics },
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (isMetaRateLimitMessage(message)) {
          rateLimitedUntilRef.current = Date.now() + META_RATE_LIMIT_COOLDOWN_MS;
        }

        console.error("Failed to load ad sets:", error);
        setAdSetState((prev) => ({
          ...prev,
          [campaignId]: {
            status: "error",
            adSets: [],
            errorMessage: message,
          },
        }));
      }
    },
    [accountId, adSetState, brandId, timeRange]
  );

  React.useEffect(() => {
    if (filteredCampaigns.length === 0) {
      setOpenCampaignId(undefined);
      onSelectedCampaignChange?.(undefined);
      return;
    }

    const isOpenCampaignValid = openCampaignId
      ? filteredCampaigns.some((campaign) => campaign.id === openCampaignId)
      : false;

    if (!isOpenCampaignValid) {
      const nextCampaignId = filteredCampaigns[0].id;
      setOpenCampaignId(nextCampaignId);
      onSelectedCampaignChange?.(nextCampaignId);
      void loadAdSets(nextCampaignId);
      return;
    }

    onSelectedCampaignChange?.(openCampaignId);
  }, [filteredCampaigns, loadAdSets, onSelectedCampaignChange, openCampaignId]);

  const loadAdsForAdSet = React.useCallback(
    async (adSetId: string) => {
      let shouldLoad = true;

      setAdStateByAdSet((prev) => {
        const currentState = prev[adSetId];

        if (currentState?.status === "loading" || currentState?.status === "success") {
          shouldLoad = false;
          return prev;
        }

        return {
          ...prev,
          [adSetId]: { status: "loading", ads: [] },
        };
      });

      if (!shouldLoad) {
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();

        const { data, error: fetchError } = await supabase.functions.invoke(
          `fetch-meta-ads?brandId=${brandId}&adAccountId=${accountId}&adSetId=${adSetId}&datePreset=${timeRange.preset}`,
          {
            method: "POST",
            body: {
              brandId,
              adAccountId: accountId,
              adSetId,
              datePreset: timeRange.preset,
            },
          }
        );

        if (fetchError) {
          throw new Error(`Failed to fetch ads: ${fetchError.message}`);
        }

        setAdStateByAdSet((prev) => ({
          ...prev,
          [adSetId]: {
            status: "success",
            ads: data?.ads ?? [],
          },
        }));
      } catch (error) {
        console.error("Failed to load ads for ad set:", error);
        setAdStateByAdSet((prev) => ({
          ...prev,
          [adSetId]: {
            status: "error",
            ads: [],
            errorMessage: error instanceof Error ? error.message : "Failed to load ads",
          },
        }));
      }
    },
    [accountId, brandId, timeRange.preset]
  );

  if (filteredCampaigns.length === 0) {
    return <div className="py-8 text-center text-muted-foreground">No campaigns found.</div>;
  }

  return (
    <Accordion
      key={`${accountId}-${timeRange.preset}-${resolution}-${activeOnly ? "active" : "all"}`}
      type="single"
      value={openCampaignId ?? ""}
      collapsible
      onValueChange={(value) => {
        const nextValue = value || undefined;
        setOpenCampaignId(nextValue);
        onSelectedCampaignChange?.(nextValue);

        if (nextValue) {
          void loadAdSets(nextValue);
        }
      }}
      className="w-full"
    >
      {filteredCampaigns.map((campaign) => {
        const state = adSetState[campaign.id] || { status: "idle", adSets: [] };

        return (
          <AccordionItem key={campaign.id} value={campaign.id}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex w-full items-center justify-between pr-4">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{campaign.name}</span>
                  <Badge variant={getStatusColor(campaign.status)}>{campaign.status}</Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {campaign.metrics ? (
                    <>
                      <span>Spend: {formatCurrency(campaign.metrics.spend)}</span>
                      <span>ROAS: {campaign.metrics.roas.toFixed(2)}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-2 pt-4">
                <PerformanceDetails
                  comparison={campaign.comparison}
                  trends={campaign.trends}
                  className="mb-4"
                />
                {state.status === "loading" ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
                    Loading ad sets...
                  </div>
                ) : null}
                {state.status === "error" ? (
                  <div className="py-8 text-center text-destructive">{state.errorMessage || "Failed to load ad sets"}</div>
                ) : null}
                {state.status === "success" ? (
                  <AdSetTable
                    adSets={state.adSets}
                    adsByAdSet={adStateByAdSet}
                    onAdSetToggle={(adSetId, expanded) => {
                      if (expanded) {
                        void loadAdsForAdSet(adSetId);
                      }
                    }}
                  />
                ) : null}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
