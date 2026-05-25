import { Skeleton } from "@/components/ui/skeleton";

export default function ApprovalsLoading() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-6 p-4">
      <div className="flex items-baseline justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-2 w-2 rounded-full" />
          </div>
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-7 w-7 rounded-md" />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-44 rounded-md" />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="skeleton-shimmer h-5 w-32 rounded-md" />
            <div className="skeleton-shimmer h-7 w-2/3 rounded-md" />
          </div>
          <div className="skeleton-shimmer h-16 w-full rounded-md" />
          <div className="flex justify-end pt-2">
            <div className="skeleton-shimmer h-11 w-40 rounded-md" />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-44 w-full rounded-md" />
      </div>
    </div>
  );
}
