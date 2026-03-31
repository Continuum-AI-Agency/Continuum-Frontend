export default function SettingsShellSkeleton() {
  return (
    <div className="flex h-full gap-6 p-6">
      <div className="flex w-48 flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={`nav-${i}`}
            className="h-9 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800"
          />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-6">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
      </div>
    </div>
  );
}
