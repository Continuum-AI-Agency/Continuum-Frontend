"use client";

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import type { MetricItemV2 } from "@/lib/jaina/schemas";
import { formatValue } from "@/lib/jaina/formatValue";

type MetricCardProps = { metric: MetricItemV2 };

const severityColorMap: Record<string, string> = {
  positive: "text-emerald-500",
  watch: "text-amber-500",
  risk: "text-red-500",
  neutral: "text-muted-foreground",
};

function resolveChangeColor(severity?: string): string {
  return severityColorMap[severity ?? "neutral"] ?? "text-muted-foreground";
}

export function MetricCard({ metric }: MetricCardProps) {
  const hasChange = metric.change !== undefined;

  return (
    <div className="rounded-lg border border-border/60 bg-background/80 p-3">
      <p className="text-xs text-muted-foreground">{metric.label}</p>
      <p className="text-xl font-semibold tabular-nums">
        {formatValue(metric.value, metric.format ?? undefined)}
      </p>
      {hasChange && (
        <span className={`flex items-center gap-0.5 text-xs ${resolveChangeColor(metric.severity ?? undefined)}`}>
          {metric.change_direction === "up" ? (
            <ArrowUpIcon className="size-3" />
          ) : (
            <ArrowDownIcon className="size-3" />
          )}
          {Math.abs(metric.change!)}%
        </span>
      )}
    </div>
  );
}
