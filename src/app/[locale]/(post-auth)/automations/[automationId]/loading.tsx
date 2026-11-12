import { Skeleton } from '@/components/ui/skeleton';

const PALETTE_ROW_COUNT = 7;

export default function AutomationWorkspaceLoading() {
  return (
    <div className="automation-workspace-shell fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden bg-background text-foreground md:left-[var(--app-sidebar-width,3.5rem)]">
      <header className="flex min-h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-3">
        <Skeleton className="size-8 shrink-0 bg-muted/70" />
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-3.5 w-48 bg-muted/70" />
          <Skeleton className="h-2.5 w-32 bg-muted/70" />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Skeleton className="h-7 w-16 bg-muted/70" />
          <Skeleton className="h-7 w-16 bg-muted/70" />
          <Skeleton className="h-7 w-24 bg-muted/70" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-12 shrink-0 flex-col border-r bg-card md:w-[17rem]">
          <div className="flex h-12 shrink-0 items-center border-b px-4">
            <Skeleton className="h-3 w-24 bg-muted/70" />
          </div>
          <div className="min-h-0 flex-1 space-y-2 p-2">
            {Array.from({ length: PALETTE_ROW_COUNT }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full bg-muted/70" />
            ))}
          </div>
        </aside>

        <div className="min-w-0 flex-1 bg-muted/40" />

        <aside className="hidden w-[22rem] shrink-0 flex-col border-l bg-card xl:flex">
          <div className="flex h-12 shrink-0 items-center border-b px-4">
            <Skeleton className="h-3 w-28 bg-muted/70" />
          </div>
          <div className="min-h-0 flex-1 space-y-3 p-3">
            <Skeleton className="h-9 w-full bg-muted/70" />
            <Skeleton className="h-24 w-full bg-muted/70" />
            <Skeleton className="h-9 w-full bg-muted/70" />
            <Skeleton className="h-9 w-full bg-muted/70" />
          </div>
        </aside>
      </div>
    </div>
  );
}
