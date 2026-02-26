import { Skeleton } from "@/components/ui/skeleton";

export function DashboardShellSkeleton() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b flex items-center justify-between bg-background">
        <div className="flex gap-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-muted/20 p-4 gap-3">
        <div className="rounded-lg border border-subtle bg-surface p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Skeleton className="h-8 w-32 rounded-md" />
              <Skeleton className="h-8 w-40 rounded-md" />
            </div>
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={`dashboard-shell-metric-${i}`} className="h-14 w-full rounded-md" />
            ))}
          </div>
        </div>
        <div className="h-px w-full bg-border/70" />
        <div className="flex-1 rounded-lg border border-subtle bg-surface p-4 space-y-3 overflow-hidden">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-36 rounded-md" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={`dashboard-shell-row-${i}`} className="grid grid-cols-[1.4fr_0.8fr_0.8fr] gap-2">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WidgetSkeleton() {
  return (
    <div className="h-full w-full flex flex-col gap-3">
      <div className="rounded-lg border border-subtle bg-surface p-4 space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={`widget-metric-${i}`} className="h-16 w-full rounded-md" />
          ))}
        </div>
        <Skeleton className="h-44 w-full mt-2" />
      </div>
      <div className="flex-1 min-h-0 rounded-lg border border-subtle bg-surface p-4 space-y-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <Skeleton className="h-4 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}
