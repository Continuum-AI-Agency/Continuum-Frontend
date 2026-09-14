import { Skeleton } from '@/components/ui/skeleton';

const TAB_COUNT = 3;

// Without this boundary a client navigation into /forge blocks on the brand-context read
// (cacheComponents): the post-auth layout's Suspense is already mounted, so it can't cover it.
export default function ForgeLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-28 bg-muted/70" />
        <Skeleton className="h-3 w-full max-w-2xl bg-muted/70" />
        <Skeleton className="h-3 w-2/3 max-w-xl bg-muted/70" />
      </div>
      <div className="mb-4 flex gap-2">
        {Array.from({ length: TAB_COUNT }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-24 rounded-lg bg-muted/70" />
        ))}
      </div>
      <Skeleton className="h-96 w-full rounded-xl bg-muted/70" />
    </div>
  );
}
