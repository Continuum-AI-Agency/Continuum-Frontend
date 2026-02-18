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
    impressions: number;
    clicks: number;
  };
};

type CampaignAccordionProps = {
  campaigns: Campaign[];
  brandId: string;
  accountId: string;
  timeRange: { preset: string };
};

type AdSetLoadState = {
  [campaignId: string]: {
    status: "idle" | "loading" | "success" | "error";
    adSets: AdSet[];
    errorMessage?: string;
  };
};

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

export function CampaignAccordion({ campaigns, brandId, accountId, timeRange }: CampaignAccordionProps) {
  const [adSetState, setAdSetState] = React.useState<AdSetLoadState>({});
  const [adStateByAdSet, setAdStateByAdSet] = React.useState<Record<string, AdSetAdsLoadState>>({});
  const [expandedCampaigns, setExpandedCampaigns] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setAdSetState({});
    setAdStateByAdSet({});
    setExpandedCampaigns(new Set());
  }, [accountId, timeRange.preset]);

  const loadAdSets = React.useCallback(
    async (campaignId: string) => {
      if (adSetState[campaignId]?.status === "loading" || adSetState[campaignId]?.status === "success") {
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
          throw new Error(`Failed to fetch ad sets: ${fetchError.message}`);
        }

        const rawAdSets = data?.adsets ?? [];

        const adSetsWithMetrics = await Promise.all(
          rawAdSets.map(async (adSet: AdSet) => {
            try {
              const { data: metricsData, error: metricsError } = await supabase.functions.invoke(
                `paid-media-metrics?platform=meta&brandId=${brandId}&accountId=${accountId}&adsetId=${adSet.id}`,
                {
                  body: {
                    platform: "meta",
                    brandId,
                    accountId,
                    adsetId: adSet.id,
                    range: timeRange,
                  },
                }
              );

              if (!metricsError && metricsData?.metrics) {
                return {
                  ...adSet,
                  metrics: metricsData.metrics,
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
        console.error("Failed to load ad sets:", error);
        setAdSetState((prev) => ({
          ...prev,
          [campaignId]: {
            status: "error",
            adSets: [],
            errorMessage: error instanceof Error ? error.message : "Unknown error",
          },
        }));
      }
    },
    [accountId, adSetState, brandId, timeRange]
  );

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

  const handleValueChange = React.useCallback(
    (value: string[]) => {
      const newExpanded = new Set(value);
      const added = value.find((item) => !expandedCampaigns.has(item));

      if (added) {
        void loadAdSets(added);
      }

      setExpandedCampaigns(newExpanded);
    },
    [expandedCampaigns, loadAdSets]
  );

  if (campaigns.length === 0) {
    return <div className="py-8 text-center text-muted-foreground">No campaigns found.</div>;
  }

  return (
    <Accordion
      type="multiple"
      value={Array.from(expandedCampaigns)}
      onValueChange={handleValueChange}
      className="w-full"
    >
      {campaigns.map((campaign) => {
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
