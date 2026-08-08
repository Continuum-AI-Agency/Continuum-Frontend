import { Skeleton } from '@/components/ui/skeleton';

// Skeletons mirror the flattened pane structure: a hairline-divided stack, no
// radius, no shadow, panel padding from --card-pad. If these drift back into
// cards, every dashboard load flashes the pre-flatten chrome before hydrating.

function PaneHeaderSkeleton({ width = 'w-28' }: { width?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-[var(--card-pad)] py-[var(--section-header-pad-block)]">
      <Skeleton className={`h-3.5 ${width} bg-muted/70`} />
      <Skeleton className="h-3.5 w-20 bg-muted/70" />
    </div>
  );
}

export function DashboardShellSkeleton() {
  return (
    <div className="w-full">
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-background px-[var(--card-pad)] py-[var(--app-shell-pad-block)]">
        <div className="flex gap-4">
          <Skeleton className="h-6 w-24 bg-muted/70" />
          <Skeleton className="h-6 w-24 bg-muted/70" />
        </div>
        <Skeleton className="h-4 w-48 bg-muted/70" />
      </div>
      <WidgetSkeleton />
    </div>
  );
}

export function PaidWidgetSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-border">
      <div className="grid grid-cols-1 items-stretch divide-y divide-border border-y border-border lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:divide-x lg:divide-y-0">
        <div>
          <PaneHeaderSkeleton width="w-32" />
          <div className="space-y-3 p-[var(--card-pad)]">
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton
                  key={`paid-top-metric-${i}`}
                  className="h-14 w-full rounded-md bg-muted/70"
                />
              ))}
            </div>
            <Skeleton className="h-48 w-full rounded-md bg-muted/70" />
          </div>
        </div>
        <div>
          <PaneHeaderSkeleton width="w-24" />
          <div className="space-y-3 p-[var(--card-pad)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={`paid-action-row-${i}`}
                className="h-11 w-full rounded-md bg-muted/70"
              />
            ))}
          </div>
        </div>
      </div>
      <div>
        <PaneHeaderSkeleton width="w-40" />
        <div className="p-[var(--card-pad)]">
          <Skeleton className="h-44 w-full rounded-md bg-muted/70" />
        </div>
      </div>
    </div>
  );
}

/**
 * Suspense fallback for OrganicDashboardDataWrapper.
 * Mirrors OrganicDashboardView: an Overview header, the insights + creatives
 * pane pair, then the competitor / trends / reporting panes stacked below.
 */
export function WidgetSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-border">
      <div className="flex flex-wrap items-end justify-between gap-2 px-[var(--card-pad)] py-[var(--section-header-pad-block)]">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-28 bg-muted/70" />
          <Skeleton className="h-3 w-56 bg-muted/70" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-44 rounded-md bg-muted/70" />
          <Skeleton className="h-8 w-8 rounded-md bg-muted/70" />
        </div>
      </div>

      <div className="grid grid-cols-1 items-stretch divide-y divide-border border-y border-border lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:divide-x lg:divide-y-0">
        <div>
          <PaneHeaderSkeleton />
          <div className="divide-y divide-border/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={`insight-row-${i}`}
                className="flex items-start gap-2.5 px-[var(--card-pad)] py-2.5"
              >
                <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-full bg-muted/70" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-20 bg-muted/70" />
                  <Skeleton className="h-3.5 w-4/5 bg-muted/70" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <PaneHeaderSkeleton width="w-24" />
          <div className="divide-y divide-border/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={`creative-row-${i}`}
                className="flex items-center gap-3 px-[var(--card-pad)] py-2.5"
              >
                <Skeleton className="size-9 shrink-0 rounded bg-muted/70" />
                <Skeleton className="h-3.5 flex-1 bg-muted/70" />
                <Skeleton className="h-3.5 w-12 shrink-0 bg-muted/70" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <PaneHeaderSkeleton width="w-40" />
        <div className="grid grid-cols-3 gap-2 p-[var(--card-pad)] sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton
              key={`competitor-tile-${i}`}
              className="aspect-square w-full rounded-md bg-muted/70"
            />
          ))}
        </div>
      </div>

      <div>
        <PaneHeaderSkeleton width="w-32" />
        <div className="p-[var(--card-pad)]">
          <Skeleton className="h-48 w-full rounded-md bg-muted/70" />
        </div>
      </div>
    </div>
  );
}
