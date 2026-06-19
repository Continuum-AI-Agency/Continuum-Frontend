"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { DeltaBadge } from "./DeltaBadge";

export type StatCardProps = {
  label: string;
  value: string;
  deltaPct?: number;
  // Real per-day series for the bar sparkline. Omitted → no bar drawn (never a
  // decorative placeholder).
  series?: number[];
  live?: boolean;
  // Optional hover detail (current vs prior period, secondary metrics) revealed
  // on mouseover — the same rich-on-demand idiom as the data-table rows.
  detail?: ReactNode;
  className?: string;
};

// A dense KPI tile: tiny uppercase label, an optional live dot, a large
// monospace value with its period-over-period delta, and a real mini bar series.
export function StatCard({ label, value, deltaPct, series, live = false, detail, className }: StatCardProps) {
  const chartData = series && series.length > 0 ? series.map((v, index) => ({ index, v })) : null;

  const body = (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-3",
        detail && "cursor-default transition-colors hover:bg-muted/30",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {live ? <span className="size-1.5 rounded-full bg-emerald-500 live-pulse" aria-hidden="true" /> : null}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</span>
        {typeof deltaPct === "number" ? <DeltaBadge value={deltaPct} /> : null}
      </div>
      {chartData ? (
        <div className="h-7 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Bar dataKey="v" fill="var(--chart-1)" radius={1} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );

  if (!detail) return body;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{body}</HoverCardTrigger>
      <HoverCardContent align="start" sideOffset={8} className="w-56">
        {detail}
      </HoverCardContent>
    </HoverCard>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-3">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-7 w-full" />
    </div>
  );
}
