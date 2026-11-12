'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

function ReviewQueueLoading() {
  const uiText = useTranslations('organic');
  return <p className="text-xs text-muted-foreground">{uiText('loading_the_queue_7a0ee88')}</p>;
}

const ReviewQueueDynamic = dynamic(
  () => import('@/components/organic/review/ReviewQueue').then((m) => ({ default: m.ReviewQueue })),
  {
    ssr: false,
    loading: ReviewQueueLoading,
  },
);

export function ReviewQueueLazy(props: { brandId: string }) {
  return <ReviewQueueDynamic {...props} />;
}
