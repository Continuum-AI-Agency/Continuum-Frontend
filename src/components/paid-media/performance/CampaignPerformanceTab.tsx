"use client";

import * as React from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetPacingWidget } from "@/components/paid-media/budget-pacing/BudgetPacingWidget";
import { CampaignPerformanceMatrix } from "./CampaignPerformanceMatrix";
import { CampaignInsightEvidencePanel } from "./CampaignInsightEvidencePanel";
import {
  buildCampaignInsightDataPoints,
  buildGeneratedCampaignInsights,
} from "@/lib/paid-media/insight-data-points";
import {
  makeBudgetPacingKey,
  makeCampaignPerformanceKey,
  usePaidMediaPerformanceStore,
} from "@/lib/paid-media/performance-store";
import type { PaidMetricsRange } from "@/lib/schemas/paidMetrics";
import type { CampaignPerformanceMetricKey } from "@/lib/paid-media/performance-types";
import { cn } from "@/lib/utils";

type CampaignPerformanceTabProps = {
  brandId: string;
  adAccountId: string | null;
};

type RangePreset = "last_7d" | "last_14d" | "last_30d";

const RANGE_OPTIONS: Array<{ value: RangePreset; label: string }> = [
  { value: "last_7d", label: "7D" },
  { value: "last_14d", label: "14D" },
  { value: "last_30d", label: "30D" },
];

const EMPTY_CAMPAIGNS: [] = [];

function toRange(preset: RangePreset): PaidMetricsRange {
  return { preset };
}

export function CampaignPerformanceTab({ brandId, adAccountId }: CampaignPerformanceTabProps) {
  const [rangePreset, setRangePreset] = React.useState<RangePreset>("last_14d");
  const [selectedMetric, setSelectedMetric] = React.useState<CampaignPerformanceMetricKey>("roas");
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string | null>(null);
  const range = React.useMemo(() => toRange(rangePreset), [rangePreset]);
  const campaignKey = React.useMemo(() => {
    if (!adAccountId) return null;
    return makeCampaignPerformanceKey({
      brandId,
      adAccountId,
      platform: "meta",
      range,
    });
  }, [adAccountId, brandId, range]);
  const budgetKey = React.useMemo(() => {
    if (!adAccountId) return null;
    return makeBudgetPacingKey({ brandId, adAccountId });
  }, [adAccountId, brandId]);

  const { campaignEntry, budgetEntry, loadCampaignPerformance } = usePaidMediaPerformanceStore(
    useShallow((state) => ({
      campaignEntry: campaignKey ? state.campaigns[campaignKey] : undefined,
      budgetEntry: budgetKey ? state.budgetPacing[budgetKey] : undefined,
      loadCampaignPerformance: state.loadCampaignPerformance,
    }))
  );

  const load = React.useCallback(
    (force = false) => {
      if (!adAccountId) return;
      void loadCampaignPerformance(
        {
          brandId,
          adAccountId,
          platform: "meta",
          range,
        },
        { force }
      );
    },
    [adAccountId, brandId, loadCampaignPerformance, range]
  );

  React.useEffect(() => {
    load(false);
  }, [load]);

  const campaigns = campaignEntry?.data ?? EMPTY_CAMPAIGNS;
  const dataPoints = React.useMemo(
    () =>
      buildCampaignInsightDataPoints({
        campaigns,
        budgetPacing: budgetEntry?.data,
        evidenceWindow: rangePreset,
      }),
    [budgetEntry?.data, campaigns, rangePreset]
  );
  const insights = React.useMemo(() => buildGeneratedCampaignInsights(dataPoints), [dataPoints]);
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId);

  if (!adAccountId) {
    return (
      <div className="grid h-full min-h-[24rem] place-items-center rounded-lg border border-dashed border-border/70 bg-muted/15 p-6 text-center text-sm text-muted-foreground">
        Select an ad account to open campaign performance.
      </div>
    );
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border/70 bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/10 px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">Performance</h2>
          <p className="text-[11px] text-muted-foreground">
            Campaign evidence, generated insight inputs, and budget pacing in one surface.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-md border border-border/70 bg-background p-0.5">
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={rangePreset === option.value ? "secondary" : "ghost"}
                className="h-8 px-2.5 text-xs"
                onClick={() => setRangePreset(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            className="h-8 w-8"
            disabled={campaignEntry?.status === "loading"}
            onClick={() => load(true)}
            aria-label="Refresh performance"
          >
            <ReloadIcon className={cn(campaignEntry?.status === "loading" && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto p-2">
        {campaignEntry?.status === "error" ? (
          <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {campaignEntry.error}
          </div>
        ) : null}

        {campaignEntry?.status === "loading" && campaigns.length === 0 ? (
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Skeleton className="h-[30rem] rounded-lg" />
            <Skeleton className="h-[30rem] rounded-lg" />
          </div>
        ) : (
          <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_340px]">
            <CampaignPerformanceMatrix
              campaigns={campaigns}
              metric={selectedMetric}
              dataPoints={dataPoints}
              onMetricChange={setSelectedMetric}
              onCampaignSelect={setSelectedCampaignId}
            />
            <CampaignInsightEvidencePanel insights={insights} />
          </div>
        )}

        {selectedCampaign ? (
          <div className="mt-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
            <span className="font-medium">Selected:</span>{" "}
            <span className="text-muted-foreground">{selectedCampaign.name}</span>
          </div>
        ) : null}

        <div className="mt-2 h-[min(76svh,760px)] min-h-[34rem] overflow-hidden rounded-lg border border-border/70 bg-card">
          <BudgetPacingWidget
            brandId={brandId}
            selectedAccountId={adAccountId}
            selectedMetric={selectedMetric}
          />
        </div>
      </div>
    </section>
  );
}
