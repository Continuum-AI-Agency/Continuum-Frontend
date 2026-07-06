'use client';

// One ad-set CPA confidence-interval row. Renders the Poisson 95% CI as a track
// with a point marker at the CPA estimate — wider bar = fewer events = noisier
// (the P1 uncertainty feature). All numbers come from the engine ItemDiagnostics
// carried in cycle_items.diagnostics.ci (contracts CycleItemDiagnosticsSchema).

import type { CycleItemRow } from '@continuum/contracts';

import { formatCpa } from '../format';

type CpaConfidenceBarProps = {
  item: CycleItemRow;
  maxCpa: number;
};

function pct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

export function CpaConfidenceBar({ item, maxCpa }: CpaConfidenceBarProps) {
  const ci = item.diagnostics?.ci ?? null;
  const cpa = ci?.cpa ?? null;
  const lo = ci?.lo ?? null;
  const hi = ci?.hi ?? null;
  const events = ci?.events ?? null;

  const hasInterval = lo != null && hi != null && hi >= lo;
  const left = hasInterval ? pct(lo, maxCpa) : 0;
  const width = hasInterval ? Math.max(1, pct(hi, maxCpa) - pct(lo, maxCpa)) : 0;
  const markerLeft = cpa != null ? pct(cpa, maxCpa) : 0;

  return (
    <div className="flex items-center gap-3">
      <code className="w-40 shrink-0 truncate text-[11px] text-muted-foreground">
        {item.adset_id}
      </code>
      <div className="relative h-3.5 flex-1">
        {hasInterval ? (
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-border"
            style={{ left: `${left}%`, width: `${width}%` }}
            aria-hidden
          />
        ) : null}
        {cpa != null ? (
          <div
            className="absolute top-0 h-3.5 w-0.5 rounded-full bg-primary"
            style={{ left: `${markerLeft}%` }}
            aria-hidden
          />
        ) : null}
      </div>
      <span className="w-40 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
        {formatCpa(cpa)}
        {hasInterval ? ` (${formatCpa(lo)}–${formatCpa(hi)})` : ''}
        {events != null ? ` · ${events}ev` : ''}
      </span>
    </div>
  );
}
