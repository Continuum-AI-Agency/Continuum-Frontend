import { useLocale, useTranslations } from 'next-intl';
import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { UiLocale } from '@/i18n/config';
import { formatDecimal } from '@/lib/format/decimal';

import type { DailyMetric } from '@/types/timeline';

interface TimelineCampaignInsightsProps {
  metricsDaily?: DailyMetric[];
  label?: string;
}

function formatCurrency(value: number, locale: UiLocale = 'en'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number, locale: UiLocale = 'en'): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function TimelineCampaignInsights({
  metricsDaily = [],
  label,
}: TimelineCampaignInsightsProps) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const chartData = useMemo(() => {
    return metricsDaily
      .filter((metric) => metric.date)
      .map((metric) => ({
        date: metric.date,
        spend: metric.spend ?? 0,
        roas: metric.roas ?? 0,
        clicks: metric.clicks ?? 0,
        impressions: metric.impressions ?? 0,
      }));
  }, [metricsDaily]);

  const latest = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const singlePointDot = chartData.length === 1 ? { r: 3 } : false;

  if (chartData.length === 0) {
    return (
      <div className="border-b border-border bg-background/70 px-4 py-3 text-xs text-muted-foreground">
        {uiText('no_daily_trend_data_available_for_this_campai_d297881')}
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-background/70 px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        <span className="font-medium text-foreground">
          {label ?? uiText('campaignTrendsLabel')}
        </span>
        {latest ? (
          <>
            <span className="text-muted-foreground">
              {uiText.rich('sentence_9668e3eba7b8', {
                v0: formatCurrency(latest.spend, uiLocale),
              })}
            </span>
            <span className="text-muted-foreground">
              {uiText.rich('sentence_2bc50bbbb41a', {
                v0: formatDecimal(latest.roas, 2, uiLocale),
              })}
            </span>
            <span className="text-muted-foreground">
              {uiText.rich('sentence_e3e84765a08d', {
                v0: formatNumber(latest.clicks, uiLocale),
              })}
            </span>
          </>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="h-28 rounded-md border border-border bg-background p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Tooltip
                labelFormatter={(label) =>
                  new Date(String(label)).toLocaleDateString(uiLocale, {
                    month: 'short',
                    day: 'numeric',
                  })
                }
                formatter={(value) => formatCurrency(Number(value), uiLocale)}
              />
              <Line
                type="monotone"
                dataKey="spend"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={singlePointDot}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="h-28 rounded-md border border-border bg-background p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Tooltip
                labelFormatter={(label) =>
                  new Date(String(label)).toLocaleDateString(uiLocale, {
                    month: 'short',
                    day: 'numeric',
                  })
                }
                formatter={(value) => Number(value).toFixed(2)}
              />
              <Line
                type="monotone"
                dataKey="roas"
                stroke="#10b981"
                strokeWidth={2}
                dot={singlePointDot}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
