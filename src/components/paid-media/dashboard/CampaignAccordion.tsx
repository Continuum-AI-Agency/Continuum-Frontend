"use client";

import * as React from "react";
import { ChevronDownIcon, ReloadIcon } from "@radix-ui/react-icons";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { AdSetTable, type AdSet } from "./AdSetTable";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PaidMetricsResponse } from "@/lib/schemas/paidMetrics";

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
  onAdSetSelect?: (campaignId: string, adSetId: string) => void;
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

export function CampaignAccordion({
  campaigns,
  brandId,
  accountId,
  timeRange,
  onAdSetSelect,
}: CampaignAccordionProps) {
  const [adSetState, setAdSetState] = React.useState<AdSetLoadState>({});
  const [expandedCampaigns, setExpandedCampaigns] = React.useState<Set<string>>(new Set());

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

        const rawAdSets = data.adsets || [];

        const adSetsWithMetrics = await Promise.all(
          rawAdSets.map(async (adSet: any) => {
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

              if (!metricsError && metricsData) {
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
    [brandId, accountId, timeRange, adSetState]
  );

  const handleValueChange = React.useCallback(
    (value: string[]) => {
      const newExpanded = new Set(value);
      const added = value.find((v) => !expandedCampaigns.has(v));

      if (added) {
        loadAdSets(added);
      }

      setExpandedCampaigns(newExpanded);
    },
    [expandedCampaigns, loadAdSets]
  );

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No campaigns found.
      </div>
    );
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
              <div className="flex items-center justify-between w-full pr-4">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{campaign.name}</span>
                  <Badge variant={getStatusColor(campaign.status)}>
                    {campaign.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {campaign.metrics && (
                    <>
                      <span>Spend: {formatCurrency(campaign.metrics.spend)}</span>
                      <span>ROAS: {campaign.metrics.roas.toFixed(2)}</span>
                    </>
                  )}
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-4 px-2">
                {state.status === "loading" && (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
                    Loading ad sets...
                  </div>
                )}
                {state.status === "error" && (
                  <div className="text-center py-8 text-destructive">
                    {state.errorMessage || "Failed to load ad sets"}
                  </div>
                )}
                {state.status === "success" && (
                  <AdSetTable
                    adSets={state.adSets}
                    campaignId={campaign.id}
                    onAdSetSelect={(adSetId) => onAdSetSelect?.(campaign.id, adSetId)}
                  />
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
