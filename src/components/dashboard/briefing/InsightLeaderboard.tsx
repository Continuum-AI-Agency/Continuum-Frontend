import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type LeaderboardRow = {
  id: string;
  name: string;
  subLabel?: string;
  metricValue: string;
  deltaPct?: number;
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

// A dense, ranked data-table of insights (trend signals, top campaigns, etc.) —
// the "pulled-out" value moment that leads the dashboard.
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
            className="flex items-center gap-3 border-b border-border/50 px-3 py-2.5 last:border-b-0"
          >
            <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">{row.name}</span>
              {row.subLabel ? (
                <span className="block truncate text-[11px] text-muted-foreground">{row.subLabel}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
              {row.metricValue}
            </span>
            {typeof row.deltaPct === "number" ? <DeltaBadge value={row.deltaPct} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
