'use client';

import * as React from 'react';
import type { PaidMediaTimeRange } from '@/components/paid-media/dashboard/timeRange';
import type {
  AccountInsightsResponse,
  ComputedInsight,
} from '@/lib/paid-media/account-insights.types';
import type { BudgetPacingResponse } from '@/lib/schemas/budgetPacing';

type UseAccountInsightsParams = {
  brandId: string;
  adAccountId: string | null;
  timeRange: PaidMediaTimeRange;
  enabled?: boolean;
};

type UseAccountInsightsReturn = {
  insights: ComputedInsight[];
  generatedAt: string | null;
  expiresAt: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

function buildRequestBody(params: UseAccountInsightsParams) {
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
    range,
  };
}

function fmt(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function deriveBudgetInsights(pacing: BudgetPacingResponse): ComputedInsight[] {
  const insights: ComputedInsight[] = [];
  const { summary, campaigns } = pacing;

  const statusLabel =
    summary.paceStatus === 'on_pace'
      ? 'on pace'
      : summary.paceStatus === 'overspending'
        ? 'overspending'
        : 'underspending';

  insights.push({
    category: 'budget',
    text: `Account is ${statusLabel} at ${summary.overallPacePct.toFixed(0)}% — ${fmt(summary.totalBudgetRemaining)} of ${fmt(summary.totalBudget)} total budget remaining`,
    severity:
      summary.paceStatus === 'on_pace'
        ? 'positive'
        : summary.paceStatus === 'overspending'
          ? 'negative'
          : 'neutral',
    source: 'computed',
    metric: 'pace',
    value: summary.overallPacePct,
  });

  const overspending = campaigns.filter((c) => c.paceStatus === 'overspending');
  if (overspending.length > 0) {
    const names = overspending
      .slice(0, 3)
      .map((c) => c.campaignName)
      .join(', ');
    const extra = overspending.length > 3 ? ` +${overspending.length - 3} more` : '';
    insights.push({
      category: 'budget',
      text: `${overspending.length} campaign${overspending.length !== 1 ? 's' : ''} overspending: ${names}${extra}`,
      severity: 'negative',
      source: 'computed',
      metric: 'spend',
      recommendation: 'Review and adjust budgets for overspending campaigns',
    });
  }

  const underspending = campaigns.filter((c) => c.paceStatus === 'underspending');
  if (underspending.length > 0) {
    insights.push({
      category: 'budget',
      text: `${underspending.length} campaign${underspending.length !== 1 ? 's' : ''} underspending`,
      severity: 'neutral',
      source: 'computed',
      metric: 'spend',
      recommendation:
        'Consider increasing bids or expanding targeting for underdelivering campaigns',
    });
  }

  return insights;
}

export function useAccountInsights(params: UseAccountInsightsParams): UseAccountInsightsReturn {
  const { brandId, adAccountId, timeRange, enabled = true } = params;

  const [data, setData] = React.useState<AccountInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshTick, setRefreshTick] = React.useState(0);

  const requestIdRef = React.useRef(0);

  const timeRangeKey =
    timeRange.preset === 'custom'
      ? `custom:${timeRange.since}:${timeRange.until}`
      : timeRange.preset;

  React.useEffect(() => {
    if (!enabled || !adAccountId) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    const insightsController = new AbortController();
    const pacingController = new AbortController();

    const insightsFetch = fetch('/api/paid-media/account-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody({ brandId, adAccountId, timeRange })),
      signal: insightsController.signal,
    }).then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).error ?? `Request failed with status ${response.status}`,
        );
      }
      return response.json() as Promise<AccountInsightsResponse>;
    });

    const pacingFetch = fetch('/api/paid-media/budget-pacing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId, adAccountId }),
      signal: pacingController.signal,
    })
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json() as Promise<BudgetPacingResponse>;
      })
      .catch(() => null);

    Promise.all([insightsFetch, pacingFetch])
      .then(([insightsResp, pacingResp]) => {
        if (requestId !== requestIdRef.current) return;
        const budgetInsights = pacingResp ? deriveBudgetInsights(pacingResp) : [];
        setData({
          ...insightsResp,
          insights: [...insightsResp.insights, ...budgetInsights],
        });
        setError(null);
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load insights');
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
  }, [brandId, adAccountId, timeRangeKey, enabled, refreshTick]);

  const refresh = React.useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  return {
    insights: data?.insights ?? [],
    generatedAt: data?.generated_at ?? null,
    expiresAt: data?.expires_at ?? null,
    isLoading,
    error,
    refresh,
  };
}
