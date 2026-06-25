import { Fragment } from "react";
import { DeltaBadge } from "@/components/shared/DeltaBadge";

export type MetricStripItem = { label: string; value: string; deltaPct?: number };

// A quiet one-line KPI strip — headline metrics rendered as a dense inline row
// (label, value, delta) instead of a stack of stat cards. The app-wide
// replacement for big-number metric grids. Self-removes when empty.
export function MetricStrip({ items, live = false }: { items: MetricStripItem[]; live?: boolean }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {live ? (
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-500 live-pulse" aria-hidden="true" />
      ) : null}
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 ? (
            <span aria-hidden="true" className="text-border">
              ·
            </span>
          ) : null}
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-2xs uppercase tracking-wide text-muted-foreground">{item.label}</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{item.value}</span>
            {typeof item.deltaPct === "number" ? <DeltaBadge value={item.deltaPct} /> : null}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
