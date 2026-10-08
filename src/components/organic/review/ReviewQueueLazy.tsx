'use client';

import dynamic from 'next/dynamic';

const ReviewQueueDynamic = dynamic(
  () => import('@/components/organic/review/ReviewQueue').then((m) => ({ default: m.ReviewQueue })),
  {
    ssr: false,
    loading: () => <p className="text-xs text-muted-foreground">Loading the queue…</p>,
  },
);

export function ReviewQueueLazy(props: { brandId: string }) {
  return <ReviewQueueDynamic {...props} />;
}
