import { Skeleton } from '@/components/ui/skeleton';
export default function SettingsShellSkeleton() {
  return (
    <div className="flex min-h-full gap-4 px-[var(--page-pad-inline)] py-[var(--page-pad-block)]">
      <div className="flex w-48 flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={`nav-${i}`} className="h-9 rounded-lg" />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-6">
        <Skeleton className="h-8 w-40 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
