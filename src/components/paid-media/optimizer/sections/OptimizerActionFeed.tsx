'use client';

// The ACTION feed — everything the optimizer did to the ad account, newest first.
//
// One row = one state change with a real before and a real after: a budget write, an ad-set
// pause or unpause, a portfolio setting edit, a recommendation approved or rejected. It comes
// from public.optimizer_list_actions, which reads the audit tables directly, so the row also
// carries WHO authorized it, WHY (the justification persisted at cycle time), the platform it
// wrote to with that platform's receipt,
// and whether it can still be undone.
//
// The account-wide feed renders as a timeline grouped by day (feedTimeline): a clock time, a
// dot for how it went, the change, its portfolio and why, and the undo on the right.
// `ActionRow` is the same change as a quiet row, for the portfolio queue's Recently applied.
//
// Revert is gated on the row's own `reversible` flag from the RPC — never on a client guess —
// and a row that has already been undone renders as "reverted" instead of offering the button
// again.

import { type OptimizerFeedWindowDays, PortfolioAdsetSchema } from '@continuum/contracts';
import { skipToken, useQueries } from '@tanstack/react-query';
import { ArrowRightIcon, ListChecksIcon } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { z } from 'zod';
import { EmptyState } from '@/components/shared/state/EmptyState';
import {
  type OptimizerActionFeedRow,
  optimizerQueryKeys,
  useOptimizerActions,
} from '../useOptimizerData';
import {
  ActionDelta,
  type ActionEntityNames,
  ActionRevertControl,
  actionEntity,
  NO_ENTITY_NAMES,
  printChangeValue,
} from './actionCardParts';
import { actionPlatform, actorLabel, readActionChange, readReceiptTrace } from './actionRows';
import { MoveDecisionCard } from './crossPlatformMove/MoveDecisionCard';
import { groupActionFeed } from './crossPlatformMove/moveDecisionModel';
import { FeedFooter, FeedSkeleton, formatWhen, PortfolioFilter, ReceiptToken } from './feedChrome';
import {
  FeedToolbar,
  groupByDay,
  TimelineDay,
  TimelineEntry,
  type TimelineTone,
} from './feedTimeline';
import { ALL_PORTFOLIOS, distinctPortfolioNames, filterByPortfolio } from './logFilters';
import { OptimizerReadError } from './OptimizerReadError';
import { PlatformChip } from './platforms/PlatformChip';

type OptimizerActionFeedProps = {
  brandId: string;
  /** The selected ad account's currency, for the minor-unit budget amounts. The feed is
   *  brand-scoped and a brand can own portfolios on more than one ad account, so this is the
   *  currency of the account being viewed — not one carried per row. Null prints the amounts
   *  bare: an account whose currency nobody recorded is not an account that spends dollars. */
  currency: string | null;
  windowDays?: OptimizerFeedWindowDays;
  /** The host's filters (feed switch, window), drawn on the same line as the portfolio filter. */
  controls?: ReactNode;
};

const FAMILY_LABEL: Record<string, string> = {
  money: 'Ad account',
  settings: 'Setting',
  decision: 'Decision',
};

/**
 * One write as a quiet row — the shape the portfolio queue lists under "Recently applied":
 * the change and what it touched (by name; the raw id on hover), before → after in mono with
 * its delta, then when · who · what family · which platform, the why, the receipt, and the
 * undo on the right.
 */
