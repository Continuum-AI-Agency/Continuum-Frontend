import { Skeleton } from '@/components/ui/skeleton';

// Mirrors SharePayloadView's wrapper (max-w-5xl main, bordered header, tile grid) so the static
// shell and the resolved page occupy the same space and the swap does not shift layout.
const TILE_COUNT = 3;

export function ShareViewerSkeleton() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex items-baseline justify-between gap-4 border-b border-border pb-4">
        <Skeleton className="h-5 w-64 bg-muted/70" />
        <Skeleton className="h-3 w-32 shrink-0 bg-muted/70" />
      </header>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: TILE_COUNT }).map((_, index) => (
          <div key={index} className="flex flex-col gap-3">
            <Skeleton className="aspect-video w-full bg-muted/70" />
            <Skeleton className="h-3.5 w-3/4 bg-muted/70" />
            <Skeleton className="h-3 w-1/2 bg-muted/70" />
          </div>
        ))}
      </div>
    </main>
  );
}
