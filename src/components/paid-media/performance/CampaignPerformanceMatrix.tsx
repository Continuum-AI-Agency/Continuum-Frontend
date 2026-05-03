"use client";

import * as React from "react";
import { ArrowDownIcon, ArrowUpIcon } from "@radix-ui/react-icons";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  CampaignPerformanceMetricKey,
  CampaignPerformanceRow,
} from "@/lib/paid-media/performance-types";
import type { CampaignInsightDataPoint } from "@/lib/paid-media/insight-data-points";

type CampaignPerformanceMatrixProps = {
  campaigns: CampaignPerformanceRow[];
  metric: CampaignPerformanceMetricKey;
  dataPoints: CampaignInsightDataPoint[];
  onMetricChange: (metric: CampaignPerformanceMetricKey) => void;
  onCampaignSelect?: (campaignId: string) => void;
};

type MatrixMetric = {
  key: CampaignPerformanceMetricKey;
  label: string;
  direction: "higher" | "lower" | "neutral";
};

const MATRIX_METRICS: MatrixMetric[] = [
  { key: "spend", label: "Spend", direction: "neutral" },
  { key: "roas", label: "ROAS", direction: "higher" },
  { key: "ctr", label: "CTR", direction: "higher" },
  { key: "cpc", label: "CPC", direction: "lower" },
  { key: "cpa", label: "CPA", direction: "lower" },
  { key: "impressions", label: "Impr.", direction: "neutral" },
  { key: "clicks", label: "Clicks", direction: "neutral" },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 100000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatMetric(metric: CampaignPerformanceMetricKey, value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (metric === "spend" || metric === "cpc" || metric === "cpa") return formatCurrency(value);
  if (metric === "roas") return value.toFixed(2);
  if (metric === "ctr") return `${value.toFixed(2)}%`;
  return formatNumber(value);
}

function formatDelta(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "No delta";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function percentile(values: number[], value: number): number {
  const sorted = values.filter(Number.isFinite).toSorted((left, right) => left - right);
  if (sorted.length <= 1) return 0.5;
  const index = sorted.findLastIndex((candidate) => candidate <= value);
  return Math.max(0, Math.min(1, index / (sorted.length - 1)));
}

function heatmapColor(metric: MatrixMetric, percentileRank: number): string {
  if (metric.direction === "neutral") {
    const lightness = 96 - percentileRank * 16;
    return `oklch(${lightness}% 0.018 250)`;
  }

  const score = metric.direction === "lower" ? 1 - percentileRank : percentileRank;
  if (score >= 0.72) {
    return `oklch(${94 - score * 12}% 0.075 154)`;
  }
  if (score <= 0.28) {
    return `oklch(${96 - (1 - score) * 12}% 0.075 28)`;
  }
  return "oklch(96% 0.012 95)";
}

function statusLabel(status: string): string {
  const upper = status.toUpperCase();
  if (upper === "ACTIVE") return "Active";
  if (upper === "PAUSED") return "Paused";
  if (upper === "DELETED") return "Deleted";
  return status || "Unknown";
}

export function CampaignPerformanceMatrix({
  campaigns,
  metric,
  dataPoints,
  onMetricChange,
  onCampaignSelect,
}: CampaignPerformanceMatrixProps) {
  const sortedCampaigns = React.useMemo(() => {
    return campaigns
      .filter((campaign) => campaign.metrics)
      .toSorted((left, right) => (right.metrics?.[metric] ?? 0) - (left.metrics?.[metric] ?? 0));
  }, [campaigns, metric]);

  const valuesByMetric = React.useMemo(() => {
    return new Map(
      MATRIX_METRICS.map((candidate) => [
        candidate.key,
        sortedCampaigns
          .map((campaign) => campaign.metrics?.[candidate.key])
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
      ])
    );
  }, [sortedCampaigns]);

  const dataPointByCampaignMetric = React.useMemo(() => {
    return new Map(dataPoints.map((point) => [`${point.campaignId}:${point.metric}`, point]));
  }, [dataPoints]);

  if (campaigns.length === 0) {
    return (
      <div className="grid min-h-[22rem] place-items-center rounded-lg border border-dashed border-border/70 bg-muted/15 p-8 text-center">
        <div>
          <div className="text-sm font-semibold">No campaign data yet</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Select an ad account or refresh once Meta returns campaign metrics.
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/20 px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold">Campaign Performance Matrix</h3>
          <p className="text-[11px] text-muted-foreground">
            Relative metric heatmaps across the selected ad account.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {MATRIX_METRICS.map((candidate) => (
            <button
              key={candidate.key}
              type="button"
              onClick={() => onMetricChange(candidate.key)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                metric === candidate.key
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/70 bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="h-[min(58svh,620px)]">
        <Table className="text-xs">
          <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
            <TableRow>
              <TableHead className="min-w-[280px] px-3">Campaign</TableHead>
              <TableHead className="w-[96px] px-3">Status</TableHead>
              {MATRIX_METRICS.map((candidate) => (
                <TableHead key={candidate.key} className="min-w-[96px] px-2 text-right">
                  <button
                    type="button"
                    className="inline-flex items-center justify-end gap-1 rounded px-1 py-0.5 hover:bg-muted"
                    onClick={() => onMetricChange(candidate.key)}
                  >
                    {candidate.label}
                    {metric === candidate.key ? (
                      candidate.direction === "lower" ? (
                        <ArrowDownIcon className="h-3 w-3" />
                      ) : (
                        <ArrowUpIcon className="h-3 w-3" />
                      )
                    ) : null}
                  </button>
                </TableHead>
              ))}
              <TableHead className="min-w-[90px] px-3 text-right">Signal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCampaigns.map((campaign) => {
              const selectedPoint = dataPointByCampaignMetric.get(`${campaign.id}:${metric}`);
              return (
                <TableRow
                  key={campaign.id}
                  className="cursor-pointer hover:bg-muted/35"
                  onClick={() => onCampaignSelect?.(campaign.id)}
                >
                  <TableCell className="px-3 py-2 align-middle">
                    <div className="max-w-[340px] truncate font-medium">{campaign.name}</div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="truncate">{campaign.id}</span>
                      {campaign.objective ? <span className="truncate">{campaign.objective}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Badge variant={campaign.status.toUpperCase() === "ACTIVE" ? "default" : "secondary"}>
                      {statusLabel(campaign.status)}
                    </Badge>
                  </TableCell>
                  {MATRIX_METRICS.map((candidate) => {
                    const value = campaign.metrics?.[candidate.key];
                    const rank =
                      typeof value === "number"
                        ? percentile(valuesByMetric.get(candidate.key) ?? [], value)
                        : 0.5;
                    return (
                      <TableCell key={candidate.key} className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onMetricChange(candidate.key);
                            onCampaignSelect?.(campaign.id);
                          }}
                          className={cn(
                            "w-full rounded-md px-2 py-1.5 text-right font-medium transition-transform hover:scale-[1.015]",
                            metric === candidate.key && "ring-1 ring-primary/40"
                          )}
                          style={{ backgroundColor: heatmapColor(candidate, rank) }}
                        >
                          {formatMetric(candidate.key, value)}
                        </button>
                      </TableCell>
                    );
                  })}
                  <TableCell className="px-3 py-2 text-right">
                    <span
                      className={cn(
                        "inline-flex rounded-md px-2 py-1 text-[11px] font-medium",
                        selectedPoint?.status === "strong" && "bg-emerald-500/10 text-emerald-700",
                        selectedPoint?.status === "risk" && "bg-destructive/10 text-destructive",
                        selectedPoint?.status === "watch" && "bg-amber-500/10 text-amber-700",
                        (!selectedPoint || selectedPoint.status === "unknown") && "bg-muted text-muted-foreground"
                      )}
                    >
                      {selectedPoint?.status === "unknown" || !selectedPoint
                        ? formatDelta(selectedPoint?.deltaPct)
                        : selectedPoint.status}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </section>
  );
}

