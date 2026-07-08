'use client';

import { useEffect, useMemo, useState } from 'react';
import { DASHBOARD_PANEL_MAX_HEIGHT } from '@/components/dashboard/briefing/panelLayout';
import {
  type InsightListItem,
  type InsightSeverity,
  InsightsList,
} from '@/components/dashboard/datatable/InsightsList';
import { ModuleShortcutLink } from '@/components/shared/ModuleShortcutLink';
import {
  getLatestInsights,
  type PersistedCampaignInsight,
} from '@/lib/paid-media/insight-history-client';

type State =
  | { status: 'idle' | 'loading' }
  | { status: 'error' }
  | { status: 'success'; insights: PersistedCampaignInsight[] };

// Paid campaign insights grade info/opportunity/warning/critical — fold those
// into the shared positive/negative/neutral tones.
function toSeverity(severity: PersistedCampaignInsight['severity']): InsightSeverity {
  switch (severity) {
    case 'opportunity':
      return 'positive';
    case 'warning':
    case 'critical':
      return 'negative';
    default:
      return 'neutral';
  }
}

// The latest paid insights for the account, beside the top-ads table. Reuses the
// persisted campaign-insight history the leaderboard already joins.
export function PaidInsightsList({
  brandId,
  adAccountId,
}: {
  brandId: string;
  adAccountId: string | null;
}) {
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    if (!adAccountId) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    getLatestInsights({ brandId, adAccountId, limit: 12 })
      .then((insights) => {
        if (!cancelled) setState({ status: 'success', insights });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, adAccountId]);

  const items = useMemo<InsightListItem[]>(() => {
    if (state.status !== 'success') return [];
    return state.insights.map((insight, index) => ({
      id: `${insight.campaignId ?? 'account'}-${index}`,
      text: insight.title,
      severity: toSeverity(insight.severity),
      label: insight.campaignName ?? undefined,
      detail: insight.summary || insight.recommendation || undefined,
    }));
  }, [state]);

  return (
    <InsightsList
      title="Insights"
      items={items}
      maxHeight={DASHBOARD_PANEL_MAX_HEIGHT}
      headerAction={<ModuleShortcutLink href="/scale" label="Scale" />}
      isLoading={state.status === 'idle' || state.status === 'loading'}
      emptyState={
        state.status === 'error'
          ? "Couldn't load insights right now."
          : 'Insights appear as campaigns run.'
      }
    />
  );
}
