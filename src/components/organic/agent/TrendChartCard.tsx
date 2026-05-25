"use client";

import { cn } from "@/lib/utils";
import type { UiTrendChart } from "./types";

const SIGNAL_TYPE_STYLES: Record<string, string> = {
  trend: "bg-violet-500/15 text-violet-500",
  event: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  question: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  trend: "Trend",
  event: "Event",
  question: "Q",
};

type Props = { chart: UiTrendChart };

export function TrendChartCard({ chart }: Props) {
  const title = typeof chart?.title === "string" ? chart.title : "";
  const topSignals = Array.isArray(chart?.topSignals) ? chart.topSignals : [];

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 p-3">
      {title && (
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
      )}

      {topSignals.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border/40 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Top Signals
          </p>
          {topSignals.slice(0, 4).map((signal) => (
            <div key={signal.id} className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                  SIGNAL_TYPE_STYLES[signal.type] ?? "bg-muted text-muted-foreground"
                )}
              >
                {SIGNAL_TYPE_LABELS[signal.type] ?? signal.type}
              </span>
              <span className="min-w-0 truncate text-[11px] text-foreground">{signal.title}</span>
              {signal.confidence != null && (
                <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {Math.round(signal.confidence * 100)}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
