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

import type { DailyMetric } from '@/types/timeline';

interface TimelineCampaignInsightsProps {
  metricsDaily?: DailyMetric[];
  label?: string;
}

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

export function TimelineCampaignInsights({
  metricsDaily = [],
  label = 'Campaign trends',
}: TimelineCampaignInsightsProps) {
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
        No daily trend data available for this campaign yet.
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-background/70 px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        <span className="font-medium text-foreground">{label}</span>
        {latest ? (
          <>
            <span className="text-muted-foreground">
              Latest spend: {formatCurrency(latest.spend)}
            </span>
            <span className="text-muted-foreground">Latest ROAS: {latest.roas.toFixed(2)}</span>
            <span className="text-muted-foreground">Clicks: {formatNumber(latest.clicks)}</span>
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
                  new Date(String(label)).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })
                }
                formatter={(value) => formatCurrency(Number(value))}
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
                  new Date(String(label)).toLocaleDateString('en-US', {
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
