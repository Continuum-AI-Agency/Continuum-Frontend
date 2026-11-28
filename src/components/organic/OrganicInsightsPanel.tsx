'use client';

import { HeartIcon, LayoutGridIcon, RotateCw, TrendingUpIcon, UsersIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { PinToAgentButton } from '@/components/organic/agent/PinToAgentButton';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganicInsights } from '@/hooks/useOrganicInsights';
import { organicInsightToMentionSuggestion } from '@/lib/agent/kpi-mentions';
import type { OrganicComputedInsight } from '@/lib/organic/organic-insights.types';
import type { OrganicDateRangePreset } from '@/lib/schemas/organicMetrics';
import { cn } from '@/lib/utils';

type OrganicInsightsPanelProps = {
  brandId: string;
  integrationAccountId: string;
  platform: 'instagram' | 'facebook';
  rangePreset: OrganicDateRangePreset;
};

const METRIC_LABELS = {
  reach_conversion: 'insight_reach_follow',
  non_follower_ratio: 'insight_discovery',
  content_efficiency: 'insight_content_mix',
  posting_frequency: 'insight_frequency',
  engagement_rate: 'insight_engagement_rate',
  save_share_ratio: 'insight_saves_shares',
  geo_concentration: 'insight_geography',
  demographic_skew: 'insight_demographics',
} as const;

export function OrganicInsightsPanel({
  brandId,
  integrationAccountId,
  platform,
  rangePreset,
}: OrganicInsightsPanelProps) {
  const uiText = useTranslations('organic');
  const CATEGORY_CONFIG: ReadonlyArray<{
    key: 'growth' | 'content' | 'engagement' | 'audience';
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
  }> = [
    {
      key: 'growth',
      title: uiText('growth_66b06e9'),
      icon: TrendingUpIcon,
      accent: 'bg-emerald-500/90',
    },
    {
      key: 'content',
      title: uiText('content_47bd290'),
      icon: LayoutGridIcon,
      accent: 'bg-violet-500/90',
    },
    {
      key: 'engagement',
      title: uiText('engagement_ea68771'),
      icon: HeartIcon,
      accent: 'bg-rose-500/90',
    },
    {
      key: 'audience',
      title: uiText('audience_545c023'),
      icon: UsersIcon,
      accent: 'bg-amber-500/90',
    },
  ];

  const { insights, expiresAt, isLoading, error, refresh } = useOrganicInsights({
    brandId,
    integrationAccountId,
    platform,
    rangePreset,
  });

  const stalenessLabel = React.useMemo(() => {
    if (!expiresAt) return null;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return uiText('insightStale');
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return uiText('insightFreshDays', { days: days, hours: hours % 24 });
    if (hours > 0) return uiText('insightFreshHours', { hours: hours });
    const mins = Math.ceil(remaining / (1000 * 60));
    return uiText('insightFreshMinutes', { minutes: mins });
  }, [expiresAt, uiText]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, OrganicComputedInsight[]>();
    for (const cat of CATEGORY_CONFIG) {
      map.set(
        cat.key,
        insights.filter((i) => i.category === cat.key),
      );
    }
    return map;
  }, [insights]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-subtle bg-surface">
        <div className="p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold">{uiText('organic_insights_0b43f6f')}</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {CATEGORY_CONFIG.map((cat) => (
              <Skeleton key={cat.key} className="h-[120px] rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-subtle bg-surface">
        <div className="p-3">
          <span className="text-sm text-destructive">{error}</span>
        </div>
      </div>
    );
  }

  if (insights.length === 0) return null;

  return (
    <div className="rounded-lg border border-subtle bg-surface">
      <div className="p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{uiText('organic_insights_0b43f6f')}</h3>
            {stalenessLabel ? (
              <Pill variant={stalenessLabel === 'Stale' ? 'destructive' : 'success'}>
                {stalenessLabel}
              </Pill>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={refresh}
            aria-label={uiText('refresh_insights_aadd88a')}
          >
            <RotateCw />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {CATEGORY_CONFIG.map((cat) => {
            const catInsights = grouped.get(cat.key) ?? [];
            return (
              <InsightCategoryCard
                key={cat.key}
                title={cat.title}
                icon={cat.icon}
                accent={cat.accent}
                insights={catInsights}
                platform={platform}
                rangePreset={rangePreset}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InsightCategoryCard({
  title,
  icon: Icon,
  accent,
  insights,
  platform,
  rangePreset,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  insights: OrganicComputedInsight[];
  platform?: string;
  rangePreset?: string;
}) {
  const uiText = useTranslations('organic');
  return (
    <div className="rounded-lg border border-subtle bg-surface-subtle p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('flex h-6 w-6 items-center justify-center rounded-md', accent)}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-sm font-medium">{title}</span>
        <Pill variant="muted">{insights.length}</Pill>
      </div>

      {insights.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          {uiText('no_insights_available_64e5ad4')}
        </span>
      ) : (
        <div className="flex flex-col gap-2">
          {insights.slice(0, 3).map((insight, i) => {
            const suggestion = organicInsightToMentionSuggestion(insight, i, {
              platform: platform ?? null,
              rangePreset: rangePreset ?? null,
            });
            return (
              <div key={i} className="group/insight relative">
                <div className="flex items-start gap-2">
                  <div
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      insight.severity === 'positive'
                        ? 'bg-emerald-500'
                        : insight.severity === 'negative'
                          ? 'bg-red-500'
                          : 'bg-blue-500',
                    )}
                  />
                  <div className="min-w-0 flex-1 pr-7">
                    <div className="flex items-center gap-1 mb-1">
                      {insight.metric &&
                      METRIC_LABELS[insight.metric as keyof typeof METRIC_LABELS] ? (
                        <Pill variant="muted" className="shrink-0">
                          {uiText(METRIC_LABELS[insight.metric as keyof typeof METRIC_LABELS])}
                        </Pill>
                      ) : null}
                      <Pill variant={insight.source === 'llm' ? 'violet' : 'muted'}>
                        {insight.source === 'llm'
                          ? uiText('ai_11fb682')
                          : uiText('computed_7a15102')}
                      </Pill>
                    </div>
                    <span className="block text-xs leading-snug">{insight.text}</span>
                    {insight.recommendation ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground leading-snug">
                        {insight.recommendation}
                        {insight.estimated_impact ? ` (${insight.estimated_impact})` : ''}
                      </span>
                    ) : null}
                  </div>
                  <div className="absolute right-0 top-0">
                    <PinToAgentButton
                      suggestions={suggestion}
                      iconOnly
                      label={uiText('add_insight_to_agent_0334275')}
                      className="opacity-0 group-hover/insight:opacity-100 max-sm:opacity-100"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
