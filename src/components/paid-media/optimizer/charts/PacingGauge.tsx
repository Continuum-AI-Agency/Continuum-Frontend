'use client';

// Budget pacing as a linear notch gauge: how much of the period budget is spent so
// far, the fill colored by pace status (on-track green, under = the working teal,
// over = amber warning). The caption states the pace verdict and the projected
// end-of-period spend so the number has a "so what".
//
// It NEVER renders "period budget not set, can't show pacing": when a portfolio has
// no explicit period budget, the gauge estimates one from the daily budget
// (daily × periodDays) and marks the track "est." with a dashed frame and a soft
// caption, so pacing is always readable and the estimate is never mistaken for a
// real setting.

import { Gauge } from '@/components/charts/gauge';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../format';
import { DEFAULT_PACING_PERIOD_DAYS, type PacingInput, pacingSnapshot } from './vizData';

const STATUS_FILL: Record<string, string> = {
  on_track: 'var(--success)',
  underpacing: 'var(--chart-1)',
  overpacing: 'var(--warning)',
  unknown: 'var(--muted-foreground)',
};

const STATUS_LABEL: Record<string, string> = {
  on_track: 'On track',
  underpacing: 'Underpacing',
  overpacing: 'Overpacing',
  unknown: 'No pace signal',
};

type PacingGaugeProps = {
  pacing: PacingInput | null | undefined;
  /** The portfolio's daily budget — the basis for the estimated period budget. */
  dailyTotal?: number | null;
  periodDays?: number | null;
  currency?: string | null;
};

export function PacingGauge({ pacing, dailyTotal, periodDays, currency }: PacingGaugeProps) {
  const snapshot = pacingSnapshot({
    ...(pacing ?? {}),
    dailyTotal: pacing?.dailyTotal ?? dailyTotal,
    periodDays: pacing?.periodDays ?? periodDays,
  });

  // With no daily budget AND no period budget there is nothing to pace against.
  // This is a soft nudge, not the old scary empty state.
  if (snapshot.periodBudget == null) {
    return (
      <p className="text-2xs text-muted-foreground">
        Set a daily budget to see this portfolio&rsquo;s pacing.
      </p>
    );
  }

  const spent =
    typeof pacing?.actualSpendToDate === 'number' ? pacing.actualSpendToDate : undefined;
  const gaugeValue = snapshot.pctSpent ?? 0;
  const days = pacing?.periodDays ?? periodDays ?? DEFAULT_PACING_PERIOD_DAYS;

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'rounded-md',
          snapshot.estimated && 'border border-dashed border-border/70 p-1.5',
        )}
      >
        <Gauge
          activeFill={STATUS_FILL[snapshot.status]}
          centerValue={spent}
          defaultLabel="Spent to date"
          formatOptions={{
            style: 'currency',
            currency: currency ?? 'USD',
            maximumFractionDigits: 0,
          }}
          inactiveFillOpacity={snapshot.estimated ? 0.25 : undefined}
          labelPlacement="top"
          orientation="linear"
          value={gaugeValue}
        />
      </div>

      <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span className="flex items-center gap-1.5">
          {STATUS_LABEL[snapshot.status]} · {Math.round(gaugeValue)}% of{' '}
          {snapshot.estimated ? 'est. ' : ''}budget
          {snapshot.estimated ? (
            <span className="rounded bg-muted px-1 py-0.5 text-3xs uppercase tracking-wide text-muted-foreground">
              est.
            </span>
          ) : null}
        </span>
        {snapshot.projectedEndSpend != null ? (
          <span>proj. end {formatCurrency(snapshot.projectedEndSpend, currency)}</span>
        ) : null}
      </p>

      {snapshot.estimated ? (
        <p className="text-3xs text-muted-foreground">
          Estimated period budget = daily budget × {days} days ({' '}
          {formatCurrency(snapshot.periodBudget, currency)}). Set a period budget in Manage to track
          it exactly.
        </p>
      ) : null}
    </div>
  );
}
