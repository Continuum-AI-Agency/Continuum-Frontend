"use client";

// One metric tile: label + icon + value (+ optional delta, tooltip). Shared by
// the gallery HoverCard quick-look and the post snapshot side panel so numbers
// read identically. "primary" emphasis is a boxed tile; "secondary" is a
// compact label/value row. A tooltip (definition + period-over-period delta) is
// shown when provided; callers must render it inside a TooltipProvider.
// Graded metrics (e.g. hook rate) pass `valueColor` to tint the value text
// itself along the app-wide grading gradient (see hook-rate-color.ts) rather
// than a separate tier chip.

import type { MetricComparison } from "@/lib/schemas/organicMetrics";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCompactNumber, formatRate } from "../organic-format";
import { formatWatchTime } from "../organic-metrics-utils";
import { DeltaBadge } from "./DeltaBadge";
import { METRIC_ICONS } from "./metricIcons";
import type { MetricFormat, MetricIconKey } from "./cardMetricSet";

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
  valueColor?: string;
  emphasis?: "primary" | "secondary";
  tooltip?: string;
  className?: string;
  // No period comparison exists for this metric (currently just Reach) — show
  // a persistent "Lifetime" cue instead of leaving the missing badge unexplained.
  lifetimeOnly?: boolean;
};

export function StatTile({
  label,
  value,
  format,
  iconKey,
  comparison,
  valueColor,
  emphasis = "primary",
  tooltip,
  className,
  lifetimeOnly = false,
}: StatTileProps) {
  const Icon = iconKey ? METRIC_ICONS[iconKey] : undefined;
  const formatted = formatMetric(value, format);
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
          <span className="text-xs font-medium leading-none">{label}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-lg font-semibold leading-none tabular-nums tracking-tight"
            style={valueColor ? { color: valueColor } : undefined}
          >
            {formatted}
          </span>
        </div>
        {comparison ? (
          <DeltaBadge comparison={comparison} className="self-start" />
        ) : lifetimeOnly ? (
          <span className="self-start rounded bg-slate-500/12 px-1 py-0.5 text-2xs font-medium leading-none text-slate-600 dark:text-slate-300">
            Lifetime
          </span>
        ) : null}
      </div>
    ) : (
      // flex-wrap is the fallback for the rare row where label + value + badge
      // can't all fit on one line (e.g. a long label paired with a big number
      // and a large swing) — the value+badge group wraps to its own line as a
      // unit rather than truncating a number, which would misrepresent it.
      <div className={cn("flex flex-wrap items-center justify-between gap-x-1.5 gap-y-0.5 rounded-md px-1 py-1", className)}>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
          <span>{label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
          <span
            className="text-xs font-semibold tabular-nums tracking-tight"
            style={valueColor ? { color: valueColor } : undefined}
          >
            {formatted}
          </span>
          {comparison ? (
            <DeltaBadge comparison={comparison} />
          ) : lifetimeOnly ? (
            <span className="rounded bg-slate-500/12 px-1 py-0.5 text-2xs font-medium leading-none text-slate-600 dark:text-slate-300">
              Lifetime
            </span>
          ) : null}
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
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {`${pct >= 0 ? "+" : "-"}${Math.abs(pct).toFixed(1)}% vs prior 7d`}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
