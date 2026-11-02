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
// On the Activity page the host narrows it by hand (Optimizer, Team, Platform), lists what the
// platform did beside the writes (pages/activity/activityModel), and lights the entry its chart
// points at — every entry carries the event id its dot carries, so the two always meet.
//
// Revert is gated on the row's own `reversible` flag from the RPC — never on a client guess —
// and a row that has already been undone renders as "reverted" instead of offering the button
// again.

import { type OptimizerFeedWindowDays, PortfolioAdsetSchema } from '@continuum/contracts';
import { useQueries } from '@tanstack/react-query';
import { ArrowRightIcon, ListChecksIcon } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { z } from 'zod';
import { EmptyState } from '@/components/shared/state/EmptyState';
import { cn } from '@/lib/utils';
import {
  enrolledAdsetsQuery,
  type OptimizerActionFeedRow,
  useOptimizerActions,
  useOptimizerAdAccounts,
  useOptimizerPortfolios,
} from '../useOptimizerData';
import {
  ActionDelta,
  type ActionEntityNames,
  ActionRevertControl,
  actionEntity,
  NO_ENTITY_NAMES,
  printChangeValue,
} from './actionCardParts';
import {
  actionCurrency,
  actionPlatform,
  actorLabel,
  readActionChange,
  readReceiptTrace,
} from './actionRows';
import { MoveDecisionCard } from './crossPlatformMove/MoveDecisionCard';
import { type ActionFeedItem, groupActionFeed } from './crossPlatformMove/moveDecisionModel';
import { FeedFooter, FeedSkeleton, formatWhen, PortfolioFilter, ReceiptToken } from './feedChrome';
import {
  FeedToolbar,
  groupByDay,
  TimelineDay,
  TimelineEntry,
  type TimelineTone,
} from './feedTimeline';
import { ALL_PORTFOLIOS, distinctPortfolioNames } from './logFilters';
import { OptimizerReadError } from './OptimizerReadError';
import {
  type ActivityPlatformItem,
  type ActivitySourceFilter,
  actionEventId,
  filterActions,
  filterPlatformItems,
  moveEventId,
  SOURCE_COPY,
} from './pages/activity/activityModel';
import { PlatformEventEntry } from './pages/activity/PlatformEventEntry';
import { PlatformChip } from './platforms/PlatformChip';

type OptimizerActionFeedProps = {
  brandId: string;
  windowDays?: OptimizerFeedWindowDays;
  /** Drawn under the feed once it has answered — never under the loading skeleton, which the
   *  timeline replaces at another height and would push it down (CLS on a phone). */
  footer?: ReactNode;
  /** Which hand's changes to list (the Activity page's source filter). */
  source?: ActivitySourceFilter;
  /** The portfolio narrowing, when the host holds it (so its chart narrows with the list). */
  portfolio?: string;
  onPortfolioChange?: (portfolio: string) => void;
  /** What the platform did in the window, listed by time beside the actions. */
  platformItems?: readonly ActivityPlatformItem[];
  /** The entry the host's chart points at, lit in the list; a hovered entry is reported back. */
  highlightedId?: string | null;
  onHighlight?: (id: string | null) => void;
};

