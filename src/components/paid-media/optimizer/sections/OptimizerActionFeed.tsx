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

import { type OptimizerFeedWindowDays, PortfolioAdsetSchema } from '@continuum/contracts';
import { skipToken, useQueries } from '@tanstack/react-query';
import { ArrowRightIcon, ListChecksIcon, Undo2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { EmptyState } from '@/components/shared/state/EmptyState';
import { formatCurrency } from '../format';
import {
  type OptimizerActionFeedRow,
  optimizerQueryKeys,
  useOptimizerActions,
} from '../useOptimizerData';
import {
  type ActionChange,
  actorLabel,
  readActionChange,
  readReceiptTrace,
  revertScopeOf,
  revertState,
} from './actionRows';
import { FeedFooter, FeedSkeleton, PortfolioFilter, ReceiptToken, RowHeader } from './feedChrome';
import { ALL_PORTFOLIOS, distinctPortfolioNames, filterByPortfolio } from './logFilters';
import { ActionFeaturedCard } from './ActionFeaturedCard';
import type { ActionEntityNames } from './actionCardParts';
import { ActionGridCard } from './ActionGridCard';
import { OptimizerReadError } from './OptimizerReadError';
import { RevertApplyDialog } from './RevertApplyDialog';

type OptimizerActionFeedProps = {
  brandId: string;
  /** The selected ad account's currency, for the minor-unit budget amounts. The feed is
   *  brand-scoped and a brand can own portfolios on more than one ad account, so this is the
   *  currency of the account being viewed — not one carried per row. Null prints the amounts
   *  bare: an account whose currency nobody recorded is not an account that spends dollars. */
  currency: string | null;
  windowDays?: OptimizerFeedWindowDays;
};

const FAMILY_LABEL: Record<string, string> = {
  money: 'Ad account',
  settings: 'Setting',
  decision: 'Decision',
};

function FamilyBadge({ family }: { family: string }) {
  return (
    <span className="shrink-0 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
        {print(change.before)}
      </span>
      <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
      <span className="font-mono text-sm font-semibold tabular-nums">{print(change.after)}</span>
    </span>
  );
}

function RevertedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
    <li className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-4 py-3">
      <FamilyBadge family={row.family} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <RowHeader size="lg" title={change.label} ts={row.ts} />
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              {row.portfolio_name ? <span className="truncate">{row.portfolio_name}</span> : null}
              {row.entity_id && row.op !== 'setting' ? (
                <span className="truncate font-mono text-xs">{row.entity_id}</span>
              ) : null}
              <span>· {actorLabel(row)}</span>
            </p>
          </div>
          {revert.kind === 'available' ? (
            <RevertApplyDialog
              auditId={revert.auditId}
              portfolioId={revert.portfolioId}
              brandId={brandId}
              currency={currency}
              scope={revertScopeOf(row)}
              triggerTextSize="text-xs"
            />
          ) : revert.kind === 'reverted' ? (
            <RevertedBadge />
          ) : null}
        </div>
        <div className="mt-0.5">
          <ChangeLine change={change} currency={currency} />
        </div>
        {row.justification ? (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Why:</span> {row.justification}
          </p>
        ) : null}
        {receipt ? <ReceiptToken value={receipt} className="text-xs" /> : null}
      </div>
    </li>
  );
}

/**
 * Which action leads the feed: the NEWEST one, by its own timestamp.
 *
 * The rows carry no impact figure (a budget write's before/after is not its effect), so
 * "highest impact" would be a guess dressed as a ranking. The RPC already returns newest
 * first; reading `ts` rather than trusting position keeps the rule true if that ever changes.
 * The rest keep the feed's order.
 */
export function splitFeaturedAction(rows: OptimizerActionFeedRow[]): {
  featured: OptimizerActionFeedRow | null;
  rest: OptimizerActionFeedRow[];
} {
  let featuredIndex = -1;
  let newest = Number.NEGATIVE_INFINITY;
  rows.forEach((row, index) => {
    const at = new Date(row.ts).getTime();
    const comparable = Number.isFinite(at) ? at : Number.NEGATIVE_INFINITY;
    if (featuredIndex === -1 || comparable > newest) {
      featuredIndex = index;
      newest = comparable;
    }
  });
  if (featuredIndex === -1) return { featured: null, rest: [] };
  return {
    featured: rows[featuredIndex] ?? null,
    rest: rows.filter((_, index) => index !== featuredIndex),
  };
}

const EnrolledRosterSchema = z.array(PortfolioAdsetSchema);

/** Folds the cached rosters into one id → name map. Module-level so `useQueries` keeps its
 *  result stable until a roster actually changes. */
function namesFromRosters(rosters: { data: unknown }[]): ActionEntityNames {
  const names = new Map<string, string>();
  for (const roster of rosters) {
    const parsed = EnrolledRosterSchema.safeParse(roster.data);
    if (!parsed.success) continue;
    for (const adset of parsed.data) {
      const name = adset.adset_name?.trim();
      if (name) names.set(adset.adset_id, name);
    }
  }
  return names;
}

/**
 * Names for the ids the action rows carry, from the enrolled rosters the portfolio screen
 * already loaded (`optimizerQueryKeys.enrolledAdsets`, filled by the portfolio detail and its
 * hover prefetch, the Actions groups and the manage panel). It OBSERVES that cache and never
 * fetches (`skipToken`): the feed spans every portfolio of the brand, and a read per portfolio
 * just to decorate a card is not this surface's job. A roster that lands later re-renders
 * the cards named; an id no roster knows stays an id.
 */
export function useActionEntityNames(rows: OptimizerActionFeedRow[]): ActionEntityNames {
  const portfolioIds = useMemo(
    () =>
      Array.from(
        new Set(rows.flatMap((row) => (row.portfolio_id ? [row.portfolio_id] : []))),
      ).sort(),
    [rows],
  );
  return useQueries({
    queries: portfolioIds.map((portfolioId) => ({
      queryKey: optimizerQueryKeys.enrolledAdsets(portfolioId),
      queryFn: skipToken,
    })),
    combine: namesFromRosters,
  });
}

// Written out whole because Tailwind reads source text. Fewer cards than a full row get
// fewer columns, so two cards fill the width instead of leaving two empty cells beside them.
const GRID_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
};
const GRID_COLUMNS_FULL = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

function ActionFeedCards({
  rows,
  brandId,
  currency,
}: {
  rows: OptimizerActionFeedRow[];
  brandId: string;
  currency: string | null;
}) {
  const entityNames = useActionEntityNames(rows);
  const { featured, rest } = splitFeaturedAction(rows);
  if (!featured) return null;
  return (
    <div className="space-y-3">
      <ActionFeaturedCard
        row={featured}
        brandId={brandId}
        currency={currency}
        entityNames={entityNames}
      />
      {rest.length > 0 ? (
        <ul
          className={`grid items-stretch gap-3 ${GRID_COLUMNS[rest.length] ?? GRID_COLUMNS_FULL}`}
          data-testid="action-grid"
        >
          {rest.map((row) => (
            <ActionGridCard
              key={row.id}
              row={row}
              brandId={brandId}
              currency={currency}
              entityNames={entityNames}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function OptimizerActionFeed({
  brandId,
  currency,
  windowDays = 7,
}: OptimizerActionFeedProps) {
  const actionsQuery = useOptimizerActions(brandId, windowDays);
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
        <ActionFeedCards rows={visible} brandId={brandId} currency={currency} />
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
