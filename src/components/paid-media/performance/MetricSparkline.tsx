'use client';
import { useTranslations } from 'next-intl';

import * as React from 'react';
import { Sparkline } from '@/components/organic/cards/Sparkline';
import type { PaidMetricsTrendPoint } from '@/components/paid-media/dashboard/PerformanceDetails';
import type { CampaignPerformanceMetricKey } from '@/lib/paid-media/performance-types';

type MetricSparklineProps = {
  trends: PaidMetricsTrendPoint[] | undefined;
  metric: CampaignPerformanceMetricKey;
  tone?: 'positive' | 'negative' | 'flat';
  width?: number;
  height?: number;
  className?: string;
};

// Maps each chartable campaign metric onto its per-day field. GA4 keys
// (gaSessions/gaConversions) are brand/property-level, absent from the per-campaign
// DailyMetric series and never selectable in the matrix — they map to nothing and
// fall through to the flat placeholder below.
const TREND_FIELD_BY_METRIC: Partial<
  Record<CampaignPerformanceMetricKey, keyof PaidMetricsTrendPoint>
> = {
  spend: 'spend',
  roas: 'roas',
  ctr: 'ctr_pct',
  cpc: 'cpc',
  cpa: 'cpa',
  impressions: 'impressions',
  clicks: 'clicks',
};

export function MetricSparkline({
  trends,
  metric,
  tone = 'flat',
  width = 80,
  height = 20,
  className,
}: MetricSparklineProps) {
  const uiText = useTranslations('scale');

  const field = TREND_FIELD_BY_METRIC[metric];

  const values = React.useMemo(() => {
    if (!trends || !field) return [];
    return trends
      .map((point) => point[field])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  }, [trends, field]);

  return (
    <Sparkline
      ariaLabel={uiText('template_ddf435e47a89', { v0: metric })}
      className={className}
      height={height}
      tone={tone}
      values={values}
      width={width}
    />
  );
}
