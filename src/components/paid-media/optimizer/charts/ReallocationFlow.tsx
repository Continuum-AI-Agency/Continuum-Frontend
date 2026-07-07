'use client';

// Per-ad-set reallocation flow — which ad sets gained budget and which lost it in
// the latest cycle. Diverging bars (per-datum color: gain vs loss) don't map onto
// a single-series BKLit bar chart, and the reference-ui spec itself uses bar rows,
// so this is a purpose-built, honest visualization. HELD items (freezeReason) are
// excluded — their budget was left unchanged on purpose, so they are not "flow".

import type { CycleItemRow } from '@continuum/contracts';

import { formatCurrency } from '../format';
import { type FlowRow, splitReallocation } from './chartData';

type ReallocationFlowProps = {
  items: CycleItemRow[];
  currency?: string | null;
};

export function ReallocationFlow({ items, currency }: ReallocationFlowProps) {
  const { gaining, losing, maxAbs, totalMoved } = splitReallocation(items);
  const movedCount = gaining.length + losing.length;

  if (movedCount === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No budget moved this cycle — allocations held steady.
      </p>
    );
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
      <p className="text-[11px] font-medium text-muted-foreground">
        {positive ? '↑' : '↓'} {label}
      </p>
      {rows.map((row) => {
        const width = Math.max(4, (Math.abs(row.change) / maxAbs) * 100);
        return (
          <div key={row.adsetId} className="flex items-center gap-2">
            <code className="w-40 shrink-0 truncate text-[11px] text-muted-foreground">
              {row.adsetId}
            </code>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted/40">
              <div
                className={
                  positive
                    ? 'h-full rounded-full bg-emerald-500'
                    : 'h-full rounded-full bg-rose-500'
                }
                style={{ width: `${width}%` }}
              />
            </div>
            <span
              className={
                positive
                  ? 'w-16 shrink-0 text-right text-[11px] font-medium tabular-nums text-emerald-600 dark:text-emerald-400'
                  : 'w-16 shrink-0 text-right text-[11px] font-medium tabular-nums text-rose-600 dark:text-rose-400'
              }
            >
              {positive ? '+' : '−'}
              {formatCurrency(Math.abs(row.change), currency)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
