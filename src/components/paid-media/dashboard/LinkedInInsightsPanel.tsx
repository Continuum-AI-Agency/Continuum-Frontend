'use client';

import { ReloadIcon } from '@radix-ui/react-icons';
import { BarChart3Icon, MousePointerClickIcon, TrendingUpIcon, WalletIcon } from 'lucide-react';
import * as React from 'react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { PaidMetricsComparison } from './PerformanceDetails';
import { type PaidMediaTimeRange, toMetricsRange } from './timeRange';

type LinkedInInsightsPanelProps = {
  brandId: string;
  adAccountId: string;
  campaignId?: string;
  campaignName?: string;
  timeRange: PaidMediaTimeRange;
};

type Metrics = {
  spend: number;
  roas: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpa: number;
};

type PaidMetricsPayload = {
  metrics: Metrics;
  comparison?: PaidMetricsComparison;
  trends?: Array<Metrics & { date: string }>;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDelta(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'no prior-window baseline';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}% vs prior window`;
}

function chooseEfficiencyLine(metrics: Metrics, comparison?: PaidMetricsComparison): string {
  if (metrics.roas > 0) {
    return `ROAS is ${metrics.roas.toFixed(2)} with ${formatDelta(comparison?.roas?.percentageChange)}.`;
  }
  if (metrics.cpc > 0) {
    return `Average CPC is ${formatCurrency(metrics.cpc)} with ${formatDelta(comparison?.cpc?.percentageChange)}.`;
  }
  return 'Efficiency is waiting on enough click or conversion volume to calculate a stable read.';
}

function chooseVolumeLine(metrics: Metrics, comparison?: PaidMetricsComparison): string {
  return `${formatNumber(metrics.impressions)} impressions and ${formatNumber(metrics.clicks)} clicks generated a ${metrics.ctr.toFixed(2)}% CTR, ${formatDelta(comparison?.ctr?.percentageChange)}.`;
}

function chooseSpendLine(metrics: Metrics, comparison?: PaidMetricsComparison): string {
  return `${formatCurrency(metrics.spend)} spent in this window, ${formatDelta(comparison?.spend?.percentageChange)}.`;
}

function trendLine(trends: PaidMetricsPayload['trends']): string {
  if (!trends || trends.length < 2) {
    return 'Trend hydration is active; more daily rows are needed before a directional read is useful.';
  }
  const first = trends[0];
  const last = trends[trends.length - 1];
  const clickDelta = (last.clicks ?? 0) - (first.clicks ?? 0);
  if (clickDelta > 0) return 'Daily click volume is rising across the selected window.';
  if (clickDelta < 0) return 'Daily click volume is softening across the selected window.';
  return 'Daily click volume is flat across the selected window.';
}

export function LinkedInInsightsPanel({
  brandId,
  adAccountId,
  campaignId,
  campaignName,
  timeRange,
}: LinkedInInsightsPanelProps) {
  const [payload, setPayload] = React.useState<PaidMetricsPayload | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const range = React.useMemo(() => toMetricsRange(timeRange), [timeRange]);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/paid-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'linkedin',
          scope: campaignId ? 'campaign' : 'account_overview',
          brandId,
          accountId: adAccountId,
          campaignId,
          range,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string' ? body.error : 'Failed to load LinkedIn insights',
        );
      }
      setPayload((await response.json()) as PaidMetricsPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load LinkedIn insights');
      setPayload(null);
    } finally {
      setIsLoading(false);
    }
  }, [adAccountId, brandId, campaignId, range]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const title = campaignId ? 'LinkedIn Campaign Insights' : 'LinkedIn Account Insights';
  const context = campaignId && campaignName ? campaignName : 'Account overview';
  const cards = payload
    ? [
        {
          title: 'Spend',
          icon: WalletIcon,
          body: chooseSpendLine(payload.metrics, payload.comparison),
        },
        {
          title: 'Traffic',
          icon: MousePointerClickIcon,
          body: chooseVolumeLine(payload.metrics, payload.comparison),
        },
        {
          title: 'Efficiency',
          icon: TrendingUpIcon,
          body: chooseEfficiencyLine(payload.metrics, payload.comparison),
        },
        {
          title: 'Trend',
          icon: BarChart3Icon,
          body: trendLine(payload.trends),
        },
      ]
    : [];

  return (
    <Card className="overflow-hidden border-border/70">
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            <BarChart3Icon className="size-4 text-muted-foreground" />
            {title}
          </span>
        }
        meta={
          <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/60">
            {context}
          </span>
        }
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={load}
            disabled={isLoading}
          >
            <ReloadIcon className={isLoading ? 'size-3.5 animate-spin' : 'size-3.5'} />
          </Button>
        }
      />
      <CardContent className="p-2">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : isLoading && !payload ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={`linkedin-insight-skeleton-${index}`} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : payload ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.title} className="rounded-lg border border-border/70 bg-card p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                      <Icon className="size-3.5" />
                    </span>
                    {card.title}
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{card.body}</p>
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
