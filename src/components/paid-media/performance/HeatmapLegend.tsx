"use client";

import { cn } from "@/lib/utils";

const RAMP_STOPS = [
  "oklch(94% 0.075 28)",
  "oklch(96% 0.012 95)",
  "oklch(86% 0.075 154)",
];

const RAMP_STOPS_DARK = [
  "oklch(32% 0.11 28)",
  "oklch(26% 0.025 95)",
  "oklch(34% 0.11 154)",
];

type HeatmapLegendProps = {
  className?: string;
};

export function HeatmapLegend({ className }: HeatmapLegendProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 text-2xs uppercase tracking-[0.08em] text-muted-foreground",
        className
      )}
    >
      <span className="font-medium">Relative to peer set</span>
      <div className="flex items-center gap-1.5">
        <span className="font-mono normal-case tracking-normal text-muted-foreground/80">Worse</span>
        <div className="flex overflow-hidden rounded-sm border border-border/60">
          {RAMP_STOPS.map((light, index) => (
            <span
              key={light}
              className="block h-3 w-5 dark:[background:var(--ramp-dark)]"
              style={
                {
                  background: light,
                  "--ramp-dark": RAMP_STOPS_DARK[index],
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        <span className="font-mono normal-case tracking-normal text-muted-foreground/80">Better</span>
      </div>
      <span className="text-muted-foreground/70 normal-case tracking-normal">
        CPC &amp; CPA inverted &middot; Spend / Impr. / Clicks neutral
      </span>
    </div>
  );
}
