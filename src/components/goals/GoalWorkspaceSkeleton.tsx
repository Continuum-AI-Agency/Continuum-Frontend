import { Skeleton } from '@/components/ui/skeleton';

export function GoalWorkspaceSkeleton() {
  return (
    <div className="flex h-[var(--app-content-h)] min-h-[var(--workspace-min-height,600px)] flex-col gap-[var(--app-shell-gap)] py-[var(--page-pad-block)]">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-44 bg-muted/70" />
          <Skeleton className="h-3 w-72 bg-muted/70" />
        </div>
        <Skeleton className="h-7 w-24 bg-muted/70" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,1fr)] overflow-hidden rounded-lg border border-border/70">
        <div className="space-y-3 border-r border-border/70 p-3">
          <Skeleton className="h-24 w-full bg-muted/70" />
          <Skeleton className="h-16 w-full bg-muted/70" />
          <Skeleton className="h-16 w-full bg-muted/70" />
          <Skeleton className="h-16 w-full bg-muted/70" />
        </div>
        <div className="space-y-3 p-4">
          <Skeleton className="h-12 w-full bg-muted/70" />
          <Skeleton className="h-[70%] w-full bg-muted/70" />
        </div>
        <div className="space-y-3 border-l border-border/70 p-3">
          <Skeleton className="h-8 w-full bg-muted/70" />
          <Skeleton className="h-12 w-full bg-muted/70" />
          <Skeleton className="h-12 w-full bg-muted/70" />
          <Skeleton className="h-12 w-full bg-muted/70" />
        </div>
      </div>
    </div>
  );
}
