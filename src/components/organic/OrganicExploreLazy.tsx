'use client';

import dynamic from 'next/dynamic';

const OrganicExplorePanelDynamic = dynamic(
  () => import('@/components/organic/OrganicExplorePanel').then((m) => ({ default: m.OrganicExplorePanel })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading explore">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted/70" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="aspect-[4/5] animate-pulse rounded-lg bg-muted/70" />
          ))}
        </div>
      </div>
    ),
  },
);

export function OrganicExploreLazy({ brandId }: { brandId: string }) {
  return <OrganicExplorePanelDynamic brandId={brandId} />;
}
