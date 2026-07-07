'use client';

// CPA-over-cycles trend as a BKLit area chart. CPA per point is derived the same
// way the engine does — spend / conversions on the trailing 7-day window
// (deriveCpa) — so the number matches what agents/MCP report (nothing lies). The
// header carries the latest CPA + period delta; the area carries the shape.
// Empty until at least two scored cycles exist.

import type { CpaSeriesPoint } from '@continuum/contracts';
import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react';

import { Area, AreaChart } from '@/components/charts/area-chart';
import { formatCpa } from '../format';
import { buildCpaTrendPoints, cpaTrendSummary } from './chartData';

type CpaTrendChartProps = {
  series: CpaSeriesPoint[];
  currency?: string | null;
};

export function CpaTrendChart({ series, currency }: CpaTrendChartProps) {
  const points = buildCpaTrendPoints(series);
  const summary = cpaTrendSummary(points);

  if (!summary) {
    return (
      <div className="grid h-[70px] place-items-center rounded-lg border border-dashed border-border/60 bg-muted/10 text-xs text-muted-foreground">
        CPA trend appears after a few scored cycles.
      </div>
    );
  }

  const { last, deltaPct } = summary;
  const improving = deltaPct <= 0; // lower CPA is better

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">CPA trend · {points.length} cycles</span>
        <span
          className={
            improving
              ? 'inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400'
              : 'inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400'
          }
        >
          {improving ? (
            <TrendingDownIcon className="size-3.5" />
          ) : (
            <TrendingUpIcon className="size-3.5" />
          )}
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
