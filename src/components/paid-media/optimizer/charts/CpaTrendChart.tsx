'use client';

// CPA-over-cycles trend as a BKLit area chart. CPA per point is derived the same
// way the engine does — spend / conversions on the trailing 7-day window
// (deriveCpa) — so the number matches what agents/MCP report (nothing lies). The
// header carries the latest CPA + period delta; the area carries the shape.
// Empty until at least two scored cycles exist.
//
// CPA is inverted — LOWER is better — so the delta uses the semantic success/
// warning tokens directly (falling CPA = success) rather than DeltaBadge, whose
// up-is-good arrow/color would mislabel a falling CPA.

import { type CpaSeriesPoint, getOptimizationMetricDefinition } from '@continuum/contracts';
import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react';

import { Area, AreaChart } from '@/components/charts/area-chart';
import { cn } from '@/lib/utils';
import { formatCpa } from '../format';
import { ChartEmpty } from './ChartStates';
import { buildCpaTrendPoints, cpaTrendSummary } from './chartData';

type CpaTrendChartProps = {
  series: CpaSeriesPoint[];
  currency?: string | null;
  objective?: string | null;
};

export function CpaTrendChart({ series, currency, objective }: CpaTrendChartProps) {
  const metric = getOptimizationMetricDefinition(objective);
  const points = buildCpaTrendPoints(series, metric.denominatorMultiplier);
  const summary = cpaTrendSummary(points);

  if (!summary) {
    return <ChartEmpty message={`${metric.costLabel} trend appears after a few scored cycles.`} />;
  }

  const { last, deltaPct } = summary;
  const improving = deltaPct <= 0; // lower CPA is better
  const TrendIcon = improving ? TrendingDownIcon : TrendingUpIcon;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {metric.costLabel} trend · {points.length} cycles
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium tabular-nums',
            improving ? 'text-success' : 'text-warning',
          )}
        >
          <TrendIcon className="size-3.5" aria-hidden="true" />
          {Math.abs(deltaPct)}% · {formatCpa(last, currency)}
        </span>
      </div>
      <AreaChart
        data={points}
        xDataKey="date"
        aspectRatio="5 / 1"
        margin={{ top: 8, right: 6, bottom: 8, left: 6 }}
      >
        <Area dataKey="cpa" strokeWidth={2} />
      </AreaChart>
    </div>
  );
}
