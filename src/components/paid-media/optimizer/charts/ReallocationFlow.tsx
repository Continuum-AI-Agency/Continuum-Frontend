'use client';

// Per-ad-set reallocation flow — which ad sets gained budget and which lost it in
// the latest cycle. Diverging bars (per-datum color: gain vs loss) don't map onto
// a single-series BKLit bar chart, and the reference-ui spec itself uses bar rows,
// so this is a purpose-built, honest visualization. HELD items (freezeReason) are
// excluded — their budget was left unchanged on purpose, so they are not "flow".
// Gain/loss uses the shared semantic pair (--success / --destructive) so light/dark
// theming stays automatic — no hardcoded emerald/rose.

import type { CycleItemRow } from '@continuum/contracts';

import { formatCurrency } from '../format';
import { AdSetIdLabel } from './AdSetIdLabel';
import { ChartEmpty } from './ChartStates';
import { type FlowRow, splitReallocation } from './chartData';
import { pct } from './chartScale';

type ReallocationFlowProps = {
  items: CycleItemRow[];
  currency?: string | null;
};

export function ReallocationFlow({ items, currency }: ReallocationFlowProps) {
  const { gaining, losing, maxAbs, totalMoved } = splitReallocation(items);
  const movedCount = gaining.length + losing.length;

  if (movedCount === 0) {
    return <ChartEmpty message="No budget moved this cycle — allocations held steady." />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {formatCurrency(totalMoved, currency)} moved across {movedCount} ad sets
      </p>

      {gaining.length > 0 ? (
        <FlowSection label="Gaining" rows={gaining} maxAbs={maxAbs} currency={currency} positive />
      ) : null}
      {losing.length > 0 ? (
        <FlowSection label="Losing" rows={losing} maxAbs={maxAbs} currency={currency} />
      ) : null}
    </div>
  );
}

function FlowSection({
  label,
  rows,
  maxAbs,
  currency,
  positive,
}: {
  label: string;
  rows: FlowRow[];
  maxAbs: number;
  currency?: string | null;
  positive?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-2xs font-medium text-muted-foreground">
        {positive ? '↑' : '↓'} {label}
      </p>
      {rows.map((row) => {
        const width = Math.max(4, pct(Math.abs(row.change), maxAbs));
        const pctLabel =
          row.changePct != null
            ? ` (${positive ? '+' : '−'}${Math.round(Math.abs(row.changePct) * 100)}%)`
            : '';
        return (
          <div key={row.adsetId} className="flex items-center gap-2">
            <AdSetIdLabel id={row.adsetId} />
            <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/40">
              <div
                className={
                  positive ? 'h-full rounded-full bg-success' : 'h-full rounded-full bg-destructive'
                }
                style={{ width: `${width}%` }}
              />
            </div>
            <div className="w-32 shrink-0 text-right leading-tight">
              <div className="text-3xs tabular-nums text-muted-foreground">
                {formatCurrency(row.current, currency)} → {formatCurrency(row.proposed, currency)}
              </div>
              <div
                className={
                  positive
                    ? 'text-2xs font-medium tabular-nums text-success'
                    : 'text-2xs font-medium tabular-nums text-destructive'
                }
              >
                {positive ? '+' : '−'}
                {formatCurrency(Math.abs(row.change), currency)}
                {pctLabel}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
