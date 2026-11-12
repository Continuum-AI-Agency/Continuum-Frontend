import { PlannerViewSkeleton } from '@/components/organic/primitives/PlannerViewSkeletons';
import { Skeleton } from '@/components/ui/skeleton';

// The route defaults to the month view, so the shell skeleton shows the month grid: a
// fallback shaped like a DIFFERENT view still lands as a layout jump when the real one
// arrives.
export default function OrganicShellSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <div className="flex shrink-0 items-center justify-between">
        <Skeleton className="h-8 w-48 rounded-lg bg-muted/70" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg bg-muted/70" />
          <Skeleton className="h-9 w-24 rounded-lg bg-muted/70" />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <PlannerViewSkeleton view="month" />
      </div>
    </div>
  );
}
