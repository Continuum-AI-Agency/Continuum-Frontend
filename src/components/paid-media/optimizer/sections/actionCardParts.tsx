'use client';

// The pieces the action feed's two card shapes share — the featured card on top and the square
// grid card under it. Both read the same row through the same `actionRows` readers, print money
// through the one `formatCurrency`, and open the same full detail, so the lead and the grid can
// never disagree about what an action changed.
//
// Type floor: content is `text-sm` and up, labels/meta `text-xs`. The dense `text-2xs` row this
// replaced is still what `ActionRow` renders for the portfolio group; these cards do not share it.

import {
  ArrowRightIcon,
  CoinsIcon,
  GavelIcon,
  SlidersHorizontalIcon,
  Undo2Icon,
} from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent } from '../format';
import type { OptimizerActionFeedRow } from '../useOptimizerData';
import {
  type ActionChange,
  actorLabel,
  readActionChange,
  readReceiptTrace,
  revertScopeOf,
  revertState,
} from './actionRows';
import { formatWhen, ReceiptToken } from './feedChrome';
import { RevertApplyDialog } from './RevertApplyDialog';

const FAMILY_LABEL: Record<string, string> = {
  money: 'Ad account',
  settings: 'Setting',
  decision: 'Decision',
};

const FAMILY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  money: CoinsIcon,
  settings: SlidersHorizontalIcon,
  decision: GavelIcon,
};

export function ActionFamilyBadge({ family }: { family: string }) {
  const Icon = FAMILY_ICON[family] ?? SlidersHorizontalIcon;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
      <Icon aria-hidden="true" className="size-3.5" />
      {FAMILY_LABEL[family] ?? family}
    </span>
  );
}

export function ActionRevertedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
      <Undo2Icon aria-hidden="true" className="size-3.5" />
      Reverted
    </span>
  );
}

/** One side of a before → after, in the unit the change carries. Money is MINOR units in the
 *  account's currency; a null currency prints the bare figure, never "$". */
export function printChangeValue(
  change: ActionChange,
  value: string | number | null,
  currency: string | null,
): string {
  if (value == null) return '—';
  if (change.unit === 'money' && typeof value === 'number') {
    return formatCurrency(value / 100, currency);
  }
  return String(value);
}

function asNumber(value: string | number | null): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** The relative move from before to after, in percent — null whenever either side is not a
 *  number or the before is zero (a move from nothing has no honest percentage). */
export function actionDeltaPct(change: ActionChange): number | null {
  const before = asNumber(change.before);
  const after = asNumber(change.after);
  if (before == null || after == null || before === 0) return null;
  return ((after - before) / Math.abs(before)) * 100;
}

export function ActionDelta({ change, className }: { change: ActionChange; className?: string }) {
  const pct = actionDeltaPct(change);
  if (pct == null) return null;
  const rounded = Math.round(pct);
  return (
    <span
      className={cn(
        'font-semibold tabular-nums',
        rounded > 0 ? 'text-success' : rounded < 0 ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
      data-testid="action-delta"
    >
      {formatPercent(rounded, { signed: true })}
    </span>
  );
}

/** Ad-set / campaign id → the name a person reads. Built from data the optimizer screen already
 *  holds; an id missing from it is simply unnamed. */
export type ActionEntityNames = ReadonlyMap<string, string>;

export const NO_ENTITY_NAMES: ActionEntityNames = new Map();

/** What the action touched, as a person reads it: `name` is the main line, `id` the raw Meta
 *  id to print small beside it — null when the name already IS the id (nothing is known for
 *  it) or when the row names a portfolio. The RPC carries ids, not names: a settings row's
 *  `entity_id` is the FIELD (already the change label), so it is named by its portfolio. */
export function actionEntity(
  row: OptimizerActionFeedRow,
  names: ActionEntityNames = NO_ENTITY_NAMES,
): { name: string; id: string | null } {
  if (row.op !== 'setting' && row.entity_id) {
    const known = names.get(row.entity_id)?.trim();
    return known ? { name: known, id: row.entity_id } : { name: row.entity_id, id: null };
  }
  return { name: row.portfolio_name ?? 'Portfolio', id: null };
}

/** The raw id under a named entity: small, monospace, selectable. */
export function ActionEntityId({ id, className }: { id: string; className?: string }) {
  return (
    <p className={cn('truncate font-mono text-muted-foreground text-xs', className)} title={id}>
      {id}
    </p>
  );
}

/** The one-line meta every card carries: when, and who. */
export function ActionMeta({ row }: { row: OptimizerActionFeedRow }) {
  return (
    <span className="text-muted-foreground text-xs">
      <time dateTime={row.ts}>{formatWhen(row.ts)}</time>
      {' · '}
      <span>{actorLabel(row)}</span>
    </span>
  );
}

/** Revert is the SERVER's answer (`revertState`); a row already undone says so instead. */
export function ActionRevertControl({
  row,
  brandId,
  currency,
}: {
  row: OptimizerActionFeedRow;
  brandId: string;
  currency: string | null;
}) {
  const revert = revertState(row);
  if (revert.kind === 'available') {
    return (
      <RevertApplyDialog
        auditId={revert.auditId}
        portfolioId={revert.portfolioId}
        brandId={brandId}
        currency={currency}
        scope={revertScopeOf(row)}
        triggerTextSize="text-xs"
      />
    );
  }
  return revert.kind === 'reverted' ? <ActionRevertedBadge /> : null;
}

export function ActionWhy({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground text-sm leading-relaxed">
      <span className="font-medium text-foreground">Why:</span> {text}
    </p>
  );
}

/** The whole action — everything the old row carried — for the grid card's detail dialog. */
export function ActionDetailBody({
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
  const entity = actionEntity(row, entityNames);
  const receipt = readReceiptTrace(row);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ActionFamilyBadge family={row.family} />
        <ActionMeta row={row} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {row.portfolio_name ? (
          <>
            <dt className="text-muted-foreground text-xs">Portfolio</dt>
            <dd className="min-w-0 truncate">{row.portfolio_name}</dd>
          </>
        ) : null}
        {entity.id ? (
          <>
            <dt className="text-muted-foreground text-xs">Name</dt>
            <dd className="min-w-0 truncate">{entity.name}</dd>
          </>
        ) : null}
        {row.entity_id && row.op !== 'setting' ? (
          <>
            <dt className="text-muted-foreground text-xs">Entity</dt>
            <dd className="min-w-0 truncate font-mono">{row.entity_id}</dd>
          </>
        ) : null}
      </dl>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-lg text-muted-foreground tabular-nums">
          {printChangeValue(change, change.before, currency)}
        </span>
        <ArrowRightIcon
          aria-hidden="true"
          className="size-4 shrink-0 self-center text-muted-foreground"
        />
        <span className="font-mono font-semibold text-lg tabular-nums">
          {printChangeValue(change, change.after, currency)}
        </span>
        <ActionDelta change={change} className="text-sm" />
      </div>
      {row.justification ? <ActionWhy text={row.justification} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {receipt ? <ReceiptToken value={receipt} className="mt-0 text-xs" /> : <span />}
        <ActionRevertControl row={row} brandId={brandId} currency={currency} />
      </div>
    </div>
  );
}
