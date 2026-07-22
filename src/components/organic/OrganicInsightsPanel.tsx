'use client';

import { ReloadIcon } from '@radix-ui/react-icons';
import { HeartIcon, LayoutGridIcon, TrendingUpIcon, UsersIcon } from 'lucide-react';
import * as React from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { PinToAgentButton } from '@/components/organic/agent/PinToAgentButton';
import { Button } from '@/components/ui/button';
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

const CATEGORY_CONFIG: ReadonlyArray<{
  key: 'growth' | 'content' | 'engagement' | 'audience';
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}> = [
  { key: 'growth', title: 'Growth', icon: TrendingUpIcon, accent: 'bg-emerald-500/90' },
  { key: 'content', title: 'Content', icon: LayoutGridIcon, accent: 'bg-violet-500/90' },
  { key: 'engagement', title: 'Engagement', icon: HeartIcon, accent: 'bg-rose-500/90' },
  { key: 'audience', title: 'Audience', icon: UsersIcon, accent: 'bg-amber-500/90' },
];

const METRIC_LABELS: Record<string, string> = {
  reach_conversion: 'REACH/FOLLOW',
  non_follower_ratio: 'DISCOVERY',
  content_efficiency: 'CONTENT MIX',
  posting_frequency: 'FREQUENCY',
  engagement_rate: 'ENG. RATE',
  save_share_ratio: 'SAVES/SHARES',
  geo_concentration: 'GEOGRAPHY',
  demographic_skew: 'DEMOGRAPHICS',
};

export function OrganicInsightsPanel({
  brandId,
  integrationAccountId,
  platform,
  rangePreset,
}: OrganicInsightsPanelProps) {
  const { insights, expiresAt, isLoading, error, refresh } = useOrganicInsights({
    brandId,
    integrationAccountId,
    platform,
    rangePreset,
  });

  const stalenessLabel = React.useMemo(() => {
    if (!expiresAt) return null;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return 'Stale';
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `Fresh for ${days}d ${hours % 24}h`;
    if (hours > 0) return `Fresh for ${hours}h`;
    const mins = Math.ceil(remaining / (1000 * 60));
    return `Fresh for ${mins}m`;
  }, [expiresAt]);

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
            <h3 className="text-base font-semibold">Organic Insights</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {CATEGORY_CONFIG.map((cat) => (
              <div key={cat.key} className="h-[120px] animate-pulse rounded-lg bg-muted" />
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
            <h3 className="text-base font-semibold">Organic Insights</h3>
            {stalenessLabel ? (
              <Pill variant={stalenessLabel === 'Stale' ? 'destructive' : 'success'}>
                {stalenessLabel}
              </Pill>
            ) : null}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={refresh} aria-label="Refresh insights">
            <ReloadIcon />
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
        <span className="text-xs text-muted-foreground">No insights available</span>
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
                      {insight.metric && METRIC_LABELS[insight.metric] ? (
                        <Pill variant="muted" className="shrink-0">
                          {METRIC_LABELS[insight.metric]}
                        </Pill>
                      ) : null}
                      <Pill variant={insight.source === 'llm' ? 'violet' : 'muted'}>
                        {insight.source === 'llm' ? 'AI' : 'Computed'}
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
                      label="Add insight to agent"
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
