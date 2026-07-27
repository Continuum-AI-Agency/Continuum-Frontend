'use client';

import { useAdTimeline } from '@/lib/api/competitorSpy';
import { AdSnapshotCard } from './AdSnapshotCard';

// Paid ads come from Meta's Ad Library, which requires a one-time identity/location
// enrollment on the token behind the request (separate from OAuth ad-account
// permissions). Until that lands, the paid source has no creatives to show — frame
// it as a known gap, not a failure, and point users back to the working organic feed.
function PaidUnavailableNotice() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border p-10 text-center">
      <p className="text-sm font-medium">Ad Library access needs Meta enrollment</p>
      <p className="text-xs text-muted-foreground">
        Paid creatives are unavailable until Ad Library enrollment completes — organic tracking is
        unaffected.
      </p>
    </div>
  );
}

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
          <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-muted/70" />
        ))}
      </div>
    );
  }

  const searching = Boolean(q && q.trim());

  if (isError) {
    if (inspiration && !searching) return <PaidUnavailableNotice />;
    return <p className="p-6 text-sm text-muted-foreground">Failed to load competitor ads.</p>;
  }

  const items = data ?? [];
  if (items.length === 0) {
    if (inspiration && !searching) return <PaidUnavailableNotice />;
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
