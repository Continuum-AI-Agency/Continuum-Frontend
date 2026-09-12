'use client';

// The objective recap for the chosen range: what was spent, what it bought, what each
// result cost, and how that stands against the target — each with its trend and its
// change against the prior window of the same length. Four tiles, one period, one story.

import type { OptimizationMetricDefinition } from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { ExplainPopover, ExplainRow } from '../../components/ExplainPopover';
import { Sparkline } from '../../components/Sparkline';
import { StatusChip, type StatusTone } from '../../components/StatusChip';
import { formatCpa, formatCurrency } from '../../format';
import type { ResolvedRange } from './rangeModel';
import type { RecapModel } from './recapModel';

const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function pct(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
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
  sub,
  chip,
  spark,
  sparkColor,
  explain,
}: {
  label: string;
  value: string;
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
          <p className="truncate font-semibold text-lg text-foreground tabular-nums leading-none">
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
            <StatusChip tone="muted">{pct(delta.spend)} spend</StatusChip>
          ) : null
        }
        label="Spend"
        spark={spendSpark}
        sub={periodNote}
        value={formatCurrency(current.spend, currency)}
      />
      <Tile
        chip={
          delta.results != null ? (
            <StatusChip tone={deltaTone(delta.results, false)}>
              {pct(delta.results)} {metric.resultLabel.toLowerCase()}
            </StatusChip>
          ) : null
        }
        label={metric.resultLabel}
        spark={resultSpark}
        sparkColor="var(--chart-2)"
        sub={
          current.impressions > 0
            ? `${INT.format(current.impressions)} impressions · ${INT.format(current.clicks)} clicks`
            : undefined
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
              {costDelta} vs prior
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
              {recap.vsTarget == null
                ? 'No results yet'
                : recap.vsTarget <= 0
                  ? `Below target · ${vsTarget}`
                  : `Above target · ${vsTarget}`}
            </StatusChip>
          ) : (
            <StatusChip tone="muted">No target set</StatusChip>
          )
        }
        label={metric.targetLabel}
        sub={
          target != null && target > 0 && current.costPerResult != null
            ? `${formatCpa(current.costPerResult, currency)} actual`
            : undefined
        }
        value={target != null && target > 0 ? formatCpa(target, currency) : '—'}
      />
    </div>
  );
}