const NO_PLATFORM_ITEMS: readonly ActivityPlatformItem[] = [];

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
          <span className="font-semibold text-foreground">{change.sentence ?? change.label}</span>{' '}
          {row.op !== 'setting' ? (
            <span className="text-foreground" title={entity.id ?? undefined}>
              {entity.name}
            </span>
          ) : null}{' '}
          {change.sentence ? null : (
            <span className="inline-flex items-center gap-1.5 text-xs" data-figure-role="change">
              <span className="font-mono text-muted-foreground tabular-nums">
                {printChangeValue(change, change.before, currency)}
              </span>
              <ArrowRightIcon
                aria-hidden="true"
                className="size-3 shrink-0 text-muted-foreground"
              />
              <span className="font-mono font-semibold text-foreground tabular-nums">
                {printChangeValue(change, change.after, currency)}
              </span>
              <ActionDelta change={change} />
            </span>
          )}
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
 * Names for the ids the action rows carry, from the enrolled roster of each portfolio the feed
 * mentions (`enrolledAdsetsQuery` — the same key and staleTime the portfolio detail, its hover
 * prefetch, the Actions groups and the manage panel read, so a roster already loaded costs
 * nothing). It used to only observe that cache, and an operator who opened Activity first read
 * "Daily budget 120252366915460236" on every row. A brand holds a handful of portfolios, so
 * one small roster read each is the price of a feed people can read. Until a roster lands — or
 * when it never does, or the ad set has since left the portfolio — the id stays an id.
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
    queries: portfolioIds.map((portfolioId) => enrolledAdsetsQuery(portfolioId)),
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
  highlighted,
}: {
  row: OptimizerActionFeedRow;
  brandId: string;
  currency: string | null;
  entityNames: ActionEntityNames;
  highlighted: boolean;
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
      className={cn('-mx-2 rounded-md px-2 transition-colors', highlighted && 'bg-muted/70')}
      data-action-id={row.id}
      data-event-id={actionEventId(row)}
      data-highlighted={highlighted ? 'true' : undefined}
      tone={actionTone(row)}
      ts={row.ts}
    >
      <p className="text-sm leading-snug">
        <span className="font-semibold text-foreground">{change.sentence ?? change.label}</span>{' '}
        <span className="text-foreground" title={entity.id ?? undefined}>
          {entity.name}
        </span>
        {portfolioSuffix ? (
          <span className="text-muted-foreground text-xs"> · {portfolioSuffix}</span>
        ) : null}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
        {change.sentence ? null : (
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
        )}
        <span>
          {change.sentence ? '' : '· '}
          {actorLabel(row)}
        </span>
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

/**
 * Each row's currency (actionCurrency), from the brand's portfolios and ad accounts — the same
 * cached reads the Optimizer page already holds, so it costs no request of its own.
 */
function useActionCurrency(brandId: string): (row: OptimizerActionFeedRow) => string | null {
  const portfolios = useOptimizerPortfolios(brandId, null).brandPortfolios;
  const accounts = useOptimizerAdAccounts(brandId).data;
  return useCallback(
    (row: OptimizerActionFeedRow) => actionCurrency(row, portfolios, accounts),
    [portfolios, accounts],
  );
}

type TimelineItem = ActionFeedItem | { kind: 'platform'; item: ActivityPlatformItem };

function itemTs(item: TimelineItem): string {
  if (item.kind === 'platform') return item.item.ts;
  return item.kind === 'move' ? item.move.ts : item.row.ts;
}

/** The actions, a cross-platform move folded into one entry where its newest write stood, then
 *  the platform's events placed by time among them. Both arrive newest first; the merge keeps
 *  each one's own order, so a day still appears once. */
function mergeTimeline(
  rows: OptimizerActionFeedRow[],
  platform: readonly ActivityPlatformItem[],
): TimelineItem[] {
  const actions: TimelineItem[] = groupActionFeed(rows);
  if (platform.length === 0) return actions;
  const pending = platform.map((item): TimelineItem => ({ kind: 'platform', item }));
  const merged: TimelineItem[] = [];
  let next = 0;
  for (const item of actions) {
    const at = Date.parse(itemTs(item));
    for (; next < pending.length && Date.parse(itemTs(pending[next])) > at; next += 1) {
      merged.push(pending[next]);
    }
    merged.push(item);
  }
  return merged.concat(pending.slice(next));
}

function ActionTimeline({
  rows,
  platformItems,
  brandId,
  highlightedId,
  onHighlight,
}: {
  rows: OptimizerActionFeedRow[];
  platformItems: readonly ActivityPlatformItem[];
  brandId: string;
  highlightedId: string | null;
  onHighlight?: (id: string | null) => void;
}) {
  const entityNames = useActionEntityNames(rows);
  const currencyOf = useActionCurrency(brandId);
  const days = groupByDay(mergeTimeline(rows, platformItems), itemTs);
  // A hovered entry lights its dot on the chart: one listener for the whole list, reading the
  // entry under the pointer by its event id.
  const reportHover = onHighlight
    ? (target: EventTarget) => {
        const entry = target instanceof Element ? target.closest('[data-event-id]') : null;
        onHighlight(entry?.getAttribute('data-event-id') ?? null);
      }
    : undefined;
  return (
    <div
      data-testid="action-timeline"
      onPointerLeave={onHighlight ? () => onHighlight(null) : undefined}
      onPointerOver={reportHover ? (event) => reportHover(event.target) : undefined}
    >
      {days.map((day) => (
        <TimelineDay key={day.label} label={day.label} testId="action-day">
          {day.items.map((item) => {
            if (item.kind === 'platform') {
              return (
                <PlatformEventEntry
                  highlighted={item.item.id === highlightedId}
                  item={item.item}
                  key={item.item.id}
                />
              );
            }
            if (item.kind === 'move') {
              return (
                <MoveDecisionCard
                  className={cn(
                    'space-y-2 rounded-none border-0 bg-transparent py-2 pr-0 pl-[4.75rem] transition-colors',
                    moveEventId(item.move.moveId) === highlightedId && 'rounded-md bg-muted/70',
                  )}
                  currency={currencyOf(item.move.actorRow)}
                  key={item.move.moveId}
                  move={item.move}
                />
              );
            }
            return (
              <ActionTimelineEntry
                brandId={brandId}
                currency={currencyOf(item.row)}
                entityNames={entityNames}
                highlighted={actionEventId(item.row) === highlightedId}
                key={item.row.id}
                row={item.row}
              />
            );
          })}
        </TimelineDay>
      ))}
    </div>
  );
}

/** What the list says when the narrowing leaves nothing of what has loaded. */
function emptyNarrowingLine(source: ActivitySourceFilter, portfolio: string): string {
  if (source !== 'all') {
    return `Nothing from ${SOURCE_COPY[source].label.toLowerCase()} in what has loaded${
      portfolio === ALL_PORTFOLIOS ? '' : ' for this portfolio'
    }.`;
  }
  return 'No actions for this portfolio in what has loaded.';
}

export function OptimizerActionFeed({
  brandId,
  windowDays = 7,
  footer,
  source = 'all',
  portfolio: heldPortfolio,
  onPortfolioChange,
  platformItems = NO_PLATFORM_ITEMS,
  highlightedId = null,
  onHighlight,
}: OptimizerActionFeedProps) {
  const actionsQuery = useOptimizerActions(brandId, windowDays);
  const [ownPortfolio, setOwnPortfolio] = useState<string>(ALL_PORTFOLIOS);
  const portfolio = heldPortfolio ?? ownPortfolio;
  const setPortfolio = onPortfolioChange ?? setOwnPortfolio;

  if (actionsQuery.isLoading) return <FeedSkeleton />;

  // A failed read must never render as "nothing has happened" — the outage and the genuinely
  // quiet brand look identical otherwise.
  if (actionsQuery.isError) {
    return (
      <div className="space-y-3">
        <OptimizerReadError
          error={actionsQuery.error}
          onRetry={() => void actionsQuery.refetch()}
          subject="the action feed"
        />
        {footer}
      </div>
    );
  }

  const actions = actionsQuery.data;
  if (actions.length === 0 && platformItems.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState
          headline="Nothing has changed yet"
          media={<ListChecksIcon aria-hidden="true" />}
          description="Budget writes, pauses, setting edits and recommendation decisions appear here with their before, their after, and a one-click undo."
        />
        {footer}
      </div>
    );
  }

  const portfolioNames = distinctPortfolioNames([
    ...actions.map((row) => ({ portfolio_name: row.portfolio_name ?? null })),
    ...platformItems.map((item) => ({ portfolio_name: item.portfolioName })),
  ]);
  // A previously-chosen portfolio can vanish after a refetch; fall back to "all" so the feed
  // never silently renders empty against a stale selection.
  const effectivePortfolio = portfolioNames.includes(portfolio) ? portfolio : ALL_PORTFOLIOS;
  const filter = { source, portfolio: effectivePortfolio };
  const visible = filterActions(actions, filter);
  const visiblePlatform = filterPlatformItems(platformItems, filter);

  return (
    <div className="space-y-2">
      <FeedToolbar>
        <PortfolioFilter
          names={portfolioNames}
          value={effectivePortfolio}
          onChange={setPortfolio}
          label="Filter actions by portfolio"
        />
      </FeedToolbar>
      {visible.length === 0 && visiblePlatform.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-xs">
          {emptyNarrowingLine(source, effectivePortfolio)}
        </p>
      ) : (
        <ActionTimeline
          brandId={brandId}
          highlightedId={highlightedId}
          onHighlight={onHighlight}
          platformItems={visiblePlatform}
          rows={visible}
        />
      )}
      <FeedFooter
        loaded={actions.length}
        hasMore={actionsQuery.hasNextPage}
        isFetchingMore={actionsQuery.isFetchingNextPage}
        onLoadMore={() => void actionsQuery.fetchNextPage()}
        noun="actions"
      />
      {footer}
    </div>
  );
}
