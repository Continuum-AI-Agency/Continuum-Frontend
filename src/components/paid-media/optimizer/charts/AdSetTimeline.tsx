'use client';

// TradingView-style per-creative drill-in for one ad set: pick ONE metric and plot
// every creative as its own line on a shared axis, add/remove creatives from the
// plot, and hover any creative chip to open its deep-look card. This is where the
// chart hook meets the creatives — the finest paid grain (ad_daily_trends) charted
// directly, one metric at a time per the paid-media exploration doctrine. Empty
// until the ad set has a few days of per-creative delivery.

import type { AdDailyTrend, AdsetAd, PaidAdAngle } from '@continuum/contracts';
import { useMemo, useState } from 'react';
import { Area, AreaChart } from '@/components/charts/area-chart';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip';
import { XAxis } from '@/components/charts/x-axis';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { formatCpa, formatCurrency } from '../format';
import type { OptimizerAdMetric } from '../useOptimizerUrlState';
import { ChartEmpty } from './ChartStates';
import { CreativeHoverCard } from './CreativeHoverCard';
import { type AdMetric, mergeAdDailyByMetric } from './vizData';

const PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

const METRICS: { key: AdMetric; label: string }[] = [
  { key: 'spend', label: 'Spend' },
  { key: 'cpa', label: 'CPA' },
  { key: 'roas', label: 'ROAS' },
  { key: 'ctr', label: 'CTR' },
];

function formatMetric(metric: AdMetric, value: number, currency?: string | null): string {
  if (metric === 'spend') return formatCurrency(value, currency);
  if (metric === 'cpa') return formatCpa(value, currency);
  if (metric === 'roas') return `${value.toFixed(2)}×`;
  return `${value.toFixed(2)}%`;
}

type AdSetTimelineProps = {
  trends: AdDailyTrend[];
  ads?: AdsetAd[];
  angles?: PaidAdAngle[];
  currency?: string | null;
  metric?: OptimizerAdMetric;
  onMetricChange?: (metric: OptimizerAdMetric) => void;
};

function toUrlMetric(metric: AdMetric): OptimizerAdMetric {
  return metric === 'cpa' ? 'cost' : metric;
}

function fromUrlMetric(metric: OptimizerAdMetric | undefined): AdMetric {
  return metric === 'cost' ? 'cpa' : (metric ?? 'spend');
}

export function AdSetTimeline({
  trends,
  ads = [],
  angles = [],
  currency,
  metric: metricProp,
  onMetricChange,
}: AdSetTimelineProps) {
  const chartable = useMemo(() => trends.filter((trend) => trend.series.length >= 2), [trends]);
  const [localMetric, setLocalMetric] = useState<AdMetric>('spend');
  const metric = metricProp ? fromUrlMetric(metricProp) : localMetric;
  const [active, setActive] = useState<Set<string>>(
    () => new Set(chartable.slice(0, 5).map((trend) => trend.ad_id)),
  );

  const colorByAd = useMemo(() => {
    const map = new Map<string, string>();
    chartable.forEach((trend, index) => map.set(trend.ad_id, PALETTE[index % PALETTE.length]));
    return map;
  }, [chartable]);
  const adById = useMemo(() => new Map(ads.map((ad) => [ad.id, ad])), [ads]);
  const angleById = useMemo(() => new Map(angles.map((angle) => [angle.ad_id, angle])), [angles]);

  const activeTrends = chartable.filter((trend) => active.has(trend.ad_id));
  const { rows } = useMemo(
    () => mergeAdDailyByMetric(activeTrends, metric),
    [activeTrends, metric],
  );

  if (chartable.length === 0) {
    return (
      <ChartEmpty message="Per-creative trends appear once the ad set has a few days of delivery." />
    );
  }

  const nameFor = (adId: string): string => {
    const named = adById.get(adId)?.name ?? chartable.find((t) => t.ad_id === adId)?.ad_name;
    return named ?? adId;
  };
  const toggle = (adId: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(adId)) next.delete(adId);
      else next.add(adId);
      return next;
    });
  const selectMetric = (value: string) => {
    if (!METRICS.some((option) => option.key === value)) return;
    const next = value as AdMetric;
    setLocalMetric(next);
    onMetricChange?.(toUrlMetric(next));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          aria-label="Creative chart metric"
          className="justify-start rounded-md border border-border p-0.5"
          onValueChange={selectMetric}
          type="single"
          value={metric}
        >
          {METRICS.map((option) => (
            <ToggleGroupItem
              aria-label={`Show ${option.label}`}
              className="h-6 rounded px-2 text-xs data-[state=on]:bg-secondary data-[state=on]:text-foreground"
              key={option.key}
              value={option.key}
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="text-3xs text-muted-foreground">
          {active.size} of {chartable.length} creatives
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chartable.map((trend) => {
          const on = active.has(trend.ad_id);
          const ad = adById.get(trend.ad_id) ?? { id: trend.ad_id, name: trend.ad_name };
          return (
            <CreativeHoverCard
              ad={ad}
              angle={angleById.get(trend.ad_id)}
              currency={currency}
              key={trend.ad_id}
              trend={trend}
            >
              <button
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors',
                  on
                    ? 'border-border bg-card'
                    : 'border-border/60 border-dashed text-muted-foreground',
                )}
                onClick={() => toggle(trend.ad_id)}
                type="button"
              >
                <span
                  className="size-2 rounded-full"
                  style={{
                    background: on ? colorByAd.get(trend.ad_id) : 'var(--muted-foreground)',
                  }}
                />
                <span className="max-w-[128px] truncate">{nameFor(trend.ad_id)}</span>
              </button>
            </CreativeHoverCard>
          );
        })}
      </div>

      {rows.length >= 2 && activeTrends.length > 0 ? (
        <AreaChart
          aspectRatio="5 / 2"
          data={rows}
          margin={{ top: 12, right: 16, bottom: 26, left: 16 }}
          xDataKey="date"
        >
          <Grid horizontal />
          {activeTrends.map((trend) => (
            <Area
              dataKey={trend.ad_id}
              fill={colorByAd.get(trend.ad_id)}
              fillOpacity={0}
              key={trend.ad_id}
              stroke={colorByAd.get(trend.ad_id)}
              strokeWidth={2}
            />
          ))}
          <XAxis />
          <ChartTooltip
            rows={(point) =>
              activeTrends.map((trend) => ({
                color: colorByAd.get(trend.ad_id) ?? 'var(--chart-1)',
                label: nameFor(trend.ad_id),
                value:
                  typeof point[trend.ad_id] === 'number'
                    ? formatMetric(metric, point[trend.ad_id] as number, currency)
                    : '—',
              }))
            }
          />
        </AreaChart>
      ) : (
        <ChartEmpty message="Select at least one creative to plot." />
      )}
    </div>
  );
}
