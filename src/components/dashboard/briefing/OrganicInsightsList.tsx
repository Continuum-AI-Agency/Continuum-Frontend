'use client';

import { RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useMemo } from 'react';
import { DASHBOARD_PANEL_MAX_HEIGHT } from '@/components/dashboard/briefing/panelLayout';
import { type InsightListItem, InsightsList } from '@/components/dashboard/datatable/InsightsList';
import type { InstagramAccountOption } from '@/components/dashboard/InstagramOrganicReportingWidget';
import { ModuleShortcutLink } from '@/components/shared/ModuleShortcutLink';
import { useOrganicInsights } from '@/hooks/useOrganicInsights';
import { resolveOrganicAccount } from '@/lib/organic/resolve-organic-account';
import { cn } from '@/lib/utils';
import { isZeroDataInsightSet } from './organicInsightPresentation';

const RANGE_PRESET = 'last_7d' as const;

// The organic account's computed performance insights (growth/content/engagement
// /audience), each with its recommendation. Trends live in the Brand Trends data
// table below — this surfaces the "what's working" analysis instead.
export function OrganicInsightsList({
  brandId,
  accounts,
  youtubeAccounts = [],
}: {
  brandId: string;
  accounts: InstagramAccountOption[];
  youtubeAccounts?: InstagramAccountOption[];
}) {
  const uiText = useTranslations('dashboard');
  const resolved = resolveOrganicAccount(brandId, accounts, youtubeAccounts);
  const integrationAccountId = resolved?.account.integrationAccountId ?? null;
  const platform = resolved?.platform ?? 'instagram';

  const { insights, isLoading, refresh } = useOrganicInsights({
    brandId,
    integrationAccountId,
    platform,
    rangePreset: RANGE_PRESET,
    enabled: Boolean(integrationAccountId),
  });

  const items = useMemo<InsightListItem[]>(() => {
    if (isZeroDataInsightSet(insights)) {
      return [
        {
          id: 'organic-zero-data',
          text: 'Publish your first posts to unlock performance insights.',
          severity: 'neutral',
          label: uiText('getting_started_831d0f7'),
          detail: 'Continuum will surface reach, engagement, and content patterns as data arrives.',
        },
      ];
    }
    return insights.slice(0, 8).map((insight, index) => ({
      id: insight.post_id ?? `${insight.category}-${index}`,
      text: insight.text,
      severity: insight.severity,
      label: insight.category,
      detail: insight.recommendation,
    }));
  }, [insights, uiText]);

  return (
    <InsightsList
      title={uiText('insights_2a932f9')}
      items={items}
      maxHeight={DASHBOARD_PANEL_MAX_HEIGHT}
      headerAction={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            aria-label={uiText('regenerate_insights_7246598')}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCw className={cn('size-3', isLoading && 'animate-spin')} />
          </button>
          <ModuleShortcutLink href="/organic?tab=metrics" label={uiText('metrics_a58da79')} />
        </div>
      }
      isLoading={isLoading && items.length === 0}
      emptyState={
        integrationAccountId ? uiText('organicInsightsEmpty') : uiText('organicInsightsConnect')
      }
    />
  );
}
