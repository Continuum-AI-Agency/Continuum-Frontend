"use client";

// Compact day-over-day change indicator: a direction arrow plus the magnitude.
// Renders nothing when no comparison is available so cards stay clean.

import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import type { MetricComparison } from "@/lib/schemas/organicMetrics";
import { trendDirection } from "../organic-format";
import { cn } from "@/lib/utils";

export function DeltaBadge({
  comparison,
  className,
}: {
  comparison?: MetricComparison | null;
  className?: string;
}) {
  const pct = comparison?.percentageChange;
  if (pct === undefined || Number.isNaN(pct)) return null;

  const direction = trendDirection(pct);
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium leading-none tabular-nums",
        direction === "up" && "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        direction === "down" && "bg-rose-500/12 text-rose-700 dark:text-rose-300",
        direction === "flat" && "bg-slate-500/12 text-slate-600 dark:text-slate-300",
        className
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {`${Math.abs(pct).toFixed(1)}%`}
    </span>
  );
}
