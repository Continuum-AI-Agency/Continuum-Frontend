"use client";

import * as React from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import { GaugeCircleIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetPacingWidget } from "@/components/paid-media/budget-pacing/BudgetPacingWidget";
import { CampaignPerformanceMatrix } from "./CampaignPerformanceMatrix";
import { CampaignInsightEvidencePanel } from "./CampaignInsightEvidencePanel";
import { CampaignMetricHeatmap } from "./CampaignMetricHeatmap";
import { HeatmapLegend } from "./HeatmapLegend";
import {
  buildCampaignInsightDataPoints,
  buildGeneratedCampaignInsights,
} from "@/lib/paid-media/insight-data-points";
import { persistCampaignInsightsSnapshot } from "@/app/_actions/paidMediaInsights";
import {
  makeBudgetPacingKey,
  makeCampaignPerformanceKey,
  usePaidMediaPerformanceStore,
} from "@/lib/paid-media/performance-store";
import type { PaidMetricsRange } from "@/lib/schemas/paidMetrics";
import type { CampaignPerformanceMetricKey, PaidMediaPlatform } from "@/lib/paid-media/performance-types";
import { cn } from "@/lib/utils";

type CampaignPerformanceTabProps = {
  brandId: string;
  adAccountId: string | null;
  platform: PaidMediaPlatform;
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

export function CampaignPerformanceTab({ brandId, adAccountId, platform }: CampaignPerformanceTabProps) {
  const [rangePreset, setRangePreset] = React.useState<RangePreset>("last_14d");
  const [selectedMetric, setSelectedMetric] = React.useState<CampaignPerformanceMetricKey>("roas");
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string | null>(null);
  const range = React.useMemo(() => toRange(rangePreset), [rangePreset]);
  const campaignKey = React.useMemo(() => {
    if (!adAccountId) return null;
    return makeCampaignPerformanceKey({
      brandId,
      adAccountId,
      platform,
      range,
    });
  }, [adAccountId, brandId, platform, range]);
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
          platform,
          range,
        },
        { force }
      );
    },
    [adAccountId, brandId, loadCampaignPerformance, platform, range]
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

  const lastPersistedHashRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!adAccountId || insights.length === 0) return;
    if (campaignEntry?.status !== "success") return;

    const hash = `${adAccountId}:${rangePreset}:${insights
      .map((insight) => insight.id)
      .toSorted()
      .join(",")}`;
    if (hash === lastPersistedHashRef.current) return;

    const handle = window.setTimeout(() => {
      lastPersistedHashRef.current = hash;
      void persistCampaignInsightsSnapshot({
        brandId,
        adAccountId,
        platform,
        rangePreset,
        peerSetSize: campaigns.length,
        insights,
      }).then((result) => {
        if (!result.ok) {
          console.warn("[paid-media] Failed to persist insights snapshot:", result.error);
          lastPersistedHashRef.current = null;
        }
      });
    }, 2000);

    return () => window.clearTimeout(handle);
  }, [adAccountId, brandId, campaignEntry?.status, campaigns.length, insights, platform, rangePreset]);

  if (!adAccountId) {
    return (
      <div className="grid h-full min-h-[24rem] place-items-center rounded-lg border border-dashed border-border/70 bg-muted/10 p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground">
            <GaugeCircleIcon className="h-5 w-5" />
          </div>
          <h2 className="mt-3 text-sm font-semibold tracking-tight">Pick an ad account</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Performance loads campaign-level metrics, percentile heatmaps, and budget pacing for the
            selected account. Choose one from the selector above to begin.
          </p>
        </div>
      </div>
    );
  }

  const isLoadingFresh = campaignEntry?.status === "loading" && campaigns.length === 0;
  const hasCampaigns = campaigns.length > 0;

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border/70 bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/10 px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight">Performance</h2>
          <p className="text-xs text-muted-foreground">
            Heatmap · matrix · insights · pacing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-md border border-border/70 bg-background p-0.5">
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={rangePreset === option.value ? "secondary" : "ghost"}
                className={cn(
                  "h-7 px-2.5 font-mono text-xs tracking-tight",
                  rangePreset === option.value && "shadow-sm"
                )}
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
            className="h-7 w-7"
            disabled={campaignEntry?.status === "loading"}
            onClick={() => load(true)}
            aria-label="Refresh performance"
          >
            <ReloadIcon className={cn(campaignEntry?.status === "loading" && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="min-h-0 space-y-2 overflow-y-auto p-2">
        {campaignEntry?.status === "error" ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {campaignEntry.error}
          </div>
        ) : null}

        {isLoadingFresh ? (
          <>
            <Skeleton className="h-[14rem] rounded-lg" />
            <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_340px]">
              <Skeleton className="h-[26rem] rounded-lg" />
              <Skeleton className="h-[26rem] rounded-lg" />
            </div>
          </>
        ) : (
          <>
            {hasCampaigns ? (
              <div className="space-y-2">
                <CampaignMetricHeatmap
                  brandId={brandId}
                  campaigns={campaigns}
                  selectedMetric={selectedMetric}
                  selectedCampaignId={selectedCampaignId}
                  onMetricChange={setSelectedMetric}
                  onCampaignSelect={setSelectedCampaignId}
                />
                <HeatmapLegend className="px-1" />
              </div>
            ) : null}
            <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_340px]">
              <CampaignPerformanceMatrix
                campaigns={campaigns}
                metric={selectedMetric}
                dataPoints={dataPoints}
                selectedCampaignId={selectedCampaignId}
                onMetricChange={setSelectedMetric}
                onCampaignSelect={setSelectedCampaignId}
              />
              <CampaignInsightEvidencePanel insights={insights} />
            </div>
          </>
        )}

        {selectedCampaign ? (
          <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/15 px-3 py-1.5 text-xs">
            <span className="font-mono uppercase tracking-[0.08em] text-muted-foreground">
              Selected
            </span>
            <span className="truncate font-medium">{selectedCampaign.name}</span>
            <button
              type="button"
              onClick={() => setSelectedCampaignId(null)}
              className="ml-auto text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear
            </button>
          </div>
        ) : null}

        <div className="h-[min(76svh,760px)] min-h-[34rem] overflow-hidden rounded-lg border border-border/70 bg-card">
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
