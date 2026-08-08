'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * MetricCardSkeleton
 * Matches the exact layout of metric cards from MetricsPanel component.
 * Each card displays: label (gray text), value (heading), and optional delta badge.
 */
function MetricCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-surface transition-all">
      <div className="p-3">
        {/* Label skeleton */}
        <Skeleton className="h-3 w-[80px] rounded" />
        {/* Value heading skeleton */}
        <Skeleton className="h-7 w-[100px] rounded mt-3" />
        {/* Click hint text skeleton */}
        <Skeleton className="h-3 w-[120px] rounded mt-2" />
      </div>
    </div>
  );
}

/**
 * MetricsGridSkeleton
 * Displays a grid of metric card skeletons matching the responsive layout:
 * - 1 column on mobile (initial)
 * - 2 columns on small screens (sm)
 * - 3 columns on large screens (lg)
 */
function MetricsGridSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Base metrics count - 6 cards */}
        {Array.from({ length: 6 }).map((_, index) => (
          <MetricCardSkeleton key={index} />
        ))}
      </div>

      {/* Interaction breakdown section header */}
      <div className="pt-4">
        <Skeleton className="h-5 w-[280px] rounded mb-3" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-border bg-surface">
              <div className="p-3">
                <Skeleton className="h-3 w-[100px] rounded mb-2" />
                <Skeleton className="h-[120px] w-full rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * TrendsPanelSkeleton
 * Displays skeleton placeholders for the Trends view with line charts.
 * Includes:
 * - Header with title and date range
 * - Two chart cards (Reach & Views, Engagement)
 */
function TrendsPanelSkeleton() {
  return (
    <div className="pt-4">
      {/* Header section */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <Skeleton className="h-5 w-[120px] rounded mb-1" />
          <Skeleton className="h-4 w-[200px] rounded" />
        </div>
        <Skeleton className="h-6 w-[100px] rounded-full" />
      </div>

      {/* Helper text */}
      <Skeleton className="h-4 w-[280px] rounded mb-4" />

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Reach & Views chart */}
        <div className="rounded-lg border border-border bg-surface">
          <div className="p-3">
            <Skeleton className="h-4 w-[120px] rounded mb-2" />
            <Skeleton className="h-[200px] w-full rounded" />
          </div>
        </div>

        {/* Engagement chart */}
        <div className="rounded-lg border border-border bg-surface">
          <div className="p-3">
            <Skeleton className="h-4 w-[120px] rounded mb-2" />
            <Skeleton className="h-[200px] w-full rounded" />
          </div>
        </div>
      </div>

      {/* Callout box */}
      <div className="pt-4">
        <Skeleton className="h-[60px] w-full rounded" />
      </div>
    </div>
  );
}

/**
 * OrganicMetricsWidgetSkeleton
 * Complete loading skeleton for the entire InstagramOrganicReportingWidget.
 * Includes header (Instagram badge, title, selectors) and content area.
 */
export function OrganicMetricsWidgetSkeleton() {
  return (
    <div className="h-full bg-surface">
      <div className="border-b border-border px-[var(--card-pad)] py-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Skeleton className="hidden h-7 w-7 rounded-full sm:block" />
          <Skeleton className="h-8 w-36 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 min-w-52 flex-1 rounded-md" />
          <Skeleton className="h-8 w-32 rounded-md" />
          <Skeleton className="ml-auto h-8 w-20 rounded-md" />
        </div>
      </div>

      <div className="p-3">
        <MetricsGridSkeleton />
      </div>
    </div>
  );
}

export { MetricCardSkeleton, MetricsGridSkeleton, TrendsPanelSkeleton };
