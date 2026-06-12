"use client";

// One metric tile: label + icon + value (+ optional delta, tier chip, tooltip).
// Shared by the gallery HoverCard quick-look and the post snapshot side panel so
// numbers read identically. "primary" emphasis is a boxed tile; "secondary" is a
// compact label/value row. A tooltip (definition + 24h delta) is shown when
// provided; callers must render it inside a TooltipProvider.

import type { MetricComparison } from "@/lib/schemas/organicMetrics";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCompactNumber, formatRate } from "../organic-format";
import { formatWatchTime, type HookRateTier } from "../organic-metrics-utils";
import { DeltaBadge } from "./DeltaBadge";
import { METRIC_ICONS } from "./metricIcons";
import type { MetricFormat, MetricIconKey } from "./cardMetricSet";

const TIER_CHIP: Record<HookRateTier, { label: string; className: string }> = {
  elite: { label: "Elite", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  good: { label: "Good", className: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  average: { label: "Average", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  poor: { label: "Poor", className: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
};

function formatMetric(value: number | undefined, format: MetricFormat): string {
  if (format === "watchtime") return formatWatchTime(value);
  if (format === "percent") return formatRate(value);
  return formatCompactNumber(value);
}

export type StatTileProps = {
  label: string;
  value: number | undefined;
  format: MetricFormat;
  iconKey?: MetricIconKey;
  comparison?: MetricComparison | null;
  tier?: HookRateTier;
  emphasis?: "primary" | "secondary";
  tooltip?: string;
  className?: string;
};

export function StatTile({
  label,
  value,
  format,
  iconKey,
  comparison,
  tier,
  emphasis = "primary",
  tooltip,
  className,
}: StatTileProps) {
  const Icon = iconKey ? METRIC_ICONS[iconKey] : undefined;
  const formatted = formatMetric(value, format);
  const tierChip = tier ? TIER_CHIP[tier] : undefined;
  const pct = comparison?.percentageChange;

  const body =
    emphasis === "primary" ? (
      <div
        className={cn(
          "flex flex-col gap-1 rounded-lg border border-subtle bg-surface/70 px-2.5 py-2",
          className
        )}
      >
        <div className="flex items-center gap-1 text-muted-foreground">
          {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
          <span className="text-[11px] font-medium leading-none">{label}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-semibold leading-none tabular-nums tracking-tight">{formatted}</span>
          {tierChip ? (
            <span
              className={cn(
                "rounded px-1 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide",
                tierChip.className
              )}
            >
              {tierChip.label}
            </span>
          ) : null}
        </div>
        {comparison ? <DeltaBadge comparison={comparison} className="self-start" /> : null}
      </div>
    ) : (
      <div className={cn("flex items-center justify-between gap-2 rounded-md px-1.5 py-1", className)}>
        <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
          {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
          <span className="truncate">{label}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-semibold tabular-nums tracking-tight">{formatted}</span>
          {comparison ? <DeltaBadge comparison={comparison} /> : null}
        </span>
      </div>
    );

  if (!tooltip) return body;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px]">
        <p className="text-xs leading-snug">{tooltip}</p>
        {pct !== undefined && !Number.isNaN(pct) ? (
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {`${pct >= 0 ? "+" : "-"}${Math.abs(pct).toFixed(1)}% vs 24h ago`}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
