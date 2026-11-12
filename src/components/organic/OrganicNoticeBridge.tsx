'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { getItem, setItem } from '@/lib/storage/brandScopedStorage';

const WARMING_UP_BASE_KEY = 'organic.notice.warmingUpDismissed';

type Props = {
  brandId: string;
  insightsError: string | null;
  showNoTrendsMessage: boolean;
};

export function OrganicNoticeBridge({ brandId, insightsError, showNoTrendsMessage }: Props) {
  const uiText = useTranslations('organic');
  const { show } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!insightsError) return;
    show({
      title: uiText('trend_intelligence_unavailable_31be83e'),
      description: insightsError,
      variant: 'error',
      durationMs: Infinity,
      dedupeKey: `organic-insights-error:${brandId}`,
      action: {
        label: uiText('retry_942087c'),
        onClick: () => router.refresh(),
      },
    });
  }, [brandId, insightsError, router, show, uiText]);

  useEffect(() => {
    if (insightsError) return;
    if (!showNoTrendsMessage) return;
    if (!brandId) return;
    const dismissed = getItem(WARMING_UP_BASE_KEY, brandId) === '1';
    if (dismissed) return;
    setItem(WARMING_UP_BASE_KEY, brandId, '1');
    show({
      title: uiText('trend_coverage_warming_up_0842061'),
      description: uiText('you_can_publish_normally_now_and_add_trend_dr_afe4676'),
      variant: 'warning',
      durationMs: 6000,
      dedupeKey: `organic-no-trends:${brandId}`,
    });
  }, [brandId, insightsError, showNoTrendsMessage, show, uiText]);

  return null;
}
