export default function PrimitivesShellSkeleton() {
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="h-8 w-36 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={`tab-${i}`}
            className="h-9 w-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800"
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={`card-${i}`}
            className="h-40 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900"
          />
        ))}
      </div>
    </div>
  );
}
