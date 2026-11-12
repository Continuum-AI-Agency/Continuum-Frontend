'use client';

import { useTranslations } from 'next-intl';

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
  const uiText = useTranslations('competitor');
  const { data, isLoading, isError } = useAdTimeline({
    brandId,
    competitorId,
    status,
    q,
    limit,
  });

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
    return (
      <p className="p-6 text-sm text-muted-foreground">
        {uiText('failed_to_load_competitor_ads_b348566')}
      </p>
    );
  }

  const items = data ?? [];
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-sm font-medium">
          {searching
            ? uiText('no_matching_inspiration_b5ac65d')
            : uiText('no_competitor_ads_yet_4f8ca64')}
        </p>
        <p className="text-xs text-muted-foreground">
          {searching
            ? uiText('try_a_different_keyword_or_clear_the_search_3a66628')
            : uiText('tag_competitors_and_run_a_sync_to_pull_their__61b5855')}
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
