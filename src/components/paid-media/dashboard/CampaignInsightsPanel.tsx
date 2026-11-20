'use client';

import {
  BarChart3Icon,
  MapPinIcon,
  PaletteIcon,
  RotateCw,
  UsersIcon,
  WalletIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useMemo } from 'react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaignInsights } from '@/hooks/useCampaignInsights';
import type { ComputedInsight, InsightCategory } from '@/lib/paid-media/account-insights.types';
import { dashboardFreshness } from './dashboardPresentation';
import { InsightCategoryCard } from './InsightCategoryCard';
import type { PaidMediaTimeRange } from './timeRange';

type CampaignInsightsPanelProps = {
  brandId: string;
  adAccountId: string;
  campaignId: string;
  campaignName?: string;
  campaignObjective?: string;
  timeRange: PaidMediaTimeRange;
};

function groupByCategory(insights: ComputedInsight[]): Record<InsightCategory, ComputedInsight[]> {
  const grouped: Record<InsightCategory, ComputedInsight[]> = {
    budget: [],
    formats: [],
    placements: [],
    audiences: [],
    creative: [],
  };

  for (const insight of insights) {
    grouped[insight.category].push(insight);
  }

  return grouped;
}

export function CampaignInsightsPanel({
  brandId,
  adAccountId,
  campaignId,
  campaignName,
  campaignObjective,
  timeRange,
}: CampaignInsightsPanelProps) {
  const uiText = useTranslations('scale');
  const CATEGORY_CONFIG: ReadonlyArray<{
    key: InsightCategory;
    title: string;
    icon: typeof BarChart3Icon;
    accent: string;
  }> = useMemo(
    () => [
      {
        key: 'budget',
        title: uiText('budget_pace_d212d0e'),
        icon: WalletIcon,
        accent: 'bg-emerald-500/90',
      },
      {
        key: 'placements',
        title: uiText('placement_platform_b564342'),
        icon: MapPinIcon,
        accent: 'bg-blue-500/90',
      },
      {
        key: 'audiences',
        title: uiText('audiences_9e3922b'),
        icon: UsersIcon,
        accent: 'bg-amber-500/90',
      },
      {
        key: 'creative',
        title: uiText('creative_visual_bad9617'),
        icon: PaletteIcon,
        accent: 'bg-rose-500/90',
      },
    ],
    [uiText],
  );

  const { insights, expiresAt, isLoading, error, refresh } = useCampaignInsights({
    brandId,
    adAccountId,
    campaignId,
    campaignName,
    campaignObjective,
    timeRange,
  });

  const grouped = React.useMemo(() => groupByCategory(insights), [insights]);
  const hasAnyInsights = insights.length > 0;

  const stalenessLabel = React.useMemo(
    () => dashboardFreshness(expiresAt, uiText),
    [expiresAt, uiText],
  );

  return (
    <Card className="overflow-hidden border-border/70">
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            <BarChart3Icon className="size-4 text-muted-foreground" />
            {uiText('campaign_insights_af8b36b')}
          </span>
        }
        meta={
          stalenessLabel ? (
            <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/60">
              {stalenessLabel}
            </span>
          ) : null
        }
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={refresh}
            aria-label={uiText('refresh_0e91610')}
            disabled={isLoading}
          >
            <RotateCw className={isLoading ? 'size-3.5 animate-spin' : 'size-3.5'} />
          </Button>
        }
      />

      <CardContent className="p-2">
        <div className="max-h-[clamp(220px,34svh,420px)] overflow-y-auto">
          {isLoading && !hasAnyInsights ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              {CATEGORY_CONFIG.map((cat) => (
                <div key={cat.key} className="rounded-lg border border-border/70 bg-card p-2.5">
                  <div className="mb-2.5 flex items-center gap-2">
                    <Skeleton className="size-7 rounded-md" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <p className="py-4 text-center text-xs text-destructive">{error}</p>
          ) : !hasAnyInsights ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {uiText('no_insights_for_this_range_yet_9873d82')}
            </p>
          ) : (
            <div
              data-tour-id="paid-insights-panel"
              className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4"
            >
              {CATEGORY_CONFIG.map((cat) => (
                <InsightCategoryCard
                  key={cat.key}
                  title={cat.title}
                  icon={cat.icon}
                  insights={grouped[cat.key]}
                  accentColor={cat.accent}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
