import { Skeleton } from '@/components/ui/skeleton';
export default function PrimitivesShellSkeleton() {
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <Skeleton className="h-8 w-36 rounded-lg" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={`tab-${i}`} className="h-9 w-24 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={`card-${i}`} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
