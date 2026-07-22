'use client';

import * as React from 'react';
import type { PaidMediaTimeRange } from '@/components/paid-media/dashboard/timeRange';
import type {
  CampaignInsightsResponse,
  ComputedInsight,
} from '@/lib/paid-media/account-insights.types';
import type { BudgetPacingEntry } from '@/lib/schemas/budgetPacing';

type UseCampaignInsightsParams = {
  brandId: string;
  adAccountId: string | null;
  campaignId: string | null;
  campaignName?: string;
  campaignObjective?: string;
  timeRange: PaidMediaTimeRange;
  enabled?: boolean;
};

type UseCampaignInsightsReturn = {
  insights: ComputedInsight[];
  generatedAt: string | null;
  expiresAt: string | null;
  pacing: BudgetPacingEntry | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

function buildRequestBody(params: UseCampaignInsightsParams) {
  const range =
    params.timeRange.preset === 'custom'
      ? {
          preset: 'custom' as const,
          since: params.timeRange.since,
          until: params.timeRange.until,
        }
      : { preset: params.timeRange.preset };

  return {
    brandId: params.brandId,
    adAccountId: params.adAccountId,
    campaignId: params.campaignId,
    campaignName: params.campaignName,
    campaignObjective: params.campaignObjective,
    range,
  };
}

function fmt(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function deriveBudgetInsights(pacing: BudgetPacingEntry): ComputedInsight[] {
  const insights: ComputedInsight[] = [];
  const budgetLabel = pacing.budgetType === 'daily' ? 'daily budget' : 'lifetime budget';

  if (pacing.paceStatus === 'overspending') {
    insights.push({
      category: 'budget',
      text: `Campaign is overspending at ${pacing.pacePct.toFixed(0)}% of target pace`,
      severity: 'negative',
      source: 'computed',
      metric: 'pace',
      value: pacing.pacePct,
      recommendation: 'Consider reducing daily budget or pausing underperforming ad sets',
    });

    const overspendAmt = pacing.projectedEndSpend - pacing.totalBudget;
    if (overspendAmt > 0) {
      insights.push({
        category: 'budget',
        text: `Projected to overspend by ${fmt(overspendAmt)} at current pace`,
        severity: 'negative',
        source: 'computed',
        metric: 'spend',
        value: overspendAmt,
      });
    }
  } else if (pacing.paceStatus === 'underspending') {
    const daysMsg =
      pacing.daysRemaining !== null
        ? ` with ${pacing.daysRemaining} day${pacing.daysRemaining !== 1 ? 's' : ''} remaining`
        : '';
    insights.push({
      category: 'budget',
      text: `Campaign is underspending at ${pacing.pacePct.toFixed(0)}% of target pace — ${fmt(pacing.budgetRemaining)} of ${budgetLabel} unspent${daysMsg}`,
      severity: 'neutral',
      source: 'computed',
      metric: 'pace',
      value: pacing.pacePct,
      recommendation: 'Consider increasing bids or expanding targeting to improve delivery',
    });
  } else {
    insights.push({
      category: 'budget',
      text: `Campaign is on pace at ${pacing.pacePct.toFixed(0)}% — ${fmt(pacing.budgetRemaining)} ${budgetLabel} remaining`,
      severity: 'positive',
      source: 'computed',
      metric: 'pace',
      value: pacing.pacePct,
    });
  }

  return insights;
}

export function useCampaignInsights(params: UseCampaignInsightsParams): UseCampaignInsightsReturn {
  const { brandId, adAccountId, campaignId, timeRange, enabled = true } = params;

  const [data, setData] = React.useState<CampaignInsightsResponse | null>(null);
  const [pacing, setPacing] = React.useState<BudgetPacingEntry | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshTick, setRefreshTick] = React.useState(0);

  const requestIdRef = React.useRef(0);

  const timeRangeKey =
    timeRange.preset === 'custom'
      ? `custom:${timeRange.since}:${timeRange.until}`
      : timeRange.preset;

  React.useEffect(() => {
    if (!enabled || !adAccountId || !campaignId) {
      setData(null);
      setPacing(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    const insightsController = new AbortController();
    const pacingController = new AbortController();

    const insightsFetch = fetch('/api/paid-media/campaign-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody({ brandId, adAccountId, campaignId, timeRange })),
      signal: insightsController.signal,
    }).then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).error ?? `Request failed with status ${response.status}`,
        );
      }
      return response.json() as Promise<CampaignInsightsResponse>;
    });

    const pacingFetch = fetch('/api/paid-media/budget-pacing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId, adAccountId }),
      signal: pacingController.signal,
    })
      .then(async (r) => {
        if (!r.ok) return null;
        const body = await r.json();
        const campaigns = (body?.campaigns ?? []) as BudgetPacingEntry[];
        return campaigns.find((c) => c.campaignId === campaignId) ?? null;
      })
      .catch(() => null);

    Promise.all([insightsFetch, pacingFetch])
      .then(([insightsResp, pacingEntry]) => {
        if (requestId !== requestIdRef.current) return;
        const budgetInsights = pacingEntry
          ? deriveBudgetInsights(pacingEntry).map((i) => ({
              ...i,
              campaign_id: campaignId ?? undefined,
            }))
          : [];
        const stampedInsights = insightsResp.insights.map((i) =>
          i.campaign_id ? i : { ...i, campaign_id: campaignId ?? undefined },
        );
        setData({
          ...insightsResp,
          insights: [...budgetInsights, ...stampedInsights],
        });
        setPacing(pacingEntry);
        setError(null);
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load campaign insights');
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      insightsController.abort();
      pacingController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, adAccountId, campaignId, timeRangeKey, enabled, refreshTick]);

  const refresh = React.useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  return {
    insights: data?.insights ?? [],
    generatedAt: data?.generated_at ?? null,
    expiresAt: data?.expires_at ?? null,
    pacing,
    isLoading,
    error,
    refresh,
  };
}
