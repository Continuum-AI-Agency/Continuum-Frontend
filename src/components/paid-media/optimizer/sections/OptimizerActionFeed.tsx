'use client';

// The ACTION feed — everything the optimizer did to the ad account, newest first.
//
// One row = one state change with a real before and a real after: a budget write, an ad-set
// pause or unpause, a portfolio setting edit, a recommendation approved or rejected. It comes
// from public.optimizer_list_actions, which reads the audit tables directly, so the row also
// carries WHO authorized it, WHY (the justification persisted at cycle time), the Meta receipt,
// and whether it can still be undone.
//
// Revert is gated on the row's own `reversible` flag from the RPC — never on a client guess —
// and a row that has already been undone renders as "reverted" instead of offering the button
// again.

import { ArrowRightIcon, ListChecksIcon, Undo2Icon } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/state/EmptyState';
import { formatCurrency } from '../format';
import { type OptimizerActionFeedRow, useOptimizerActions } from '../useOptimizerData';
import {
  type ActionChange,
  actorLabel,
  readActionChange,
  readReceiptTrace,
  revertScopeOf,
  revertState,
} from './actionRows';
import {
  FeedFooter,
  FeedSkeleton,
  PortfolioFilter,
  ReceiptToken,
  RowHeader,
} from './feedChrome';
import { ALL_PORTFOLIOS, distinctPortfolioNames, filterByPortfolio } from './logFilters';
import { OptimizerReadError } from './OptimizerReadError';
import { RevertApplyDialog } from './RevertApplyDialog';

type OptimizerActionFeedProps = {
  brandId: string;
  /** The selected ad account's currency, for the minor-unit budget amounts. The feed is
   *  brand-scoped and a brand can own portfolios on more than one ad account, so this is the
   *  currency of the account being viewed — not one carried per row. formatCurrency falls
   *  back to the USD symbol when it is null; the amounts themselves are always exact. */
  currency: string | null;
};

const FAMILY_LABEL: Record<string, string> = {
  money: 'Ad account',
  settings: 'Setting',
  decision: 'Decision',
};

function FamilyBadge({ family }: { family: string }) {
  return (
    <span className="shrink-0 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
      {FAMILY_LABEL[family] ?? family}
    </span>
  );
}

function ChangeLine({ change, currency }: { change: ActionChange; currency: string | null }) {
  const print = (value: string | number | null): string => {
    if (value == null) return '—';
    if (change.unit === 'money' && typeof value === 'number') {
      return formatCurrency(value / 100, currency);
    }
    return String(value);
  };
  // The row header already names the field; repeating it here just doubled every line.
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-2xs tabular-nums text-muted-foreground">
        {print(change.before)}
      </span>
      <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
      <span className="font-mono text-2xs font-semibold tabular-nums">{print(change.after)}</span>
    </span>
  );
}

function RevertedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Undo2Icon aria-hidden="true" className="size-3" />
      Reverted
    </span>
  );
}

export function ActionRow({
  row,
  brandId,
  currency,
}: {
  row: OptimizerActionFeedRow;
  brandId: string;
  currency: string | null;
}) {
  const change = readActionChange(row);
  const receipt = readReceiptTrace(row);
  const revert = revertState(row);

  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-3 py-2">
      <FamilyBadge family={row.family} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <RowHeader title={change.label} ts={row.ts} />
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {row.portfolio_name ? <span className="truncate">{row.portfolio_name}</span> : null}
              {row.entity_id && row.op !== 'setting' ? (
                <span className="truncate font-mono text-2xs">{row.entity_id}</span>
              ) : null}
              <span>· {actorLabel(row)}</span>
            </p>
          </div>
          {revert.kind === 'available' ? (
            <RevertApplyDialog
              auditId={revert.auditId}
              portfolioId={revert.portfolioId}
              brandId={brandId}
              scope={revertScopeOf(row)}
            />
          ) : revert.kind === 'reverted' ? (
            <RevertedBadge />
          ) : null}
        </div>
        <div className="mt-0.5">
          <ChangeLine change={change} currency={currency} />
        </div>
        {row.justification ? (
          <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Why:</span> {row.justification}
          </p>
        ) : null}
        {receipt ? <ReceiptToken value={receipt} /> : null}
      </div>
    </li>
  );
}

export function OptimizerActionFeed({ brandId, currency }: OptimizerActionFeedProps) {
  const actionsQuery = useOptimizerActions(brandId);
  const [portfolio, setPortfolio] = useState<string>(ALL_PORTFOLIOS);

  if (actionsQuery.isLoading) return <FeedSkeleton />;

  // A failed read must never render as "nothing has happened" — the outage and the genuinely
  // quiet brand look identical otherwise.
  if (actionsQuery.isError) {
    return (
      <OptimizerReadError
        error={actionsQuery.error}
        onRetry={() => void actionsQuery.refetch()}
        subject="the action feed"
      />
    );
  }

  const actions = actionsQuery.data;
  if (actions.length === 0) {
    return (
      <EmptyState
        headline="Nothing has changed yet"
        media={<ListChecksIcon aria-hidden="true" />}
        description="Budget writes, pauses, setting edits and recommendation decisions appear here with their before, their after, and a one-click undo."
      />
    );
  }

  const portfolioNames = distinctPortfolioNames(
    actions.map((row) => ({ portfolio_name: row.portfolio_name ?? null })),
  );
  // A previously-chosen portfolio can vanish after a refetch; fall back to "all" so the feed
  // never silently renders empty against a stale selection.
  const effectivePortfolio = portfolioNames.includes(portfolio) ? portfolio : ALL_PORTFOLIOS;
  const visible = filterByPortfolio(actions, effectivePortfolio);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <PortfolioFilter
          names={portfolioNames}
          value={effectivePortfolio}
          onChange={setPortfolio}
          label="Filter actions by portfolio"
        />
      </div>
      {visible.length === 0 ? (
        <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
          No actions for this portfolio in what has loaded.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => (
            <ActionRow key={row.id} row={row} brandId={brandId} currency={currency} />
          ))}
        </ul>
      )}
      <FeedFooter
        loaded={actions.length}
        hasMore={actionsQuery.hasNextPage}
        isFetchingMore={actionsQuery.isFetchingNextPage}
        onLoadMore={() => void actionsQuery.fetchNextPage()}
        noun="actions"
      />
    </div>
  );
}
