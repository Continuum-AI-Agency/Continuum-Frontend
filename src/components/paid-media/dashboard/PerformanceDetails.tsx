'use client';

import * as React from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
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

export type PaidMetricsTrendPoint = DailyMetric;

type PerformanceDetailsProps = {
  comparison?: PaidMetricsComparison;
  trends?: PaidMetricsTrendPoint[];
  className?: string;
};

const COMPARISON_LABELS: Record<string, string> = {
  spend: 'Spend',
  roas: 'ROAS',
  ctr: 'CTR',
  cpc: 'CPC',
  cpa: 'CPA',
  impressions: 'Impr.',
  clicks: 'Clicks',
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPercent(value: number): string {
  const normalized = Math.abs(value).toFixed(1);
  return `${value >= 0 ? '+' : '-'}${normalized}%`;
}

function renderMetricValue(metricKey: string, value: number): string {
  if (metricKey === 'spend' || metricKey === 'cpc' || metricKey === 'cpa') {
    return formatCurrency(value);
  }

  if (metricKey === 'roas') {
    return value.toFixed(2);
  }

  if (metricKey === 'ctr') {
    return `${value.toFixed(2)}%`;
  }

  return formatNumber(value);
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
                new Date(String(value)).toLocaleDateString('en-US', {
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
                  className={metric.percentageChange >= 0 ? 'text-emerald-600' : 'text-destructive'}
                >
                  {formatPercent(metric.percentageChange)}
                </span>
              </div>
              <div className="mt-1 font-medium">
                {renderMetricValue(metricKey, metric.current)}
                <span className="ml-1 text-muted-foreground">
                  vs {renderMetricValue(metricKey, metric.previous)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {latestTrend ? (
        <div className="text-xs text-muted-foreground">
          Latest trend (
          {new Date(latestTrend.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
          ): Spend {formatCurrency(latestSpend)}, ROAS {latestRoas.toFixed(2)}
          {typeof latestTrend.impressions === 'number'
            ? `, Impr. ${formatNumber(latestTrend.impressions)}`
            : ''}
          {typeof latestTrend.clicks === 'number'
            ? `, Clicks ${formatNumber(latestTrend.clicks)}`
            : ''}
        </div>
      ) : null}

      {spendTrend.length >= 2 || roasTrend.length >= 2 ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <TrendSparkline
            label="Spend"
            values={spendTrend}
            color="#3b82f6"
            valueFormatter={(value) => formatCurrency(value)}
          />
          <TrendSparkline
            label="ROAS"
            values={roasTrend}
            color="#10b981"
            valueFormatter={(value) => value.toFixed(2)}
          />
        </div>
      ) : null}

      {latestRows.length > 0 ? (
        <div className="mt-2 rounded-md border bg-background p-2">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Latest data points</div>
          <div className="space-y-1 text-xs">
            {latestRows.map((row) => (
              <div key={row.date} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {new Date(row.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span>Spend {formatCurrency(row.spend ?? 0)}</span>
                <span>ROAS {(row.roas ?? 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
