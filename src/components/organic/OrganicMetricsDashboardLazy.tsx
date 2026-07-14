'use client';

import dynamic from 'next/dynamic';
import { OrganicMetricsWidgetSkeleton } from '@/components/organic/MetricsSkeleton';
import type { OrganicAccountOption } from '@/components/organic/OrganicMetricsDashboard';
import type { OrganicMetricsBrandInsights } from '@/lib/schemas/brandInsights';

const OrganicMetricsDashboardDynamic = dynamic(
  () =>
    import('@/components/organic/OrganicMetricsDashboard').then((m) => ({
      default: m.OrganicMetricsDashboard,
    })),
  { ssr: false, loading: () => <OrganicMetricsWidgetSkeleton /> },
);

type Props = {
  brandId: string;
  accountsByPlatform: {
    instagram: OrganicAccountOption[];
    facebook: OrganicAccountOption[];
    tiktok: OrganicAccountOption[];
    youtube: OrganicAccountOption[];
    linkedin: OrganicAccountOption[];
  };
  initialPlatform?: 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'linkedin';
  brandInsights?: OrganicMetricsBrandInsights | null;
};

export function OrganicMetricsDashboardLazy(props: Props) {
  return <OrganicMetricsDashboardDynamic {...props} />;
}
