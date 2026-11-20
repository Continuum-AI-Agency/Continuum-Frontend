import { Skeleton } from '@/components/ui/skeleton';

const TAB_COUNT = 3;
const CARD_COUNT = 8;

// Without this boundary a client navigation into /forge blocks on the brand-context read
// (cacheComponents): the post-auth layout's Suspense is already mounted, so it can't cover it.
export default function ForgeLoading() {
  return (
    <div className="flex h-[var(--app-content-h)] min-h-0 w-full max-w-none flex-col overflow-hidden px-[var(--page-pad-inline)] py-[var(--page-pad-block)]">
      <div className="mb-3 shrink-0 space-y-2">
        <Skeleton className="h-8 w-28 bg-muted/70" />
        <Skeleton className="h-3 w-80 max-w-full bg-muted/70" />
      </div>
      <div className="mb-4 flex shrink-0 gap-2">
        {Array.from({ length: TAB_COUNT }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-24 rounded-lg bg-muted/70" />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] content-start gap-4 overflow-hidden">
        {Array.from({ length: CARD_COUNT }).map((_, index) => (
          <Skeleton key={index} className="aspect-[4/3] w-full rounded-xl bg-muted/70" />
        ))}
      </div>
    </div>
  );
}
