'use client';

// The Portfolio-detail HERO: an objective-cost-over-cycles timeline that carries
// the whole story in one interaction. The cost line is engine-derived from
// spend/results; a dashed ProjectionLine continues it toward the target (or
// the recent trend) with a hollow terminal marker at the actual→projected hand-off;
// pins on the axis mark cycles where the optimizer acted; and hovering any cycle
// opens a rich card with that cycle's cost + spend + results AND the actions
// taken — metrics and pinned events in one panel, the reference-screenshot pattern.
//
// There is deliberately NO spend bar layer. Spend and cost-per-result are different
// units, and ComposedChart cannot separate them: tryAppendSeriesBar (composed-chart.tsx)
// drops `yAxisId`, so a bar always lands on the default axis — the one this chart
// labels with formatCpa. A bar drawn there has no readable height, so spend lives
// in the tooltip, at its real value, instead.

import {
  type CpaSeriesPoint,
  getOptimizationMetricDefinition,
  type TimelineEvent,
} from '@continuum/contracts';
import { PauseIcon, SettingsIcon, WalletIcon, ZapIcon } from 'lucide-react';
import { useChartStable } from '@/components/charts/chart-context';
import { ComposedChart } from '@/components/charts/composed-chart';
import { Grid } from '@/components/charts/grid';
import { Line } from '@/components/charts/line';
import { LineSeriesTerminalMarker } from '@/components/charts/line-series-terminal-marker';
import { ProjectionLine } from '@/components/charts/projection-line';
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
  eventsByTs?: Record<string, TimelineEvent[]>;
  targetCpa?: number | null;
  currency?: string | null;
  confidenceBand?: string | null;
  objective?: string | null;
};

