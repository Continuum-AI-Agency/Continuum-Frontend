'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

function ExploreLoading() {
  const uiText = useTranslations('organic');
  return (
    <div
      className="flex flex-col gap-3"
      role="status"
      aria-label={uiText('loading_explore_627f751')}
    >
      <Skeleton className="h-8 w-48 rounded-md" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="aspect-[4/5] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

const OrganicExplorePanelDynamic = dynamic(
  () =>
    import('@/components/organic/OrganicExplorePanel').then((m) => ({
      default: m.OrganicExplorePanel,
    })),
  {
    ssr: false,
    loading: ExploreLoading,
  },
);

export function OrganicExploreLazy({ brandId }: { brandId: string }) {
  return <OrganicExplorePanelDynamic brandId={brandId} />;
}
