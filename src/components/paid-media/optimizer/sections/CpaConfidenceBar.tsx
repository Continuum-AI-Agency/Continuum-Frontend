'use client';

// One ad-set row in the "CPA per ad set" list. Two mutually-exclusive states:
//  1. HELD — the item carries a freezeReason (budget left unchanged on purpose).
//     We render a labeled "Held" chip, NOT a $0.00 change or a CI bar, because a
//     held ad set was abstained from — showing a zero would lie about the signal.
//  2. SCORED — the Poisson 95% CI as a track with a point marker at the CPA
//     estimate (wider bar = fewer events = noisier — the P1 uncertainty feature).
// All numbers come from the engine ItemDiagnostics carried in
// cycle_items.diagnostics (contracts CycleItemDiagnosticsSchema).

import type { CycleItemRow } from '@continuum/contracts';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatCpa } from '../format';
import { freezeLabel } from '../reportModel';

type CpaConfidenceBarProps = {
  item: CycleItemRow;
  maxCpa: number;
  currency?: string | null;
};

function pct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

export function CpaConfidenceBar({ item, maxCpa, currency }: CpaConfidenceBarProps) {
  const held = freezeLabel(item.diagnostics?.freezeReason);

  if (held) {
    return (
      <div className="flex items-center gap-3">
        <code className="w-40 shrink-0 truncate text-[11px] text-muted-foreground">
          {item.adset_id}
        </code>
        <div className="flex flex-1 items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                {held.label}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-xs">{held.hint}</TooltipContent>
          </Tooltip>
        </div>
        <span className="w-40 shrink-0 text-right text-[11px] text-muted-foreground">
          budget unchanged
        </span>
      </div>
    );
  }

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
      <div className={cn('relative h-3.5 flex-1')}>
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
        {formatCpa(cpa, currency)}
        {hasInterval ? ` (${formatCpa(lo, currency)}–${formatCpa(hi, currency)})` : ''}
        {events != null ? ` · ${events}ev` : ''}
      </span>
    </div>
  );
}
