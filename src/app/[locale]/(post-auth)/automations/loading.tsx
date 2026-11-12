import { Skeleton } from '@/components/ui/skeleton';

const TEMPLATE_CARD_COUNT = 2;
const WORKFLOW_CARD_COUNT = 3;

export default function AutomationsLoading() {
  return (
    <div className="min-h-dvh bg-background px-6 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="space-y-3">
          <Skeleton className="h-3 w-28 bg-muted/70" />
          <Skeleton className="h-8 w-72 bg-muted/70" />
          <Skeleton className="h-3 w-full max-w-2xl bg-muted/70" />
          <Skeleton className="h-3 w-2/3 max-w-xl bg-muted/70" />
        </div>

        <div className="mt-8">
          <Skeleton className="h-3 w-44 bg-muted/70" />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {Array.from({ length: TEMPLATE_CARD_COUNT }).map((_, index) => (
              <div key={index} className="space-y-3 rounded-xl border border-border p-5">
                <Skeleton className="h-4 w-40 bg-muted/70" />
                <Skeleton className="h-3 w-full bg-muted/70" />
                <Skeleton className="h-3 w-4/5 bg-muted/70" />
                <Skeleton className="h-7 w-28 bg-muted/70" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: WORKFLOW_CARD_COUNT }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <Skeleton className="h-9 w-9 rounded-lg bg-muted/70" />
                <Skeleton className="h-4 w-20 rounded-full bg-muted/70" />
              </div>
              <Skeleton className="mt-5 h-4 w-2/3 bg-muted/70" />
              <Skeleton className="mt-2 h-3 w-1/2 bg-muted/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
