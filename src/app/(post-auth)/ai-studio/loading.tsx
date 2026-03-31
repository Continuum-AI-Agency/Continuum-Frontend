export default function StudioShellSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-2 border-b border-[var(--color-border)] px-4">
        <div className="h-7 w-7 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-7 w-7 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-7 w-7 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="ml-auto h-7 w-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="flex-1 animate-pulse bg-zinc-50 dark:bg-zinc-950" />
    </div>
  );
}
