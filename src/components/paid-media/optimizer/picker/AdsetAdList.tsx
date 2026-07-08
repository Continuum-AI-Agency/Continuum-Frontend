'use client';

// Display-only list of the ads inside one ad set (provenance). Lazy: the read is
// disabled until the ad-set node is expanded (adsetId gates the hook). Ads are not
// enrollable — the optimizer acts at the ad-set level — so nothing here is
// selectable.

import { Image as ImageIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useOptimizerAdsetAds } from '../useOptimizerData';

type AdsetAdListProps = {
  brandId: string;
  accountId: string | null;
  adsetId: string;
};

export function AdsetAdList({ brandId, accountId, adsetId }: AdsetAdListProps) {
  const { data: ads, isLoading, isError } = useOptimizerAdsetAds(brandId, accountId, adsetId);

  if (isLoading) {
    return (
      <div className="space-y-1 p-2 pl-9">
        <Skeleton className="h-7 rounded-md" />
        <Skeleton className="h-7 w-2/3 rounded-md" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="px-2 py-1.5 pl-9 text-2xs text-warning">
        Couldn&rsquo;t load the ads in this ad set.
      </p>
    );
  }

  if (ads.length === 0) {
    return (
      <p className="px-2 py-1.5 pl-9 text-2xs text-muted-foreground">No ads in this ad set.</p>
    );
  }

  return (
    <ul className="space-y-0.5 p-1 pl-9">
      {ads.map((ad) => (
        <li key={ad.id} className="flex items-center gap-2 rounded-md px-2 py-1">
          <span className="grid size-5 shrink-0 place-content-center rounded bg-muted text-muted-foreground">
            <ImageIcon className="size-3" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-2xs text-foreground">
            {ad.name || ad.id}
          </span>
          {ad.status ? (
            <span className="shrink-0 text-3xs uppercase tracking-wide text-muted-foreground">
              {ad.status.toLowerCase()}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
