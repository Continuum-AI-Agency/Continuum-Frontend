"use client";

import { AgentCard, AgentCardEyebrow } from "./agentCardKit";
import type { UiTrendChart } from "./types";

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  trend: "Trend",
  event: "Event",
  question: "Question",
};

type Props = { chart: UiTrendChart };

export function TrendChartCard({ chart }: Props) {
  const title = typeof chart?.title === "string" ? chart.title : "Signals";
  const topSignals = Array.isArray(chart?.topSignals) ? chart.topSignals : [];

  if (topSignals.length === 0) return null;

  return (
    <AgentCard>
      <AgentCardEyebrow label={title} />
      <div className="mt-3 space-y-2">
        {topSignals.slice(0, 4).map((signal) => (
          <div key={signal.id} className="flex min-w-0 items-baseline gap-2">
            <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
              {SIGNAL_TYPE_LABELS[signal.type] ?? signal.type}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">{signal.title}</span>
            {signal.confidence != null && (
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {Math.round(signal.confidence * 100)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </AgentCard>
  );
}
