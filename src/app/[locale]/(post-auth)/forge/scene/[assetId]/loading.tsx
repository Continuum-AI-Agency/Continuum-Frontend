import { Skeleton } from '@/components/ui/skeleton';

// The brand-context read blocks a client navigation here as it does on /forge; this boundary is
// the editor's own shape — a header, then fields, the stage and the render panel.
export default function SceneEditorLoading() {
  return (
    <div className="flex h-[var(--app-content-h)] min-h-0 w-full max-w-none flex-col gap-3 overflow-hidden px-[var(--page-pad-inline)] py-[var(--page-pad-block)]">
      <div className="flex shrink-0 items-center gap-2">
        <Skeleton className="h-7 w-24 bg-muted/70" />
        <Skeleton className="h-6 w-56 bg-muted/70" />
        <Skeleton className="ml-auto h-7 w-32 bg-muted/70" />
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[18rem_minmax(0,1fr)_20rem]">
        <Skeleton className="h-full min-h-48 bg-muted/70" />
        <Skeleton className="h-full min-h-48 bg-muted/70" />
        <Skeleton className="h-full min-h-48 bg-muted/70" />
      </div>
    </div>
  );
}
