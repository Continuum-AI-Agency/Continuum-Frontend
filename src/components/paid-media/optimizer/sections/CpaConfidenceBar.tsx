'use client';

// One ad-set row in the "CPA per ad set" list. Two mutually-exclusive states:
//  1. HELD — the item carries a freezeReason (budget left unchanged on purpose).
//     We render a labeled HeldPill, NOT a $0.00 change or a CI bar, because a
//     held ad set was abstained from — showing a zero would lie about the signal.
//  2. SCORED — the Poisson 95% CI as a track with a point marker at the CPA
//     estimate (wider bar = fewer events = noisier — the P1 uncertainty feature).
// All numbers come from the engine ItemDiagnostics carried in
// cycle_items.diagnostics (contracts CycleItemDiagnosticsSchema).

import type { CycleItemRow } from '@continuum/contracts';

import { AdSetIdLabel } from '../charts/AdSetIdLabel';
import { pct } from '../charts/chartScale';
import { formatCpa } from '../format';
import { HeldPill } from '../HeldPill';

type CpaConfidenceBarProps = {
  item: CycleItemRow;
  maxCpa: number;
  currency?: string | null;
  denominatorMultiplier?: number;
  name?: string;
};

export function CpaConfidenceBar({
  item,
  maxCpa,
  currency,
  denominatorMultiplier = 1,
  name,
}: CpaConfidenceBarProps) {
  const freezeReason = item.diagnostics?.freezeReason;

  if (freezeReason) {
    return (
      <div className="flex items-center gap-3">
        <AdSetIdLabel id={item.adset_id} name={name} />
        <div className="flex flex-1 items-center">
          <HeldPill reason={freezeReason} />
        </div>
        <span className="w-40 shrink-0 text-right text-2xs text-muted-foreground">
          budget unchanged
        </span>
      </div>
    );
  }

  const ci = item.diagnostics?.ci ?? null;
  const cpa = ci?.cpa != null ? ci.cpa * denominatorMultiplier : null;
  const lo = ci?.lo != null ? ci.lo * denominatorMultiplier : null;
  const hi = ci?.hi != null ? ci.hi * denominatorMultiplier : null;
  const events = ci?.events ?? null;

  const hasInterval = lo != null && hi != null && hi >= lo;
  const left = hasInterval ? pct(lo, maxCpa) : 0;
  const width = hasInterval ? Math.max(1, pct(hi, maxCpa) - pct(lo, maxCpa)) : 0;
  const markerLeft = cpa != null ? pct(cpa, maxCpa) : 0;

  return (
    <div className="flex items-center gap-3">
      <AdSetIdLabel id={item.adset_id} name={name} />
      <div className="relative h-3.5 min-w-0 flex-1">
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
      <span className="w-40 shrink-0 text-right text-2xs tabular-nums text-muted-foreground">
        {formatCpa(cpa, currency)}
        {hasInterval ? ` (${formatCpa(lo, currency)}–${formatCpa(hi, currency)})` : ''}
        {events != null ? ` · ${events}ev` : ''}
      </span>
    </div>
  );
}
