// The route's loading frame in the shape the Optimizer lands in: the sub-view bar, then the
// Overview's sentence, figures and rows straight on the page — no boxed panels.
const FIGURES = ['spend', 'first-kind', 'second-kind', 'decisions', 'autopilot'];
const ROWS = ['first', 'second', 'third', 'fourth'];

export default function PaidMediaShellSkeleton() {
  return (
    <div className="grid h-[var(--app-content-h)] min-h-[var(--workspace-min-height)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <div className="flex min-h-9 items-center justify-between gap-3 border-border/60 border-b px-[var(--app-shell-pad-inline)]">
        <div className="h-5 w-[min(22rem,60%)] animate-pulse rounded-md bg-muted" />
        <div className="hidden h-6 w-56 animate-pulse rounded-md bg-muted sm:block" />
      </div>
      <div className="min-h-0 space-y-4 overflow-hidden px-[var(--app-shell-pad-inline)] py-3">
        <div className="h-6 w-[min(40rem,90%)] animate-pulse rounded-md bg-muted" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {FIGURES.map((figure) => (
            <div key={figure} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
        <div className="space-y-2">
          {ROWS.map((row) => (
            <div key={row} className="h-10 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
