'use client';

// The objective recap for the chosen range: what was spent, what it bought, what each
// result cost, and how that stands against the target — each with its trend and its
// change against the prior window of the same length. Four tiles, one period, one story.

import type { OptimizationMetricDefinition } from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { ExplainPopover, ExplainRow } from '../../components/ExplainPopover';
import { Sparkline } from '../../components/Sparkline';
import { StatusChip, type StatusTone } from '../../components/StatusChip';
import {
  type FigureProps,
  type FigureWindow,
  figureProps,
  formatCpa,
  formatCurrency,
} from '../../format';
import type { ResolvedRange } from './rangeModel';
import type { RecapModel } from './recapModel';

const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function pct(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

/** A fractional delta in display units, for the provenance attribute — 12 for +12%. */
function pctRaw(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** The range's window in the figure-provenance vocabulary; a custom range is `none`. */
function rangeWindow(range: ResolvedRange): FigureWindow {
  return range.spec.kind === 'preset' && range.spec.preset !== 'flight'
    ? range.spec.preset
    : 'none';
}

/** A signed-percent chip figure, keyed under its tile. */
function DeltaFigure({
  figureKey,
  value,
  window,
}: {
  figureKey: string;
  value: number | null | undefined;
  window: FigureWindow;
}) {
  return (
    <span {...figureProps(figureKey, pctRaw(value), null, window, 'percent-signed')}>
      {pct(value)}
    </span>
  );
}

/** Delta tone: for spend/results up is neutral-good, for cost up is bad. */
function deltaTone(value: number | null, lowerIsBetter: boolean): StatusTone {
  if (value == null) return 'muted';
  if (Math.abs(value) < 0.02) return 'muted';
  const good = lowerIsBetter ? value < 0 : value > 0;
  return good ? 'success' : 'warning';
}

function Tile({
  label,
  value,
  figure,
  sub,
  chip,
  spark,
  sparkColor,
  explain,
}: {
  label: string;
  value: string;
  figure: FigureProps;
  sub?: React.ReactNode;
  chip?: React.ReactNode;
  spark?: number[];
  sparkColor?: string;
  explain?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/70 bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs text-muted-foreground uppercase tracking-wide">{label}</span>
        {explain}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p
            className="truncate font-semibold text-lg text-foreground tabular-nums leading-none"
            {...figure}
          >
            {value}
          </p>
          {sub ? <p className="mt-1 text-2xs text-muted-foreground">{sub}</p> : null}
        </div>
        {spark && spark.some((v) => v > 0) ? (
          <Sparkline label={`${label} by day`} stroke={sparkColor} values={spark} width={72} />
        ) : null}
      </div>
      {chip ? <div className="flex flex-wrap gap-1.5">{chip}</div> : null}
    </div>
  );
}

type ObjectiveCostRecapProps = {
  recap: RecapModel;
  range: ResolvedRange;
  metric: OptimizationMetricDefinition;
  /** Target in the metric's display unit. */
  target: number | null | undefined;
  currency?: string | null;
  className?: string;
};

export function ObjectiveCostRecap({
  recap,
  range,
  metric,
  target,
  currency,
  className,
}: ObjectiveCostRecapProps) {
  const { current, previous, delta } = recap;
  const spendSpark = recap.series.map((d) => d.spend);
  const resultSpark = recap.series.map((d) => d.results);
  const costSpark = recap.series.map((d) =>
    d.results > 0 ? (d.spend / d.results) * metric.denominatorMultiplier : 0,
  );
  const periodNote =
    recap.source === 'window'
      ? `engine ${recap.windowUsed} window · no daily series for this range`
      : recap.source === 'none'
        ? 'no data in this range yet'
        : previous
          ? `vs prior ${range.days} days`
          : range.label.toLowerCase();

  const costDelta = pct(delta.costPerResult);
  const vsTarget = pct(recap.vsTarget);
  const window = rangeWindow(range);
  const targetTone: StatusTone =
    recap.vsTarget == null
      ? 'muted'
      : recap.vsTarget <= 0
        ? 'success'
        : recap.vsTarget <= 0.15
          ? 'warning'
          : 'danger';

  return (
    <div className={cn('grid grid-cols-2 gap-2 lg:grid-cols-4', className)}>
      <Tile
        chip={
          delta.spend != null ? (
            <StatusChip tone="muted">
              <DeltaFigure figureKey="recap.spend.delta" value={delta.spend} window={window} />{' '}
              spend
            </StatusChip>
          ) : null
        }
        figure={figureProps('recap.spend', current.spend, currency, window)}
        label="Spend"
        spark={spendSpark}
        sub={periodNote}
        value={formatCurrency(current.spend, currency)}
      />
      <Tile
        chip={
          delta.results != null ? (
            <StatusChip tone={deltaTone(delta.results, false)}>
              <DeltaFigure figureKey="recap.results.delta" value={delta.results} window={window} />{' '}
              {metric.resultLabel.toLowerCase()}
            </StatusChip>
          ) : null
        }
        figure={figureProps('recap.results', current.results, null, window, 'count')}
        label={metric.resultLabel}
        spark={resultSpark}
        sparkColor="var(--chart-2)"
        sub={
          current.impressions > 0 ? (
            <>
              <span
                {...figureProps('recap.impressions', current.impressions, null, window, 'count')}
              >
                {INT.format(current.impressions)}
              </span>{' '}
              impressions ·{' '}
              <span {...figureProps('recap.clicks', current.clicks, null, window, 'count')}>
                {INT.format(current.clicks)}
              </span>{' '}
              clicks
            </>
          ) : undefined
        }
        value={INT.format(current.results)}
      />
      <Tile
        chip={
          costDelta ? (
            <StatusChip
              hint={
                previous?.costPerResult != null
                  ? `Prior period: ${formatCpa(previous.costPerResult, currency)}`
                  : undefined
              }
              tone={deltaTone(delta.costPerResult, true)}
            >
              <DeltaFigure
                figureKey="recap.cost.delta"
                value={delta.costPerResult}
                window={window}
              />{' '}
              vs prior
            </StatusChip>
          ) : null
        }
        explain={
          <ExplainPopover title={`${metric.costLabel} in this range`}>
            <p>
              Spend divided by {metric.resultLabel.toLowerCase()} across the enrolled ad sets,
              {range.label.toLowerCase()}.
              {metric.denominatorMultiplier !== 1
                ? ` Shown per ${INT.format(metric.denominatorMultiplier)}.`
                : ''}
            </p>
            <ExplainRow label="Spend" value={formatCurrency(current.spend, currency)} />
            <ExplainRow label={metric.resultLabel} value={INT.format(current.results)} />
            {previous ? (
              <ExplainRow
                label="Prior period"
                value={
                  previous.costPerResult != null ? formatCpa(previous.costPerResult, currency) : '—'
                }
              />
            ) : null}
          </ExplainPopover>
        }
        figure={figureProps('recap.cost', current.costPerResult, currency, window)}
        label={metric.costLabel}
        spark={costSpark}
        sparkColor="var(--chart-4)"
        value={current.costPerResult != null ? formatCpa(current.costPerResult, currency) : '—'}
      />
      <Tile
        chip={
          target != null && target > 0 ? (
            <StatusChip
              hint={
                recap.vsTarget == null
                  ? 'No results in this range to price against the target.'
                  : recap.vsTarget <= 0
                    ? 'Cost per result is at or below the target.'
                    : 'Cost per result is above the target.'
              }
              tone={targetTone}
            >
              {recap.vsTarget == null ? (
                'No results yet'
              ) : (
                <>
                  {recap.vsTarget <= 0 ? 'Below target' : 'Above target'} ·{' '}
                  <DeltaFigure figureKey="recap.target.vs" value={recap.vsTarget} window={window} />
                </>
              )}
            </StatusChip>
          ) : (
            <StatusChip tone="muted">No target set</StatusChip>
          )
        }
        figure={figureProps('recap.target', target != null && target > 0 ? target : null, currency)}
        label={metric.targetLabel}
        sub={
          target != null && target > 0 && current.costPerResult != null ? (
            <>
              <span
                {...figureProps('recap.target.actual', current.costPerResult, currency, window)}
              >
                {formatCpa(current.costPerResult, currency)}
              </span>{' '}
              actual
            </>
          ) : undefined
        }
        value={target != null && target > 0 ? formatCpa(target, currency) : '—'}
      />
    </div>
  );
}
