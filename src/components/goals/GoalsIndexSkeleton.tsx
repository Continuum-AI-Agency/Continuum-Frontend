import { Skeleton } from '@/components/ui/skeleton';

export function GoalsIndexSkeleton() {
  return (
    <div className="flex h-[var(--app-content-h)] min-h-[var(--workspace-min-height,600px)] flex-col gap-[var(--app-shell-gap)] py-[var(--page-pad-block)]">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28 bg-muted/70" />
          <Skeleton className="h-3 w-72 bg-muted/70" />
        </div>
        <Skeleton className="h-7 w-32 bg-muted/70" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border/70">
        <Skeleton className="h-8 w-full rounded-none bg-muted/70" />
        <div className="space-y-px">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex gap-3 border-t border-border/60 p-4">
              <Skeleton className="size-7 shrink-0 bg-muted/70" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-48 bg-muted/70" />
                <Skeleton className="h-3 w-3/4 bg-muted/70" />
                <Skeleton className="h-2.5 w-2/3 bg-muted/70" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
