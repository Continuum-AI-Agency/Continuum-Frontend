import { Skeleton } from "@/components/ui/skeleton";

export function DashboardShellSkeleton() {
  return (
    <div className="w-full">
      <div className="sticky top-0 z-10 shrink-0 px-4 py-3 border-b flex items-center justify-between bg-background">
        <div className="flex gap-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="bg-muted/20 p-4">
        <WidgetSkeleton />
      </div>
    </div>
  );
}

/**
 * Suspense fallback for OrganicDashboardDataWrapper.
 * Mirrors the OrganicDashboardView 2-column grid layout:
 * - Left (3fr): InstagramOrganicReportingWidget skeleton
 * - Right (2fr): BrandTrendsPanel skeleton
 */
export function WidgetSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4 items-start">
      {/* Instagram metrics widget */}
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-28 rounded-md" />
              <Skeleton className="h-9 w-44 rounded-md" />
            </div>
          </div>
          {/* Metric cards grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={`widget-metric-${i}`} className="h-16 w-full rounded-md" />
            ))}
          </div>
          {/* Chart */}
          <Skeleton className="h-48 w-full rounded-md" />
        </div>
      </div>

      {/* Brand trends panel */}
      <div className="rounded-lg bg-card shadow-sm overflow-hidden">
        {/* Panel header */}
        <div className="p-4 border-b space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-5 w-52" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </div>
        </div>
        {/* Panel content */}
        <div className="p-3 space-y-3">
          {/* Generate controls (statusSlot area) */}
          <div className="flex justify-end gap-2">
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="h-8 w-36 rounded-md" />
          </div>
          <div className="h-px bg-border" />
          {/* Tabs */}
          <Skeleton className="h-9 w-full rounded-lg" />
          {/* Search + count */}
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-md" />
            <Skeleton className="h-9 w-20 rounded-md" />
          </div>
          {/* Data rows */}
          <div className="rounded-lg border overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={`trends-row-${i}`} className="flex items-start gap-3 px-4 py-3 border-b last:border-0">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/5" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
                <div className="space-y-1.5 shrink-0">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
