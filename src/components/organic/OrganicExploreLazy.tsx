'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const OrganicExplorePanelDynamic = dynamic(
  () => import('@/components/organic/OrganicExplorePanel').then((m) => ({ default: m.OrganicExplorePanel })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading explore">
        <Skeleton className="h-8 w-48 rounded-md" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[4/5] rounded-lg" />
          ))}
        </div>
      </div>
    ),
  },
);

export function OrganicExploreLazy({ brandId }: { brandId: string }) {
  return <OrganicExplorePanelDynamic brandId={brandId} />;
}
