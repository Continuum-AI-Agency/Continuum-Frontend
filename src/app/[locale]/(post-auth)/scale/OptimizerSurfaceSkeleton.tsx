// The Optimizer tab's loading frame: the sub-view bar, the figure row, the chart and three
// blocks, in the shapes the surface lands in, straight on the page (no boxed panel). Every part
// is fluid so the frame fits a 390px panel.

import { Skeleton } from '@/components/ui/skeleton';

export function OptimizerSurfaceSkeleton() {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <div className="flex min-h-9 min-w-0 items-center justify-between gap-3 border-border/60 border-b px-[var(--app-shell-pad-inline)]">
        <Skeleton className="h-5 w-full min-w-0 max-w-80 rounded-md" />
        <Skeleton className="h-6 w-full min-w-0 max-w-56 rounded-md" />
      </div>
      <div className="min-h-0 space-y-3 overflow-hidden px-[var(--app-shell-pad-inline)] py-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
        <Skeleton className="h-[min(20rem,45vh)] rounded-lg" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
