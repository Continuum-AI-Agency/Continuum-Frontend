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
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-muted/20 p-4">
        <Skeleton className="h-full w-full" />
      </div>
    </div>
  );
}

export function WidgetSkeleton() {
  return (
    <div className="h-full w-full rounded-lg border border-subtle bg-surface p-4 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
           <Skeleton className="h-8 w-8 rounded-full" />
           <div className="space-y-1">
             <Skeleton className="h-4 w-32" />
             <Skeleton className="h-3 w-24" />
           </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <Skeleton className="flex-1 w-full mt-2" />
    </div>
  );
}
