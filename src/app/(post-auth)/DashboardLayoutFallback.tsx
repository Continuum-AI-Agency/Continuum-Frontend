export function DashboardLayoutFallback() {
  return (
    <div className="flex h-dvh w-full">
      <div className="hidden w-64 shrink-0 border-r border-[var(--color-border)] bg-zinc-50 dark:bg-zinc-950 md:block">
        <div className="flex h-16 items-center gap-3 border-b border-[var(--color-border)] px-4">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`nav-${i}`}
              className="h-9 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800"
            />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4">
          <div className="h-5 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="flex-1 p-6">
          <div className="h-8 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}
