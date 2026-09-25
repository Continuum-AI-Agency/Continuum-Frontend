'use client';

// One square card in the action grid: what it touched, where it landed, how far it moved, when.
//
// The card is a summary; the whole card is the button that opens the full action — why,
// before → after, the Meta receipt and the revert — in a dialog, so nothing the old row showed
// became unreachable. A reverted action still says so on its face.

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { OptimizerActionFeedRow } from '../useOptimizerData';
import {
  ActionDelta,
  ActionDetailBody,
  ActionFamilyBadge,
  ActionRevertedBadge,
  actionEntityName,
  printChangeValue,
} from './actionCardParts';
import { readActionChange } from './actionRows';
import { formatWhen } from './feedChrome';

export function ActionGridCard({
  row,
  brandId,
  currency,
}: {
  row: OptimizerActionFeedRow;
  brandId: string;
  currency: string | null;
}) {
  const [open, setOpen] = useState(false);
  const change = readActionChange(row);
  const entity = actionEntityName(row);

  return (
    <li className="flex min-w-0" data-action-id={row.id}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${change.label} on ${entity} — open details`}
        className="flex min-h-36 w-full sm:aspect-square min-w-0 flex-col gap-2 rounded-lg border border-border/60 bg-card p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex w-full items-center justify-between gap-2">
          <ActionFamilyBadge family={row.family} />
          {row.reverted_by ? <ActionRevertedBadge /> : null}
        </div>
        <div className="w-full min-w-0">
          <p className="font-medium text-muted-foreground text-xs">{change.label}</p>
          <p className="truncate font-medium text-foreground text-sm" title={entity}>
            {entity}
          </p>
        </div>
        <div className="mt-auto w-full min-w-0">
          <p className="truncate font-mono font-semibold text-foreground text-lg tabular-nums">
            {printChangeValue(change, change.after, currency)}
          </p>
          <div className="flex items-baseline justify-between gap-2">
            <ActionDelta change={change} className="text-sm" />
            <time className="ml-auto shrink-0 text-muted-foreground text-xs" dateTime={row.ts}>
              {formatWhen(row.ts)}
            </time>
          </div>
        </div>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{change.label}</DialogTitle>
          </DialogHeader>
          <ActionDetailBody row={row} brandId={brandId} currency={currency} />
        </DialogContent>
      </Dialog>
    </li>
  );
}
