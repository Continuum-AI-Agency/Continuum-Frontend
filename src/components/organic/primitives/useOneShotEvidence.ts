'use client';

// Evidence options for the one-shot composer pickers, loaded lazily when the
// dialog opens. Metrics + insights come from the computed organic insights the
// dashboard already generates (metric-bearing insights double as metric chips);
// winning angles come from the materialized creative-strategy report. Each
// option carries a stable refId so numeric claims the generated copy makes
// against it pass the deterministic claim audit as grounded.

import type { OneShotAngle, OneShotInsight, OneShotMetric } from '@continuum/contracts';
import * as React from 'react';
import { useCreativeStrategyReport } from '@/hooks/useCreativeStrategyReport';
import { useOrganicInsights } from '@/hooks/useOrganicInsights';
import { humanizeMetricName, toInsightRows } from '@/lib/organic/creative-strategy-rows';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';

const MAX_METRICS = 6;
const MAX_INSIGHTS = 5;
const MAX_ANGLES = 6;

const INSIGHTS_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'] as const;
type InsightsPlatform = (typeof INSIGHTS_PLATFORMS)[number];

const toInsightsPlatform = (platform: OrganicPlatformKey): InsightsPlatform | null =>
  (INSIGHTS_PLATFORMS as readonly string[]).includes(platform)
    ? (platform as InsightsPlatform)
    : null;

export type OneShotEvidenceOptions = {
  metrics: OneShotMetric[];
  insights: OneShotInsight[];
  angles: OneShotAngle[];
  loading: boolean;
};

export function useOneShotEvidence(params: {
  brandId: string;
  platform: OrganicPlatformKey;
  integrationAccountId: string | null;
  enabled: boolean;
}): OneShotEvidenceOptions {
  const insightsPlatform = toInsightsPlatform(params.platform);
  const organic = useOrganicInsights({
    brandId: params.brandId,
    integrationAccountId: params.integrationAccountId,
    platform: insightsPlatform ?? 'instagram',
    rangePreset: 'last_30d',
    enabled: params.enabled && insightsPlatform !== null && Boolean(params.integrationAccountId),
  });
  const strategy = useCreativeStrategyReport(params.enabled ? params.brandId : '');

  return React.useMemo(() => {
    const metrics: OneShotMetric[] = organic.insights
      .filter((insight) => typeof insight.metric === 'string' && typeof insight.value === 'number')
      .slice(0, MAX_METRICS)
      .map((insight, index) => ({
        refId: `metric-${insight.metric}-${index}`,
        key: insight.metric as string,
        label: humanizeMetricName(insight.metric as string),
        value: insight.value as number,
        delta: insight.delta ?? null,
        window: '30d',
      }));

    const insights: OneShotInsight[] = organic.insights
      .slice(0, MAX_INSIGHTS)
      .map((insight, index) => ({
        refId: `insight-${index}`,
        category: insight.category,
        summary: insight.text,
        recommendation: insight.recommendation ?? null,
      }));

    const angles: OneShotAngle[] = (strategy.report ? toInsightRows(strategy.report.insights) : [])
      .slice(0, MAX_ANGLES)
      .map((row) => ({
        refId: `angle-${row.id}`,
        angle: row.label,
        evidence:
          row.avgMetricLabel && row.avgMetricValue != null
            ? `${row.avgMetricLabel}: ${row.avgMetricValue}`
            : (row.recommendation ?? null),
      }));

    return {
      metrics,
      insights,
      angles,
      loading: organic.isLoading || strategy.isLoading,
    };
  }, [organic.insights, organic.isLoading, strategy.report, strategy.isLoading]);
}
