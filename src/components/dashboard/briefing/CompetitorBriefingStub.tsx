import { Telescope } from "lucide-react";

// Placeholder for the competitor briefing. The real component is a separate
// workstream that connects to the Library competitor-inspiration feature
// (grabbing competitor content). Rendered in both organic + paid briefings.
export function CompetitorBriefingStub() {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Telescope className="size-3.5" />
          Competitor signal
        </p>
        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Coming soon
        </span>
      </div>
      <p className="mt-2 max-w-[60ch] text-xs text-muted-foreground">
        Track what your competitors are posting and pull their best-performing creative straight into your studio.
      </p>
    </div>
  );
}
