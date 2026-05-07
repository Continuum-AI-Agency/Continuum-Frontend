"use client";

import { cn } from "@/lib/utils";
import type { UiTrendChart } from "./types";

const SERIES_COLORS: Record<string, string> = {
  Trends: "#5A48F9",
  Events: "#f59e0b",
  Questions: "#10b981",
};

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

const BAR_MAX_H = 68;

type Props = { chart: UiTrendChart };

export function TrendChartCard({ chart }: Props) {
  const title = typeof chart?.title === "string" ? chart.title : "";
  const windows = Array.isArray(chart?.windows) ? chart.windows : [];
  const series = Array.isArray(chart?.series) ? chart.series : [];
  const topSignals = Array.isArray(chart?.topSignals) ? chart.topSignals : [];

  const maxValue = Math.max(1, ...series.flatMap((s) => s.data.map((d) => d.value)));

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 p-3">
      {title && (
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
      )}

      <div className="flex items-end gap-8 px-1">
        {windows.map((w) => (
          <div key={w} className="flex flex-col items-center gap-1.5">
            <div className="flex items-end gap-0.5" style={{ height: BAR_MAX_H }}>
              {series.map((s) => {
                const val = s.data.find((d) => d.window === w)?.value ?? 0;
                const h = Math.max(2, Math.round((val / maxValue) * BAR_MAX_H));
                return (
                  <div
                    key={s.label}
                    className="w-2.5 rounded-t-sm"
                    style={{ height: h, backgroundColor: SERIES_COLORS[s.label] }}
                    title={`${s.label}: ${val}`}
                  />
                );
              })}
            </div>
            <span className="text-[10px] text-muted-foreground">{w}d</span>
          </div>
        ))}

        <div className="ml-auto flex flex-col justify-end gap-1 pb-5">
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: SERIES_COLORS[s.label] }}
              />
              <span className="text-[10px] text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

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
