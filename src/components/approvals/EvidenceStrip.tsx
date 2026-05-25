"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatMetric, metricLabel } from "./formatters";

const PRIMARY_ORDER = ["roas", "account_avg_roas", "spend", "impressions", "ctr", "cpc", "cpm", "clicks"];

const METRIC_HINTS: Record<string, string> = {
  roas: "Return on ad spend — revenue divided by spend.",
  account_avg_roas: "Mean ROAS across the parent ad account over the rule's evaluation window.",
  spend: "Total amount spent during the rule's evaluation window.",
  impressions: "How many times the ad was rendered.",
  clicks: "Number of clicks recorded during the evaluation window.",
  ctr: "Click-through rate — clicks divided by impressions.",
  cpc: "Cost per click.",
  cpm: "Cost per thousand impressions.",
};

// Pairs of [actual, threshold] — for each pair we render a delta chip on the threshold tile
// so the reviewer can read "value vs benchmark" without doing math.
const DELTA_PAIRS: Array<[actual: string, benchmark: string]> = [
  ["roas", "account_avg_roas"],
];

type Props = {
  facts: Record<string, number> | null | undefined;
  className?: string;
};

export function EvidenceStrip({ facts, className }: Props) {
  if (!facts || Object.keys(facts).length === 0) {
    return (
      <div className={cn("rounded-md border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground", className)}>
        No evidence metrics for this action.
      </div>
    );
  }

  const entries = orderEntries(facts);
  const deltas = computeDeltas(facts);

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "grid grid-flow-col auto-cols-[minmax(7rem,1fr)] gap-px overflow-x-auto rounded-md border border-border bg-border",
          className,
        )}
      >
        {entries.map(([key, value]) => {
          const delta = deltas[key];
          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-start gap-1 bg-card px-3 py-2 transition-colors hover:bg-accent/40">
                  <span className="flex items-center justify-between gap-2 self-stretch text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    <span className="truncate">{metricLabel(key)}</span>
                    {delta ? (
                      <span
                        className={cn(
                          "rounded-sm px-1 py-px font-data text-[9px] tabular-nums",
                          delta.direction === "down" && "bg-destructive/10 text-destructive",
                          delta.direction === "up" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                          delta.direction === "flat" && "text-muted-foreground",
                        )}
                      >
                        {delta.label}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-data text-base tabular-nums text-foreground">
                    {formatMetric(key, value)}
                  </span>
                </div>
              </TooltipTrigger>
              {METRIC_HINTS[key] ? (
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {METRIC_HINTS[key]}
                </TooltipContent>
              ) : null}
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function orderEntries(facts: Record<string, number>): Array<[string, number]> {
  const known = PRIMARY_ORDER.filter((key) => key in facts).map((key) => [key, facts[key]] as [string, number]);
  const extras = Object.entries(facts).filter(([key]) => !PRIMARY_ORDER.includes(key));
  return [...known, ...extras];
}

type Delta = { label: string; direction: "up" | "down" | "flat" };

function computeDeltas(facts: Record<string, number>): Record<string, Delta> {
  const out: Record<string, Delta> = {};
  for (const [actualKey, benchmarkKey] of DELTA_PAIRS) {
    const actual = facts[actualKey];
    const benchmark = facts[benchmarkKey];
    if (!Number.isFinite(actual) || !Number.isFinite(benchmark) || benchmark === 0) continue;
    const ratio = (actual - benchmark) / Math.abs(benchmark);
    const pct = Math.round(ratio * 100);
    if (pct === 0) {
      // Annotate the actual tile so the reviewer sees the comparison immediately.
      out[actualKey] = { label: "≈ avg", direction: "flat" };
      continue;
    }
    out[actualKey] = {
      label: `${pct > 0 ? "+" : ""}${pct}% vs avg`,
      direction: pct < 0 ? "down" : "up",
    };
  }
  return out;
}
