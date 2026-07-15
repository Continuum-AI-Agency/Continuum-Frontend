export default function DashboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]">
      <div className="h-10 w-48 animate-pulse rounded bg-muted/70" />
      <div className="h-64 animate-pulse rounded-lg border border-border/70 bg-muted/70" />
      <div className="grid gap-4 md:grid-cols-2"><div className="h-44 animate-pulse rounded-lg bg-muted/70" /><div className="h-44 animate-pulse rounded-lg bg-muted/70" /></div>
    </div>
  );
}