export function CpaHeroTimeline({
  series,
  eventsByTs = {},
  targetCpa,
  currency,
  confidenceBand,
  objective,
}: CpaHeroTimelineProps) {
  const metric = getOptimizationMetricDefinition(objective);
  const points = buildCpaHeroPoints(series, eventsByTs, metric.denominatorMultiplier);

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
            Projected {metric.costLabel} next cycle:{' '}
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

      <div className="relative">
        {/* The y-axis measures the objective cost — name it so the reader never has
            to infer whether $28 is CPL or CPM. */}
        <span
          aria-hidden="true"
          className="-translate-y-1/2 -rotate-90 pointer-events-none absolute top-1/2 left-0 origin-left whitespace-nowrap text-3xs text-muted-foreground uppercase tracking-wide"
        >
          {metric.costLabel}
        </span>
        <ComposedChart
          // aspect-ratio yields to max-height in CSS, so this stays wide on a narrow
          // viewport but never grows into the ~640px monolith a full-bleed 5:2 produced on
          // a desktop panel — the chart was taller than everything below it combined.
          aspectRatio="5 / 2"
          className="max-h-[300px]"
          data={points}
          margin={{ top: 16, right: 18, bottom: 26, left: 56 }}
          xDataKey="date"
        >
          <Grid horizontal />
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
      </div>

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
        if (point.events.length === 0) return null;
        const x = xScale(point.date) ?? 0;
        // A cycle can carry several kinds at once; the pin takes the colour of the most
        // consequential one present. Money moving outranks a setting being changed.
        const kinds = new Set(point.events.map((event) => event.kind));
        const dominant = (['applied', 'status', 'config', 'cycle'] as const).find((kind) =>
          kinds.has(kind),
        );
        const color = eventStyle(dominant ?? 'cycle').color;
        return (
          <g key={point.ts} transform={`translate(${x}, 0)`}>
            {/* Native hover: a keyboard/screen-reader path to the same list the card shows. */}
            <title>{point.events.map((event) => event.label).join(' · ')}</title>
            <line
              stroke={color}
              strokeDasharray="2,3"
              strokeOpacity={0.45}
              x1={0}
              x2={0}
              y1={0}
              y2={innerHeight}
            />
            <circle
              cx={0}
              cy={innerHeight}
              fill="var(--chart-marker-background)"
              r={5}
              stroke={color}
              strokeWidth={2.5}
            />
            {point.events.length > 1 ? (
              <>
                <circle cx={7} cy={innerHeight - 9} fill={color} r={6.5} />
                <text
                  dominantBaseline="central"
                  fill="var(--chart-marker-background)"
                  fontSize={9}
                  fontWeight={600}
                  textAnchor="middle"
                  x={7}
                  y={innerHeight - 9}
                >
                  {point.events.length}
                </text>
              </>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

/** Per-kind glyph + accent. The pin and the tooltip row use the SAME pair, so a mark on the
 *  axis and its line in the card are recognizably the same event. */
const EVENT_STYLE: Record<string, { Icon: typeof ZapIcon; color: string; label: string }> = {
  cycle: { Icon: ZapIcon, color: 'var(--chart-4)', label: 'Cycle' },
  applied: { Icon: WalletIcon, color: 'var(--success)', label: 'Applied' },
  status: { Icon: PauseIcon, color: 'var(--warning)', label: 'Status' },
  config: { Icon: SettingsIcon, color: 'var(--chart-3)', label: 'Setting' },
};

function eventStyle(kind: string) {
  return EVENT_STYLE[kind] ?? EVENT_STYLE.cycle;
}

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

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
  // The tooltip panel is dark in BOTH themes (--chart-tooltip-background), so it needs its
  // own foreground tokens. Using the page's text-foreground rendered near-black text on a
  // near-black panel in light mode — the card was there, and unreadable.
  const delta = point.deltaCpa;
  return (
    <div className="min-w-[196px] max-w-[260px] space-y-2 p-1">
      <div className="text-3xs text-chart-tooltip-muted uppercase tracking-wide">
        {point.date instanceof Date ? dayFmt.format(point.date) : ''}
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-xs text-chart-tooltip-muted">{costLabel}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-data font-semibold text-base text-chart-tooltip-foreground tabular-nums">
            {formatCpa(point.cpa, currency)}
          </span>
          {delta != null && delta !== 0 ? (
            <span
              className="font-data text-2xs tabular-nums"
              style={{ color: delta < 0 ? 'var(--success)' : 'var(--warning)' }}
            >
              {delta < 0 ? '↓' : '↑'}
              {formatCpa(Math.abs(delta), currency)}
            </span>
          ) : null}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-chart-tooltip-muted tabular-nums">
        <span>spend {formatCurrency(point.spend, currency)}</span>
        <span>
          {Math.round(point.conv)} {resultLabel.toLowerCase()}
        </span>
      </div>
      {point.events.length > 0 ? (
        // Capped + scrollable: a busy cycle can carry a dozen events, and an uncapped card
        // grows past the plot and gets clipped by the chart container.
        <div className="max-h-32 space-y-1 overflow-y-auto border-white/15 border-t pt-1.5">
          {point.events.map((event, index) => {
            const { Icon, color } = eventStyle(event.kind);
            const at = Date.parse(event.ts);
            // Two events on one cycle can be byte-identical (the same config field changed
            // twice carries the same label and detail), so position is the only thing that
            // distinguishes them. This list is read-only and never reorders, which is what
            // makes an index key safe here.
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: identical repeated events have no other unique key
              <div className="flex items-start gap-1.5 text-xs" key={`${point.ts}:event:${index}`}>
                <Icon aria-hidden="true" className="mt-0.5 size-3 shrink-0" style={{ color }} />
                <span className="min-w-0 flex-1">
                  <span className="text-chart-tooltip-foreground">{event.label}</span>
                  {event.detail ? (
                    <span className="text-chart-tooltip-muted"> · {event.detail}</span>
                  ) : null}
                </span>
                {Number.isNaN(at) ? null : (
                  <span className="shrink-0 text-3xs text-chart-tooltip-muted tabular-nums">
                    {timeFmt.format(new Date(at))}
                  </span>
                )}
              </div>
            );
          })}
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
      {hasProjection ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-0 w-4 border-t-2 border-dashed"
            style={{ borderColor: 'var(--chart-4)' }}
          />
          Projected
        </span>
      ) : null}
      {(['cycle', 'applied', 'status', 'config'] as const).map((kind) => {
        const { color, label } = eventStyle(kind);
        return (
          <span className="inline-flex items-center gap-1.5" key={kind}>
            <span className="size-2 rounded-full border" style={{ borderColor: color }} />
            {label}
          </span>
        );
      })}
    </div>
  );
}
