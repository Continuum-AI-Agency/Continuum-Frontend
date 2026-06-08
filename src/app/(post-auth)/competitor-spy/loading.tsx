export default function CompetitorSpyLoading() {
  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="h-7 w-48 animate-pulse rounded-lg bg-muted/70" />
      <div className="h-8 w-full max-w-md animate-pulse rounded-lg bg-muted/70" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-muted/70" />
        ))}
      </div>
    </div>
  );
}
