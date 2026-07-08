'use client';

// Budget pacing as a linear notch gauge: how much of the period budget is spent
// so far, the fill colored by pace status (on-track green, under = the working
// teal, over = amber warning). The caption states the pace verdict and the
// projected end-of-period spend so the number has a "so what". Empty until a
// period budget is set (pacing is undefined without one).

import { Gauge } from '@/components/charts/gauge';
import { formatCurrency } from '../format';
import { ChartEmpty } from './ChartStates';
import { type PacingInput, pacingSnapshot } from './vizData';

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
  currency?: string | null;
};

export function PacingGauge({ pacing, currency }: PacingGaugeProps) {
  const snapshot = pacing ? pacingSnapshot(pacing) : null;

  if (!snapshot || snapshot.pctSpent == null) {
    return <ChartEmpty message="Set a period budget on this portfolio to track pacing." />;
  }

  const spent =
    typeof pacing?.actualSpendToDate === 'number' ? pacing.actualSpendToDate : undefined;

  return (
    <div className="space-y-2">
      <Gauge
        activeFill={STATUS_FILL[snapshot.status]}
        centerValue={spent}
        defaultLabel="Spent to date"
        formatOptions={{ style: 'currency', currency: currency ?? 'USD', maximumFractionDigits: 0 }}
        labelPlacement="top"
        orientation="linear"
        value={snapshot.pctSpent}
      />
      <p className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
        <span>
          {STATUS_LABEL[snapshot.status]} · {Math.round(snapshot.pctSpent)}% of budget
        </span>
        {snapshot.projectedEndSpend != null ? (
          <span>proj. end {formatCurrency(snapshot.projectedEndSpend, currency)}</span>
        ) : null}
      </p>
    </div>
  );
}
