'use client';

// The Portfolio-detail HERO: an objective-cost-over-cycles timeline that carries
// the whole story in one interaction. The cost line is engine-derived from
// spend/results and the bar layer shows relative spend volume; a dashed
// ProjectionLine continues the cost line toward the target (or
// the recent trend) with a hollow terminal marker at the actual→projected hand-off;
// pins on the axis mark cycles where the optimizer acted; and hovering any cycle
// opens a rich card with that cycle's cost + spend + results AND the actions
// taken — metrics and pinned events in one panel, the reference-screenshot pattern.

import { type CpaSeriesPoint, getOptimizationMetricDefinition } from '@continuum/contracts';
import { ZapIcon } from 'lucide-react';
import { useChartStable } from '@/components/charts/chart-context';
import { ComposedChart } from '@/components/charts/composed-chart';
import { Grid } from '@/components/charts/grid';
import { Line } from '@/components/charts/line';
import { LineSeriesTerminalMarker } from '@/components/charts/line-series-terminal-marker';
import { ProjectionLine } from '@/components/charts/projection-line';
import { SeriesBar } from '@/components/charts/series-bar';
import { ChartTooltip } from '@/components/charts/tooltip';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import { formatCpa, formatCurrency } from '../format';
import { confidenceBand as bandMeta } from '../reportModel';
import { ChartEmpty } from './ChartStates';
import {
  buildCpaHeroPoints,
  buildCpaProjection,
  type CpaHeroPoint,
  projectionEndpoint,
} from './vizData';

const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

type CpaHeroTimelineProps = {
  series: CpaSeriesPoint[];
  actionsByTs?: Record<string, string[]>;
  targetCpa?: number | null;
  currency?: string | null;
  confidenceBand?: string | null;
  objective?: string | null;
};

export function CpaHeroTimeline({
  series,
  actionsByTs = {},
  targetCpa,
  currency,
  confidenceBand,
  objective,
}: CpaHeroTimelineProps) {
  const metric = getOptimizationMetricDefinition(objective);
  const points = buildCpaHeroPoints(series, actionsByTs, metric.denominatorMultiplier);

  if (points.length < 2) {
    return (
      <ChartEmpty message={`The ${metric.costLabel} timeline appears after a few scored cycles.`} />
    );
  }

  const projection = buildCpaProjection(
    points.map((point) => ({ date: point.date, cpa: point.cpa })),
    { targetCpa },
  );
  const hasProjection = projection.length >= 2;
  const last = points.at(-1)?.cpa ?? null;
  const projectedEnd = projectionEndpoint(projection);
  const band = bandMeta(confidenceBand);

  return (
    <div className="space-y-2">
      {hasProjection && last != null && projectedEnd != null ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Projected {metric.costLabel}{' '}
            <span className="font-data font-medium text-foreground tabular-nums">
              {formatCpa(last, currency)} → {formatCpa(projectedEnd, currency)}
            </span>
          </span>
          <span
            className="text-3xs uppercase tracking-wide"
            style={{ color: projectedEnd <= last ? 'var(--success)' : 'var(--warning)' }}
          >
            {band.label.toLowerCase()} confidence
          </span>
        </div>
      ) : null}

      <ComposedChart
        aspectRatio="5 / 2"
        data={points}
        margin={{ top: 16, right: 18, bottom: 26, left: 52 }}
        xDataKey="date"
      >
        <Grid horizontal />
        <SeriesBar dataKey="spendIndex" fill="var(--chart-1)" radius={3} />
        <Line dataKey="cpa" stroke="var(--chart-2)" strokeWidth={2.5} />
        {hasProjection ? (
          <>
            <ProjectionLine
              curveKind="bezier"
              data={projection}
              showEndMarker
              stroke="var(--chart-4)"
              strokeDasharray="6,4"
            />
            <LineSeriesTerminalMarker dataKey="cpa" radius={5} stroke="var(--chart-2)" />
          </>
        ) : null}
        <CycleActionPins points={points} />
        <XAxis />
        <YAxis formatValue={(value) => formatCpa(value, currency)} numTicks={4} />
        <ChartTooltip
          content={({ point }) => (
            <HeroTooltip
              costLabel={metric.costLabel}
              currency={currency}
              point={point as unknown as CpaHeroPoint}
              resultLabel={metric.resultLabel}
            />
          )}
          indicatorColor="var(--chart-2)"
          matchCrosshair
        />
      </ComposedChart>

      <HeroLegend costLabel={metric.costLabel} hasProjection={hasProjection} />
    </div>
  );
}

/** Axis pins at cycles where the optimizer acted — a custom indicator drawn in the
 *  plot coordinate space via the chart's own xScale (so it stays aligned under any
 *  resize). The details live in the hover card; the pin is the affordance. */
function CycleActionPins({ points }: { points: CpaHeroPoint[] }) {
  const { xScale, innerHeight } = useChartStable();

  return (
    <g>
      {points.map((point) => {
        if (point.actions.length === 0) return null;
        const x = xScale(point.date) ?? 0;
        return (
          <g key={point.ts} transform={`translate(${x}, 0)`}>
            <line
              stroke="var(--chart-4)"
              strokeDasharray="2,3"
              strokeOpacity={0.3}
              x1={0}
              x2={0}
              y1={0}
              y2={innerHeight}
            />
            <circle
              cx={0}
              cy={innerHeight}
              fill="var(--chart-marker-background)"
              r={4}
              stroke="var(--chart-4)"
              strokeWidth={1.5}
            />
          </g>
        );
      })}
    </g>
  );
}

function HeroTooltip({
  point,
  currency,
  costLabel,
  resultLabel,
}: {
  point: CpaHeroPoint;
  currency?: string | null;
  costLabel: string;
  resultLabel: string;
}) {
  return (
    <div className="min-w-[184px] space-y-2 p-1">
      <div className="text-3xs text-muted-foreground uppercase tracking-wide">
        {point.date instanceof Date ? dayFmt.format(point.date) : ''}
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-xs text-muted-foreground">{costLabel}</span>
        <span className="font-data font-semibold text-base text-foreground tabular-nums">
          {formatCpa(point.cpa, currency)}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
        <span>spend {formatCurrency(point.spend, currency)}</span>
        <span>
          {Math.round(point.conv)} {resultLabel.toLowerCase()}
        </span>
      </div>
      {point.actions.length > 0 ? (
        <div className="space-y-1 border-border/60 border-t pt-1.5">
          {point.actions.map((action) => (
            <div className="flex items-center gap-1.5 text-xs" key={action}>
              <ZapIcon
                aria-hidden="true"
                className="size-3 shrink-0"
                style={{ color: 'var(--chart-4)' }}
              />
              <span className="text-foreground">{action}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HeroLegend({ hasProjection, costLabel }: { hasProjection: boolean; costLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-3xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full" style={{ background: 'var(--chart-2)' }} />
        {costLabel} (actual)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2 w-3 rounded-sm"
          style={{ background: 'color-mix(in srgb, var(--chart-1) 45%, transparent)' }}
        />
        Spend volume
      </span>
      {hasProjection ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-0 w-4 border-t-2 border-dashed"
            style={{ borderColor: 'var(--chart-4)' }}
          />
          Projected
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full border" style={{ borderColor: 'var(--chart-4)' }} />
        Optimizer action
      </span>
    </div>
  );
}
