import { Skeleton } from '@/components/ui/skeleton';
export function DashboardLayoutFallback() {
  return (
    <div className="flex h-dvh w-full">
      <div className="hidden w-64 shrink-0 border-r border-[var(--color-border)] bg-zinc-50 dark:bg-zinc-950 md:block">
        <div className="flex h-16 items-center gap-3 border-b border-[var(--color-border)] px-4">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-4 w-24 rounded" />
        </div>
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={`nav-${i}`} className="h-9 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4">
          <Skeleton className="h-5 w-32 rounded" />
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-48 rounded" />
        </div>
      </div>
    </div>
  );
}
