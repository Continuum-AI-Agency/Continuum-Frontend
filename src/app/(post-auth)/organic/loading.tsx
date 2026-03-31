export default function OrganicShellSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="flex gap-2">
          <div className="h-9 w-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-9 w-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
      <div className="grid flex-1 grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={`col-${i}`} className="flex flex-col gap-2">
            <div className="h-6 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div
                key={`cell-${i}-${j}`}
                className="h-24 w-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
