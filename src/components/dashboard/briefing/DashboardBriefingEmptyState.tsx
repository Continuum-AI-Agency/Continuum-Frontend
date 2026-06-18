import { Sparkles } from "lucide-react";

// Teaching empty state shown when no insights have been generated yet. Dense,
// not Notion-style whitespace. The generate control lives in the briefing
// header, so this only has to explain what will appear.
export function DashboardBriefingEmptyState() {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-border/70 bg-card p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="size-3.5" />
        Weekly briefing
      </p>
      <p className="max-w-[60ch] text-sm text-muted-foreground">
        Your top trend signals and account insights land here. We generate them automatically and refresh daily, so
        fresh signal is waiting each time you log in.
      </p>
    </div>
  );
}
