import { Skeleton } from '@/components/ui/skeleton';
export default function CompetitorSpyLoading() {
  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <Skeleton className="h-7 w-48 rounded-lg" />
      <Skeleton className="h-8 w-full max-w-md rounded-lg" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
