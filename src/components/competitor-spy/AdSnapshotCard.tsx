"use client";

import { useCreativeUrl } from "@/lib/api/competitorSpy";
import type { TimelineEntry } from "@continuum/contracts";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function daysActive(firstSeenAt: string, lastSeenAt: string): number {
  const start = new Date(firstSeenAt).getTime();
  const end = new Date(lastSeenAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize text-foreground/80">
      {children}
    </span>
  );
}

export function AdSnapshotCard({
  entry,
  inspiration = false,
}: {
  entry: TimelineEntry;
  inspiration?: boolean;
}) {
  const hasMedia = entry.hasCreativeMedia ?? false;
  const { data: creativeUrl } = useCreativeUrl(entry.snapshotId, hasMedia);
  const analysis = entry.analysis ?? null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-[4/5] w-full bg-muted">
        {creativeUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary, short-lived signed URLs
          <img src={creativeUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {hasMedia ? "Loading…" : "No creative"}
          </div>
        )}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${
            entry.status === "active" ? "bg-emerald-500/90" : "bg-muted-foreground/80"
          }`}
        >
          {entry.status}
        </span>
        {inspiration ? (
          <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            Inspiration
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{entry.competitorName}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {daysActive(entry.firstSeenAt, entry.lastSeenAt)}d
          </span>
        </div>

        {entry.body ? <p className="line-clamp-3 text-xs text-muted-foreground">{entry.body}</p> : null}

        {analysis ? (
          <div className="flex flex-wrap gap-1">
            {analysis.sentiment ? <Pill>{analysis.sentiment}</Pill> : null}
            {analysis.hookArchetype ? <Pill>{analysis.hookArchetype.replace(/_/g, " ")}</Pill> : null}
            {analysis.primaryTheme ? <Pill>{analysis.primaryTheme}</Pill> : null}
          </div>
        ) : entry.analysisStatus && entry.analysisStatus !== "done" ? (
          <span className="text-[10px] text-muted-foreground">analysis {entry.analysisStatus}</span>
        ) : null}

        <div className="mt-auto flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
          <span>First seen {formatDate(entry.firstSeenAt)}</span>
          {entry.snapshotUrl ? (
            <a href={entry.snapshotUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              View on Meta
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
