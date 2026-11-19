'use client';

import {
  BarChart3Icon,
  MousePointerClickIcon,
  RotateCw,
  TrendingUpIcon,
  WalletIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { UiLocale } from '@/i18n/config';
import { useUiErrorMessage } from '@/i18n/errors';
import { formatDecimal } from '@/lib/format/decimal';
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

function formatCurrency(value: number, locale: UiLocale = 'en'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

type LinkedInCopy = ReturnType<typeof useTranslations<'scale'>>;
function formatDelta(value: number | undefined, locale: UiLocale, translate: LinkedInCopy): string {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return translate('linkedin_no_baseline');
  return translate('linkedin_delta', {
    value: (value > 0 ? '+' : '') + formatDecimal(value, 1, locale),
  });
}

function chooseEfficiencyLine(
  metrics: Metrics,
  comparison: PaidMetricsComparison | undefined,
  locale: UiLocale,
  translate: LinkedInCopy,
): string {
  if (metrics.roas > 0)
    return translate('linkedin_roas', {
      value: formatDecimal(metrics.roas, 2, locale),
      delta: formatDelta(comparison?.roas?.percentageChange, locale, translate),
    });
  if (metrics.cpc > 0)
    return translate('linkedin_cpc', {
      value: formatCurrency(metrics.cpc, locale),
      delta: formatDelta(comparison?.cpc?.percentageChange, locale, translate),
    });
  return translate('linkedin_efficiency_wait');
}

function chooseVolumeLine(
  metrics: Metrics,
  comparison: PaidMetricsComparison | undefined,
  locale: UiLocale,
  translate: LinkedInCopy,
): string {
  return translate('linkedin_volume', {
    impressions: metrics.impressions,
    clicks: metrics.clicks,
    ctr: formatDecimal(metrics.ctr, 2, locale),
    delta: formatDelta(comparison?.ctr?.percentageChange, locale, translate),
  });
}

function chooseSpendLine(
  metrics: Metrics,
  comparison: PaidMetricsComparison | undefined,
  locale: UiLocale,
  translate: LinkedInCopy,
): string {
  return translate('linkedin_spend', {
    value: formatCurrency(metrics.spend, locale),
    delta: formatDelta(comparison?.spend?.percentageChange, locale, translate),
  });
}

function trendLine(trends: PaidMetricsPayload['trends'], translate: LinkedInCopy): string {
  if (!trends || trends.length < 2) return translate('linkedin_trend_wait');
  const delta = (trends.at(-1)?.clicks ?? 0) - (trends[0].clicks ?? 0);
  return translate(
    delta > 0 ? 'linkedin_trend_up' : delta < 0 ? 'linkedin_trend_down' : 'linkedin_trend_flat',
  );
}

export function LinkedInInsightsPanel({
  brandId,
  adAccountId,
  campaignId,
  campaignName,
  timeRange,
}: LinkedInInsightsPanelProps) {
  const uiLocale = useLocale();
  const formatUiError = useUiErrorMessage();
  const fetchErrorRef = React.useRef(formatUiError);
  fetchErrorRef.current = formatUiError;
  const uiText = useTranslations('scale');
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
      setError(fetchErrorRef.current(err));
      setPayload(null);
    } finally {
      setIsLoading(false);
    }
  }, [adAccountId, brandId, campaignId, range]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const title = uiText('dashboardLinkedInTitle', { scope: campaignId ? 'campaign' : 'account' });
  const context = campaignId && campaignName ? campaignName : uiText('dashboardAccountOverview');
  const cards = payload
    ? [
        {
          title: uiText('spend_85f3d55'),
          icon: WalletIcon,
          body: chooseSpendLine(payload.metrics, payload.comparison, uiLocale, uiText),
        },
        {
          title: uiText('traffic_4876efb'),
          icon: MousePointerClickIcon,
          body: chooseVolumeLine(payload.metrics, payload.comparison, uiLocale, uiText),
        },
        {
          title: uiText('efficiency_87b180c'),
          icon: TrendingUpIcon,
          body: chooseEfficiencyLine(payload.metrics, payload.comparison, uiLocale, uiText),
        },
        {
          title: uiText('trend_9e21771'),
          icon: BarChart3Icon,
          body: trendLine(payload.trends, uiText),
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
            <RotateCw className={isLoading ? 'size-3.5 animate-spin' : 'size-3.5'} />
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
                    <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary-ink">
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
