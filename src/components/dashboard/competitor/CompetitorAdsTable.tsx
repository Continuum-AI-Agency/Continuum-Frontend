import { Telescope } from "lucide-react";

// Placeholder while competitor ad tracking is being finished. The live timeline
// (Meta Ad Library snapshots + AI creative analysis) ships behind this; until
// then the dashboard surface reads "Coming soon". Keeps the brandId prop so
// re-enabling is a one-line swap.
export function CompetitorAdsTable(_props: { brandId: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Competitor ads</p>
        <span className="rounded-full border border-border/70 bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Coming soon
        </span>
      </div>
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <Telescope className="size-5 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm text-foreground">Competitor ad tracking is coming soon</p>
        <p className="max-w-xs text-[11px] text-muted-foreground">
          A live watch of the ads your competitors are running — new, active, and paused — with the creative themes behind them.
        </p>
      </div>
    </div>
  );
}
