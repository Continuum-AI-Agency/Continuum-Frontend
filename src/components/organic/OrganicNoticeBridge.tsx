'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { revalidateBrandInsights } from '@/lib/actions/brandInsights';
import { claimOncePerSession } from '@/lib/brand-insights/oncePerSession';

type Props = {
  brandId: string;
  insightsError: string | null;
};

export function OrganicNoticeBridge({ brandId, insightsError }: Props) {
  const { show } = useToast();
  const router = useRouter();

  // A real read failure, shown once per session. "No report yet" never reaches here: the
  // page maps it to an empty state.
  useEffect(() => {
    if (!insightsError || !claimOncePerSession('error-toast', brandId)) return;
    show({
      title: 'Trend intelligence unavailable',
      description: insightsError,
      variant: 'error',
      durationMs: Infinity,
      dedupeKey: `organic-insights-error:${brandId}`,
      action: {
        label: 'Retry',
        // router.refresh() alone would re-render against the cached read.
        onClick: () =>
          void revalidateBrandInsights(brandId)
            .catch(() => undefined)
            .then(() => router.refresh()),
      },
    });
  }, [brandId, insightsError, router, show]);

  return null;
}
