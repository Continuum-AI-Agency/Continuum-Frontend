import { Skeleton } from '@/components/ui/skeleton';
export default function StudioShellSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-2 border-b border-[var(--color-border)] px-4">
        <Skeleton className="h-7 w-7 rounded" />
        <Skeleton className="h-7 w-7 rounded" />
        <Skeleton className="h-7 w-7 rounded" />
        <Skeleton className="ml-auto h-7 w-24 rounded-lg" />
      </div>
      <Skeleton className="flex-1 rounded-none" />
    </div>
  );
}
