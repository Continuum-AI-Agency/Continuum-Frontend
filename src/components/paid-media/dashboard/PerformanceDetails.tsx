'use client';

import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { paidDeltaIsGood } from '@/components/paid-media/metricDelta';
import type { UiLocale } from '@/i18n/config';
import { formatDecimal } from '@/lib/format/decimal';
import { cn } from '@/lib/utils';
import type { DailyMetric } from '@/types/timeline';

export type PaidMetricsComparison = Record<
  string,
  {
    current: number;
    previous: number;
    percentageChange: number;
  }
>;

/** `cpa` is null on a day the Google edge could name no single result for. */
export type PaidMetricsTrendPoint = Omit<DailyMetric, 'cpa'> & {
  cpa?: number | null;
};

type PerformanceDetailsProps = {
  comparison?: PaidMetricsComparison;
  trends?: PaidMetricsTrendPoint[];
  className?: string;
};

function formatCurrency(value: number, locale: UiLocale = 'en'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, locale: UiLocale = 'en'): string {
  return new Intl.NumberFormat(locale).format(value);
}

function formatPercent(value: number, locale: UiLocale = 'en'): string {
  const normalized = formatDecimal(Math.abs(value), 1, locale);
  return `${value >= 0 ? '+' : '-'}${normalized}%`;
}

function renderMetricValue(metricKey: string, value: number, locale: UiLocale = 'en'): string {
  if (metricKey === 'spend' || metricKey === 'cpc' || metricKey === 'cpa') {
    return formatCurrency(value, locale);
  }

  if (metricKey === 'roas') {
    return formatDecimal(value, 2, locale);
  }

  if (metricKey === 'ctr') {
    return `${formatDecimal(value, 2, locale)}%`;
  }

  return formatNumber(value, locale);
}

function TrendSparkline({
  label,
  values,
  color,
  valueFormatter,
}: {
  label: string;
  values: Array<{ date: string; value: number }>;
  color: string;
  valueFormatter: (value: number) => string;
}) {
  const uiLocale = useLocale();
  if (values.length < 2) {
    return null;
  }

  const latest = values[values.length - 1].value;

  return (
    <div className="rounded-md border bg-background px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{valueFormatter(latest)}</span>
      </div>
      <div className="h-16 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={values}>
            <XAxis dataKey="date" hide />
            <Tooltip
              labelFormatter={(value) =>
                new Date(String(value)).toLocaleDateString(uiLocale, {
                  month: 'short',
                  day: 'numeric',
                })
              }
              formatter={(value) => valueFormatter(Number(value))}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PerformanceDetails({ comparison, trends, className }: PerformanceDetailsProps) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const COMPARISON_LABELS: Record<string, string> = useMemo(
    () => ({
      spend: uiText('spend_85f3d55'),
      roas: uiText('roas_b81bd97'),
      ctr: uiText('ctr_07fce34'),
      cpc: 'CPC',
      cpa: 'CPA',
      impressions: uiText('impr_e23373c'),
      clicks: uiText('clicks_921fc98'),
    }),
    [uiText],
  );

  const comparisonEntries = React.useMemo(
    () => Object.entries(comparison ?? {}).filter(([metricKey]) => metricKey in COMPARISON_LABELS),
    [comparison],
  );
  const latestTrend = trends && trends.length > 0 ? trends[trends.length - 1] : null;
  const spendTrend = (trends ?? [])
    .map((point) =>
      typeof point.spend === 'number' ? { date: point.date, value: point.spend } : null,
    )
    .filter((point): point is { date: string; value: number } => Boolean(point));
  const roasTrend = (trends ?? [])
    .map((point) =>
      typeof point.roas === 'number' ? { date: point.date, value: point.roas } : null,
    )
    .filter((point): point is { date: string; value: number } => Boolean(point));
  const latestSpend = typeof latestTrend?.spend === 'number' ? latestTrend.spend : 0;
  const latestRoas = typeof latestTrend?.roas === 'number' ? latestTrend.roas : 0;
  const latestRows = (trends ?? []).slice(-3);

  if (
    comparisonEntries.length === 0 &&
    !latestTrend &&
    spendTrend.length < 2 &&
    roasTrend.length < 2
  ) {
    return null;
  }

  return (
    <div className={cn('rounded-md border bg-muted/20 p-3', className)}>
      {comparisonEntries.length > 0 ? (
        <div className="mb-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {comparisonEntries.map(([metricKey, metric]) => (
            <div key={metricKey} className="rounded-md border bg-background px-2 py-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{COMPARISON_LABELS[metricKey]}</span>
                <span
                  className={
                    // Not the sign: CPC and CPA are in this grid, and a cost that FELL is
                    // the good outcome — it used to render destructive-red here.
                    paidDeltaIsGood(metricKey, metric.percentageChange)
                      ? 'text-emerald-600'
                      : 'text-destructive'
                  }
                >
                  {formatPercent(metric.percentageChange, uiLocale)}
                </span>
              </div>
              <div className="mt-1 font-medium">
                {renderMetricValue(metricKey, metric.current, uiLocale)}
                <span className="ml-1 text-muted-foreground">
                  {uiText.rich('sentence_55598276e7f9', {
                    v0: renderMetricValue(metricKey, metric.previous, uiLocale),
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {latestTrend ? (
        <div className="text-xs text-muted-foreground">
          {uiText.rich('sentence_caa8ec6a9592', {
            date: new Date(latestTrend.date).toLocaleDateString(uiLocale, {
              month: 'short',
              day: 'numeric',
            }),
            spend: formatCurrency(latestSpend, uiLocale),
            roas: formatDecimal(latestRoas, 2, uiLocale),
            hasImpressions: typeof latestTrend.impressions === 'number' ? 'yes' : 'no',
            impressions: formatNumber(latestTrend.impressions ?? 0, uiLocale),
            hasClicks: typeof latestTrend.clicks === 'number' ? 'yes' : 'no',
            clicks: formatNumber(latestTrend.clicks ?? 0, uiLocale),
          })}
        </div>
      ) : null}

      {spendTrend.length >= 2 || roasTrend.length >= 2 ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <TrendSparkline
            label={uiText('spend_85f3d55')}
            values={spendTrend}
            color="#3b82f6"
            valueFormatter={(value) => formatCurrency(value, uiLocale)}
          />
          <TrendSparkline
            label={uiText('roas_b81bd97')}
            values={roasTrend}
            color="#10b981"
            valueFormatter={(value) => value.toFixed(2)}
          />
        </div>
      ) : null}

      {latestRows.length > 0 ? (
        <div className="mt-2 rounded-md border bg-background p-2">
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            {uiText('latest_data_points_333ca6b')}
          </div>
          <div className="space-y-1 text-xs">
            {latestRows.map((row) => (
              <div key={row.date} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {new Date(row.date).toLocaleDateString(uiLocale, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span>
                  {uiText.rich('sentence_698d60ec588e', {
                    v0: formatCurrency(row.spend ?? 0, uiLocale),
                  })}
                </span>
                <span>
                  {uiText.rich('sentence_acdedbe97989', {
                    v0: formatDecimal(row.roas ?? 0, 2, uiLocale),
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
