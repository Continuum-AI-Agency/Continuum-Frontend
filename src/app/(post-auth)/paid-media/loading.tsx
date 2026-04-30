export default function PaidMediaShellSkeleton() {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden px-0 py-2">
      <div className="flex min-h-10 items-center justify-between rounded-lg border border-border/70 bg-muted/10 px-3 py-1.5">
        <div className="h-8 w-[min(18rem,45vw)] animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-[min(22rem,48vw)] animate-pulse rounded-md bg-muted" />
      </div>
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 rounded-lg border border-border/70 bg-card p-2">
        <div className="flex justify-end gap-2">
          <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
          <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
          <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="grid min-h-0 gap-2 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="animate-pulse rounded-lg bg-muted" />
          <div className="animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={`metric-${i}`}
            className="h-20 animate-pulse rounded-lg bg-muted"
          />
        ))}
        </div>
      </div>
    </div>
  );
}
