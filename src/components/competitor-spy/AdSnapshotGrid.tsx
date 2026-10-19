'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useAdTimeline } from '@/lib/api/competitorSpy';
import { AdSnapshotCard } from './AdSnapshotCard';

export function AdSnapshotGrid({
  brandId,
  competitorId,
  status,
  q,
  limit = 60,
  inspiration = false,
}: {
  brandId: string;
  competitorId?: string;
  status?: 'active' | 'paused';
  q?: string;
  limit?: number;
  inspiration?: boolean;
}) {
  const { data, isLoading, isError } = useAdTimeline({ brandId, competitorId, status, q, limit });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
        ))}
      </div>
    );
  }

  const searching = Boolean(q && q.trim());

  // An error and an empty feed are different answers; each competitor's own paid
  // badge carries the reason a Page has no ads yet.
  if (isError) {
    return <p className="p-6 text-sm text-muted-foreground">Failed to load competitor ads.</p>;
  }

  const items = data ?? [];
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-sm font-medium">
          {searching ? 'No matching inspiration' : 'No competitor ads yet'}
        </p>
        <p className="text-xs text-muted-foreground">
          {searching
            ? 'Try a different keyword, or clear the search.'
            : 'Tag competitors and run a sync to pull their Meta Ad Library creatives.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((entry) => (
        <AdSnapshotCard
          key={entry.snapshotId}
          entry={entry}
          inspiration={inspiration}
          brandId={brandId}
        />
      ))}
    </div>
  );
}
