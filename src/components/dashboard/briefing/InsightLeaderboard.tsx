import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LeaderboardThumbnail } from "./LeaderboardThumbnail";

export type LeaderboardRow = {
  id: string;
  name: string;
  subLabel?: string;
  // The "example insight" line surfaced under the row metadata — the value moment.
  insightLine?: string;
  metricValue: string;
  deltaPct?: number;
  // Creative thumbnail (organic creatives); omitted for trends/campaigns.
  thumbnailUrl?: string;
  // Per-row contextual actions (hover/focus-revealed bar). Inert when absent.
  actions?: ReactNode;
};

function DeltaBadge({ value }: { value: number }) {
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex w-12 shrink-0 items-center justify-end gap-0.5 font-mono text-[11px] tabular-nums",
        positive ? "text-emerald-500" : "text-red-500",
      )}
    >
      <Icon className="size-3" />
      {Math.abs(Math.round(value))}%
    </span>
  );
}

type InsightLeaderboardProps = {
  title: string;
  metricLabel?: string;
  rows: LeaderboardRow[];
  className?: string;
};

// A dense, ranked data-table of insights (trend signals, top creatives, top
// campaigns) — the "pulled-out" value moment that leads the dashboard. Rows can
// carry a creative thumbnail, an example-insight line, and contextual actions
// that reveal on hover/focus (always visible on touch via max-sm).
export function InsightLeaderboard({ title, metricLabel, rows, className }: InsightLeaderboardProps) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border/70 bg-card", className)}>
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {metricLabel ? (
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{metricLabel}</p>
        ) : null}
      </div>
      <ul>
        {rows.map((row, index) => (
          <li
            key={row.id}
            className="group flex flex-col border-b border-border/50 px-3 py-2.5 last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{index + 1}</span>
              {row.thumbnailUrl ? (
                <LeaderboardThumbnail src={row.thumbnailUrl} alt={row.name} fallbackSeed={row.name} />
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{row.name}</span>
                {row.subLabel ? (
                  <span className="block truncate text-[11px] text-muted-foreground">{row.subLabel}</span>
                ) : null}
                {row.insightLine ? (
                  <span className="block truncate text-[11px] leading-snug text-foreground/70">{row.insightLine}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
                {row.metricValue}
              </span>
              {typeof row.deltaPct === "number" ? <DeltaBadge value={row.deltaPct} /> : null}
            </div>
            {row.actions ? (
              <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr] max-sm:grid-rows-[1fr]">
                <div className="overflow-hidden">
                  <div className="pl-7 pt-2">{row.actions}</div>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
