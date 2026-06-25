"use client";

import * as React from "react";
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";

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
import {
  MATRIX_METRICS,
  deltaTone,
  formatDeltaPct,
  formatMetric,
  heatmapPaint,
  paintToStyle,
  percentile,
} from "@/lib/paid-media/heatmap";
import { MetricSparkline } from "./MetricSparkline";

type CampaignPerformanceMatrixProps = {
  campaigns: CampaignPerformanceRow[];
  metric: CampaignPerformanceMetricKey;
  dataPoints: CampaignInsightDataPoint[];
  selectedCampaignId?: string | null;
  onMetricChange: (metric: CampaignPerformanceMetricKey) => void;
  onCampaignSelect?: (campaignId: string) => void;
};

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
  selectedCampaignId,
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

  const selectedMetricMeta = MATRIX_METRICS.find((candidate) => candidate.key === metric);

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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/15 px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Detail</h3>
          <p className="text-xs text-muted-foreground">
            Sortable matrix with cell-level percentile tint and trend.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {MATRIX_METRICS.map((candidate) => (
            <button
              key={candidate.key}
              type="button"
              onClick={() => onMetricChange(candidate.key)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                metric === candidate.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {candidate.shortLabel}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="h-[min(58svh,620px)]">
        <Table className="text-xs">
          <TableHeader className="sticky top-0 z-20 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
            <TableRow>
              <TableHead className="sticky left-0 z-30 min-w-[280px] border-r border-border/60 bg-card/95 px-3">
                Campaign
              </TableHead>
              <TableHead className="w-[88px] px-2">Status</TableHead>
              <TableHead className="w-[100px] px-2 text-right">
                <span className="inline-flex items-center gap-1 text-2xs uppercase tracking-[0.08em] text-muted-foreground">
                  Trend
                  {selectedMetricMeta ? (
                    <span className="font-mono normal-case tracking-normal text-muted-foreground/70">
                      ({selectedMetricMeta.shortLabel})
                    </span>
                  ) : null}
                </span>
              </TableHead>
              {MATRIX_METRICS.map((candidate) => (
                <TableHead key={candidate.key} className="min-w-[92px] px-2 text-right">
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center justify-end gap-1 rounded px-1 py-0.5 text-2xs uppercase tracking-[0.08em] transition-colors hover:bg-muted",
                      metric === candidate.key ? "text-primary" : "text-muted-foreground"
                    )}
                    onClick={() => onMetricChange(candidate.key)}
                  >
                    {candidate.shortLabel}
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
              <TableHead className="min-w-[96px] px-3 text-right">
                <span className="text-2xs uppercase tracking-[0.08em] text-muted-foreground">
                  Signal
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCampaigns.map((campaign) => {
              const selectedPoint = dataPointByCampaignMetric.get(`${campaign.id}:${metric}`);
              const isSelected = selectedCampaignId === campaign.id;
              const activeComparison = campaign.comparison?.[metric];
              const signalTone =
                selectedPoint?.status === "strong"
                  ? "positive"
                  : selectedPoint?.status === "risk"
                    ? "negative"
                    : selectedPoint?.status === "watch"
                      ? "negative"
                      : selectedMetricMeta
                        ? deltaTone(selectedMetricMeta, activeComparison?.percentageChange)
                        : "flat";

              return (
                <TableRow
                  key={campaign.id}
                  data-selected={isSelected || undefined}
                  className={cn(
                    "cursor-pointer transition-colors",
                    isSelected
                      ? "bg-primary/[0.04] hover:bg-primary/[0.06]"
                      : "hover:bg-muted/40"
                  )}
                  onClick={() => onCampaignSelect?.(campaign.id)}
                >
                  <TableCell
                    className={cn(
                      "sticky left-0 z-10 max-w-[340px] border-r border-border/60 bg-card px-3 py-2 align-middle",
                      isSelected && "bg-primary/[0.04]"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          "h-6 w-[2px] rounded-full transition-colors",
                          isSelected ? "bg-primary" : "bg-transparent"
                        )}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{campaign.name}</div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-2xs text-muted-foreground">
                          <span className="truncate font-mono">{campaign.id}</span>
                          {campaign.objective ? (
                            <span className="truncate uppercase tracking-[0.08em]">
                              {campaign.objective}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-2">
                    <Badge
                      variant={
                        campaign.status.toUpperCase() === "ACTIVE" ? "default" : "secondary"
                      }
                      className="text-2xs uppercase tracking-[0.08em]"
                    >
                      {statusLabel(campaign.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-2 py-2 text-right">
                    <MetricSparkline
                      trends={campaign.trends}
                      metric={metric}
                      tone={signalTone === "flat" ? "flat" : signalTone}
                      width={80}
                      height={20}
                    />
                  </TableCell>
                  {MATRIX_METRICS.map((candidate) => {
                    const value = campaign.metrics?.[candidate.key];
                    const rank =
                      typeof value === "number"
                        ? percentile(valuesByMetric.get(candidate.key) ?? [], value)
                        : 0.5;
                    const paint = heatmapPaint(candidate, rank);
                    const isActiveColumn = metric === candidate.key;
                    return (
                      <TableCell key={candidate.key} className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onMetricChange(candidate.key);
                            onCampaignSelect?.(campaign.id);
                          }}
                          data-active={isActiveColumn || undefined}
                          className={cn(
                            "w-full rounded-md px-2 py-1 text-right font-mono text-sm font-medium tabular-nums transition-[box-shadow] duration-150",
                            "bg-[var(--hm-bg-light)] dark:bg-[var(--hm-bg-dark)]",
                            "hover:ring-1 hover:ring-inset hover:ring-foreground/15",
                            "data-[active]:shadow-[inset_0_0_0_2px_oklch(60%_0.20_280_/_0.35)]",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset"
                          )}
                          style={paintToStyle(paint) as React.CSSProperties}
                        >
                          {formatMetric(candidate.key, value)}
                        </button>
                      </TableCell>
                    );
                  })}
                  <TableCell className="px-3 py-2 text-right">
                    <SignalChip
                      status={selectedPoint?.status}
                      deltaPct={activeComparison?.percentageChange}
                      tone={signalTone}
                    />
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

type SignalChipProps = {
  status: CampaignInsightDataPoint["status"] | undefined;
  deltaPct: number | undefined;
  tone: "positive" | "negative" | "flat";
};

function SignalChip({ status, deltaPct, tone }: SignalChipProps) {
  const label = formatDeltaPct(deltaPct);
  const Glyph =
    tone === "positive" ? ArrowUpIcon : tone === "negative" ? ArrowDownIcon : MinusIcon;
  const statusLabelText =
    status && status !== "unknown" ? status.charAt(0).toUpperCase() + status.slice(1) : null;

  return (
    <span
      title={statusLabelText ?? undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-xs tabular-nums",
        tone === "positive" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "negative" &&
          "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
        tone === "flat" && "border-border/60 bg-muted/40 text-muted-foreground"
      )}
    >
      <Glyph className="h-3 w-3" aria-hidden />
      <span>{label}</span>
    </span>
  );
}