export function ActionRow({
  row,
  brandId,
  currency,
  entityNames = NO_ENTITY_NAMES,
}: {
  row: OptimizerActionFeedRow;
  brandId: string;
  currency: string | null;
  /** Ad-set id → name from the rosters the host already holds. */
  entityNames?: ActionEntityNames;
}) {
  const change = readActionChange(row);
  const entity = actionEntity(row, entityNames);
  const platform = actionPlatform(row);
  const receipt = readReceiptTrace(row);

  return (
    <li
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 py-3"
      data-action-id={row.id}
    >
      <div className="min-w-0">
        <p className="text-sm leading-snug">
          <span className="font-semibold text-foreground">{change.label}</span>{' '}
          {row.op !== 'setting' ? (
            <span className="text-foreground" title={entity.id ?? undefined}>
              {entity.name}
            </span>
          ) : null}{' '}
          <span className="inline-flex items-center gap-1.5 text-xs" data-figure-role="change">
            <span className="font-mono text-muted-foreground tabular-nums">
              {printChangeValue(change, change.before, currency)}
            </span>
            <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
            <span className="font-mono font-semibold text-foreground tabular-nums">
              {printChangeValue(change, change.after, currency)}
            </span>
            <ActionDelta change={change} />
          </span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-muted-foreground text-xs">
          <time dateTime={row.ts}>{formatWhen(row.ts)}</time>
          <span>· {actorLabel(row)}</span>
          <span>· {FAMILY_LABEL[row.family] ?? row.family}</span>
          {row.portfolio_name && row.op === 'setting' ? <span>· {row.portfolio_name}</span> : null}
          <PlatformChip platform={platform} />
        </p>
        {row.justification ? (
          <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
            Why: {row.justification}
          </p>
        ) : null}
        {receipt ? <ReceiptToken value={receipt} platform={platform} /> : null}
      </div>
      <ActionRevertControl brandId={brandId} currency={currency} row={row} />
    </li>
  );
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

function readOutcome(row: OptimizerActionFeedRow): string | null {
  const value = (row as Record<string, unknown>).outcome;
  return typeof value === 'string' ? value.toLowerCase() : null;
}

const STOPPED_OUTCOMES = new Set(['failed', 'refused', 'error']);
const ASKING_DECISIONS = new Set(['pending', 'proposed', 'asked']);
const LANDED_DECISIONS = new Set(['approved', 'applied']);

/**
 * How an action reads on the timeline's dot. A refused or failed write and a pause are red; a
 * write that landed (a budget, an unpause, a restructure) is green; a recommendation still
 * waiting on someone is primary, because it asks a decision. Settings, rejected decisions and
 * rows that were since undone stay muted: nothing about them is still in force or still asks.
 */
export function actionTone(row: OptimizerActionFeedRow): TimelineTone {
  const outcome = readOutcome(row);
  if (outcome && STOPPED_OUTCOMES.has(outcome)) return 'stopped';
  if (row.reverted_by) return 'neutral';
  const change = readActionChange(row);
  const after = typeof change.after === 'string' ? change.after.toLowerCase() : null;
  switch (row.op) {
    case 'budget':
    case 'convert':
    // A platform write's own kinds (G4): a bid target, negatives or a keyword that landed.
    case 'bid':
    case 'negatives':
    case 'keyword':
      return 'landed';
    case 'status':
      return after === 'paused' ? 'stopped' : after === 'active' ? 'landed' : 'neutral';
    case 'decision':
      if (after && ASKING_DECISIONS.has(after)) return 'asks';
      return after && LANDED_DECISIONS.has(after) ? 'landed' : 'neutral';
    default:
      return 'neutral';
  }
}

function ActionTimelineEntry({
  row,
  brandId,
  currency,
  entityNames,
}: {
  row: OptimizerActionFeedRow;
  brandId: string;
  currency: string | null;
  entityNames: ActionEntityNames;
}) {
  const change = readActionChange(row);
  const entity = actionEntity(row, entityNames);
  const platform = actionPlatform(row);
  const receipt = readReceiptTrace(row);
  // A settings row is named by its portfolio already; printing it twice says nothing new.
  const portfolioSuffix = row.portfolio_name && row.op !== 'setting' ? row.portfolio_name : null;

  return (
    <TimelineEntry
      action={<ActionRevertControl row={row} brandId={brandId} currency={currency} />}
      data-action-id={row.id}
      tone={actionTone(row)}
      ts={row.ts}
    >
      <p className="text-sm leading-snug">
        <span className="font-semibold text-foreground">{change.label}</span>{' '}
        <span className="text-foreground" title={entity.id ?? undefined}>
          {entity.name}
        </span>
        {portfolioSuffix ? (
          <span className="text-muted-foreground text-xs"> · {portfolioSuffix}</span>
        ) : null}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
        <span className="inline-flex items-center gap-1.5" data-figure-role="change">
          <span className="font-mono tabular-nums">
            {printChangeValue(change, change.before, currency)}
          </span>
          <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0" />
          <span className="font-mono font-semibold text-foreground tabular-nums">
            {printChangeValue(change, change.after, currency)}
          </span>
          <ActionDelta change={change} />
        </span>
        <span>· {actorLabel(row)}</span>
        <PlatformChip platform={platform} />
      </div>
      {row.justification ? (
        <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
          Why: {row.justification}
        </p>
      ) : null}
      {receipt ? <ReceiptToken value={receipt} platform={platform} /> : null}
    </TimelineEntry>
  );
}

function ActionTimeline({
  rows,
  brandId,
  currency,
}: {
  rows: OptimizerActionFeedRow[];
  brandId: string;
  currency: string | null;
}) {
  const entityNames = useActionEntityNames(rows);
  // A cross-platform move is ONE decision, however many writes it took: its legs fold into a
  // single entry where its newest write stood.
  const items = groupActionFeed(rows);
  const days = groupByDay(items, (item) => (item.kind === 'move' ? item.move.ts : item.row.ts));
  return (
    <div data-testid="action-timeline">
      {days.map((day) => (
        <TimelineDay key={day.label} label={day.label} testId="action-day">
          {day.items.map((item) =>
            item.kind === 'move' ? (
              <MoveDecisionCard
                brandId={brandId}
                className="space-y-2 rounded-none border-0 bg-transparent py-2 pr-0 pl-[4.75rem]"
                currency={currency}
                key={item.move.moveId}
                move={item.move}
              />
            ) : (
              <ActionTimelineEntry
                brandId={brandId}
                currency={currency}
                entityNames={entityNames}
                key={item.row.id}
                row={item.row}
              />
            ),
          )}
        </TimelineDay>
      ))}
    </div>
  );
}

export function OptimizerActionFeed({
  brandId,
  currency,
  windowDays = 7,
  controls,
}: OptimizerActionFeedProps) {
  const actionsQuery = useOptimizerActions(brandId, windowDays);
  const [portfolio, setPortfolio] = useState<string>(ALL_PORTFOLIOS);

  if (actionsQuery.isLoading) {
    return (
      <div className="space-y-3">
        <FeedToolbar controls={controls} />
        <FeedSkeleton />
      </div>
    );
  }

  // A failed read must never render as "nothing has happened" — the outage and the genuinely
  // quiet brand look identical otherwise.
  if (actionsQuery.isError) {
    return (
      <div className="space-y-3">
        <FeedToolbar controls={controls} />
        <OptimizerReadError
          error={actionsQuery.error}
          onRetry={() => void actionsQuery.refetch()}
          subject="the action feed"
        />
      </div>
    );
  }

  const actions = actionsQuery.data;
  if (actions.length === 0) {
    return (
      <div className="space-y-3">
        <FeedToolbar controls={controls} />
        <EmptyState
          headline="Nothing has changed yet"
          media={<ListChecksIcon aria-hidden="true" />}
          description="Budget writes, pauses, setting edits and recommendation decisions appear here with their before, their after, and a one-click undo."
        />
      </div>
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
    <div className="space-y-2">
      <FeedToolbar controls={controls}>
        <PortfolioFilter
          names={portfolioNames}
          value={effectivePortfolio}
          onChange={setPortfolio}
          label="Filter actions by portfolio"
        />
      </FeedToolbar>
      {visible.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-xs">
          No actions for this portfolio in what has loaded.
        </p>
      ) : (
        <ActionTimeline rows={visible} brandId={brandId} currency={currency} />
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
