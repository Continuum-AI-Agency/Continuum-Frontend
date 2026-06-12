"use client";

import { useState } from "react";
import { ChevronDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { AgentCard } from "./agentCardKit";
import type { UiTrendChart } from "./types";

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  trend: "Trend",
  event: "Event",
  question: "Question",
};

type Props = { chart: UiTrendChart };

export function TrendChartCard({ chart }: Props) {
  const [open, setOpen] = useState(false);
  const title = typeof chart?.title === "string" ? chart.title : "Signals";
  const topSignals = Array.isArray(chart?.topSignals) ? chart.topSignals : [];

  if (topSignals.length === 0) return null;

  return (
    <AgentCard className="overflow-hidden p-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2"
      >
        <span className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[12px]">{title}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {topSignals.length} signals
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </span>
      </button>
      <div
        className={cn(
          "grid transition-all duration-200",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-2 px-3 pb-3 pt-1">
            {topSignals.slice(0, 4).map((signal) => (
              <div key={signal.id} className="flex min-w-0 items-baseline gap-2">
                <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {SIGNAL_TYPE_LABELS[signal.type] ?? signal.type}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                  {signal.title}
                </span>
                {signal.confidence != null && (
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {Math.round(signal.confidence * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AgentCard>
  );
}
