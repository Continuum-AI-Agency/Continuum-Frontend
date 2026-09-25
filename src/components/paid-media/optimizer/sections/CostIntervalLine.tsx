// The "Cost:" line under a budget move in the Actions queue: the engine's point estimate, its
// 95% interval, and the events it rests on. A zero-conversion ad set has no estimate and no
// upper bound (spend ÷ 0), so it says that instead of printing the engine's placeholder zeros.

import type { CycleItemDiagnostics } from '@continuum/contracts';

import { figureProps, formatCurrency } from '../format';
import { measuredCpa, upperBoundNote } from '../reportModel';

export function CostIntervalLine({
  adsetId,
  ci,
  currency,
}: {
  adsetId: string;
  ci: CycleItemDiagnostics['ci'];
  currency: string | null;
}) {
  const note = upperBoundNote(ci);
  if (note) {
    return (
      <p>
        <span className="font-medium text-foreground">Cost:</span>{' '}
        <span {...figureProps(`queue.${adsetId}.detail.ci.hi`, null, currency)}>{note}</span>
      </p>
    );
  }
  const cpa = measuredCpa(ci);
  if (cpa == null) return null;
  const lo = typeof ci?.lo === 'number' && Number.isFinite(ci.lo) ? ci.lo : null;
  const hi = typeof ci?.hi === 'number' && Number.isFinite(ci.hi) ? ci.hi : null;
  return (
    <p>
      <span className="font-medium text-foreground">Cost:</span>{' '}
      <span {...figureProps(`queue.${adsetId}.detail.cost`, cpa, currency)}>
        {formatCurrency(cpa, currency)}
      </span>
      {lo != null && hi != null ? (
        <>
          {' (likely '}
          <span {...figureProps(`queue.${adsetId}.detail.ci.lo`, lo, currency)}>
            {formatCurrency(lo, currency)}
          </span>
          –
          <span {...figureProps(`queue.${adsetId}.detail.ci.hi`, hi, currency)}>
            {formatCurrency(hi, currency)}
          </span>
          {')'}
        </>
      ) : null}
      {typeof ci?.events === 'number' ? ` from ${ci.events} events` : ''}
    </p>
  );
}
