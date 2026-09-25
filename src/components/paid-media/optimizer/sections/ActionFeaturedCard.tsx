'use client';

// The lead of the action feed: the newest thing the optimizer did, at a size a person reads.
//
// It carries everything the old row carried — family, when, who, what it touched, before →
// after, why, the Meta receipt, and the revert (or "reverted") — with the change itself in
// large type and the move as a signed, coloured percentage.
//
// No sparkline: an action row is one before and one after (public.optimizer_list_actions
// carries no series), and fetching one per card for decoration is not this card's job.

import { ArrowRightIcon } from 'lucide-react';
import type { OptimizerActionFeedRow } from '../useOptimizerData';
import {
  type ActionEntityNames,
  ActionDelta,
  ActionEntityId,
  ActionFamilyBadge,
  ActionMeta,
  ActionRevertControl,
  ActionWhy,
  actionEntity,
  NO_ENTITY_NAMES,
  printChangeValue,
} from './actionCardParts';
import { readActionChange, readReceiptTrace } from './actionRows';
import { ReceiptToken } from './feedChrome';

export function ActionFeaturedCard({
  row,
  brandId,
  currency,
  entityNames = NO_ENTITY_NAMES,
}: {
  row: OptimizerActionFeedRow;
  brandId: string;
  currency: string | null;
  entityNames?: ActionEntityNames;
}) {
  const change = readActionChange(row);
  const receipt = readReceiptTrace(row);
  const entity = actionEntity(row, entityNames);

  return (
    <article
      className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4"
      data-action-id={row.id}
      data-testid="action-featured"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ActionFamilyBadge family={row.family} />
          <ActionMeta row={row} />
        </div>
        <ActionRevertControl row={row} brandId={brandId} currency={currency} />
      </div>

      <div className="min-w-0">
        <p className="font-medium text-muted-foreground text-xs">{change.label}</p>
        <h3 className="truncate font-medium text-base text-foreground" title={entity.name}>
          {entity.name}
        </h3>
        {entity.id ? <ActionEntityId id={entity.id} /> : null}
        {row.portfolio_name && entity.name !== row.portfolio_name ? (
          <p className="truncate text-muted-foreground text-xs" title={row.portfolio_name}>
            {row.portfolio_name}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-2xl text-muted-foreground tabular-nums">
          {printChangeValue(change, change.before, currency)}
        </span>
        <ArrowRightIcon
          aria-hidden="true"
          className="size-5 shrink-0 self-center text-muted-foreground"
        />
        <span className="font-mono font-semibold text-2xl text-foreground tabular-nums">
          {printChangeValue(change, change.after, currency)}
        </span>
        <ActionDelta change={change} className="text-base" />
      </div>

      {row.justification ? <ActionWhy text={row.justification} /> : null}
      {receipt ? <ReceiptToken value={receipt} className="mt-0 self-start text-xs" /> : null}
    </article>
  );
}
