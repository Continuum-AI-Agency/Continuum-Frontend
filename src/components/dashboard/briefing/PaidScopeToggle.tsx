"use client";

import { cn } from "@/lib/utils";
import { useDashboardPrefsStore, type PaidEntityScope } from "@/stores/dashboardPrefs";

const OPTIONS: ReadonlyArray<{ value: PaidEntityScope; label: string }> = [
  { value: "top_campaigns", label: "Campaigns" },
  { value: "top_adsets", label: "Ad sets" },
];

// Switches the single top-ads table between campaigns and ad sets. The choice is
// persisted in the dashboard store, freeing the other half of the row for the
// paid insights list.
export function PaidScopeToggle() {
  const paidScope = useDashboardPrefsStore((store) => store.paidScope);
  const setPaidScope = useDashboardPrefsStore((store) => store.setPaidScope);

  return (
    <div
      className="inline-flex shrink-0 rounded-md border border-border/70 bg-background p-0.5"
      role="tablist"
      aria-label="Paid entity scope"
    >
      {OPTIONS.map((option) => {
        const active = paidScope === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setPaidScope(option.value)}
            className={cn(
              "h-7 rounded px-2.5 text-[11px] font-medium transition-colors",
              active ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
