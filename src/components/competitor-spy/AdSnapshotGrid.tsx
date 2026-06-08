"use client";

import { useAdTimeline } from "@/lib/api/competitorSpy";
import { AdSnapshotCard } from "./AdSnapshotCard";

export function AdSnapshotGrid({
  brandId,
  competitorId,
  status,
}: {
  brandId: string;
  competitorId?: string;
  status?: "active" | "paused";
}) {
  const { data, isLoading, isError } = useAdTimeline({ brandId, competitorId, status, limit: 60 });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-muted/70" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="p-6 text-sm text-muted-foreground">Failed to load competitor ads.</p>;
  }

  const items = data ?? [];
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-sm font-medium">No competitor ads yet</p>
        <p className="text-xs text-muted-foreground">
          Add competitors and run a sync to pull their Meta Ad Library creatives.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((entry) => (
        <AdSnapshotCard key={entry.snapshotId} entry={entry} />
      ))}
    </div>
  );
}
