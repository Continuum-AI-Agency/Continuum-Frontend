'use client';

// Overview — the optimizer's front page.
//
// One board, then the rest. The board is the account's state as a single surface: the lead
// card (what is worth attention today, or how the account is doing when nothing is), the
// four health tiles seated under it as one row (what the book spends per day, what it spent
// yesterday against that, how much of it runs itself, what is waiting on a decision), and
// the line saying when the read was taken with the control to ask again. It used to be four
// strips with gaps between them — hero, dateline, a "nothing to move" panel, a folded
// autonomy control — and it read as a stack of leftovers. Then the spend-by-objective stream
// with the live split beside it, and the portfolio cards; the legend filters the cards, so
// "show me the lead portfolios" is one click.
//
// The account-level autonomy controls are not here. They have a tab of their own.

import type { OptimizationObjective, PortfolioListItem } from '@continuum/contracts';
import { applyApprovals, OptimizationObjectiveSchema } from '@continuum/contracts';
import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { budgetByObjective, lastFullDay, type SpendStream, spendStream } from '../charts/chartData';
import { SpendByObjectiveStream } from '../charts/SpendByObjectiveStream';
import { KpiTile } from '../components/KpiTile';
import { StatusChip, type StatusTone } from '../components/StatusChip';
import { figureProps, formatCurrency, formatPercent, humanize } from '../format';
import { pendingWorkCount } from '../reportModel';
import {
  useAccountApprovals,
  useInsightApprovalMutations,
  useOptimizerAccountRead,
  useOptimizerSpendByObjective,
  useRequestAccountRead,
} from '../useOptimizerData';
import { AccountLeadCard, type AccountMix } from './account/AccountLeadCard';
import { AccountRead } from './account/AccountRead';
import { AccountReadFreshness } from './account/AccountReadFreshness';
import { OptimizerPanel } from './OptimizerPanel';
import { PortfolioRowCard, portfolioLeads } from './PortfolioRowCard';
import { staleCount, underManagement } from './portfolioStaleness';

type SortKey = 'name' | 'daily' | 'pending';
type SortDir = 'asc' | 'desc';

const STREAM_DAYS = 14;

/**
 * The objective the account mostly buys, by money rather than by count.
 *
 * The rung line says what a figure BUYS — money, a person, an intent, attention — and a
 * mixed account has no single answer, so the largest book wins and a tie says nothing.
 * The read doc does not carry an objective yet; the portfolio list does.
 */
export function dominantObjective(portfolios: PortfolioListItem[]): OptimizationObjective | null {
  const byObjective = new Map<OptimizationObjective, number>();
  for (const portfolio of portfolios) {
    const parsed = OptimizationObjectiveSchema.safeParse(portfolio.objective);
    if (!parsed.success) continue;
    byObjective.set(
      parsed.data,
      (byObjective.get(parsed.data) ?? 0) + (portfolio.daily_total ?? 0),
    );
  }
  let best: OptimizationObjective | null = null;
  let bestSpend = -1;
  let tied = false;
  for (const [objective, spend] of byObjective) {
    if (spend > bestSpend) {
      best = objective;
      bestSpend = spend;
      tied = false;
    } else if (spend === bestSpend) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/**
 * What the account's money is split across — the same split the legend beside the stream
 * draws, folded once here so the lead card and the legend cannot name a different leader.
 *
 * Spent over the window when there is history; the daily plan by objective when there is
 * not, which is also what the legend falls back to. Null when neither carries any money.
 */
export function accountMix(
  stream: SpendStream,
  portfolios: PortfolioListItem[],
): AccountMix | null {
  if (stream.hasData) {
    const total = Object.values(stream.totals).reduce((sum, value) => sum + value, 0);
    if (total > 0) {
      return {
        basis: 'spent',
        days: stream.points.length,
        slices: stream.objectives.map((objective) => ({
          label: humanize(objective),
          share: Math.round(((stream.totals[objective] ?? 0) / total) * 100),
        })),
      };
    }
  }
  const planned = budgetByObjective(portfolios).filter((slice) => slice.daily > 0);
  const total = planned.reduce((sum, slice) => sum + slice.daily, 0);
  if (total <= 0) return null;
  return {
    basis: 'planned',
    slices: planned.map((slice) => ({
      label: slice.name,
      share: Math.round((slice.daily / total) * 100),
    })),
  };
}

/** Pure, order-stable sort for the glance list. Nullable daily budgets sort as 0 so a
 *  half-configured portfolio does not jump to the top of a descending budget sort. */
export function sortPortfolios(
  portfolios: PortfolioListItem[],
  key: SortKey,
  dir: SortDir,
): PortfolioListItem[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...portfolios].sort((a, b) => {
    let delta: number;
    if (key === 'name') delta = a.name.localeCompare(b.name);
    else if (key === 'daily') delta = (a.daily_total ?? 0) - (b.daily_total ?? 0);
    else delta = pendingWorkCount(a) - pendingWorkCount(b);
    return delta * factor;
  });
}

/** Yesterday's spend against the daily plan, as a verdict. Null without either number. */
export function spendVsPlan(
  spent: number | null,
  plan: number,
): { pct: number; tone: StatusTone; label: string; suffix: string } | null {
  if (spent == null || plan <= 0) return null;
  const ratio = spent / plan;
  const pct = Math.round(ratio * 100);
  const share = formatPercent(pct);
  const suffix = ratio > 1.1 ? ' of plan · over' : ratio < 0.9 ? ' of plan · under' : ' of plan';
  const tone: StatusTone = ratio > 1.1 ? 'warning' : ratio < 0.9 ? 'info' : 'success';
  return { pct, tone, label: `${share}${suffix}`, suffix };
}

type OptimizerOverviewProps = {
  brandId: string;
  /** The account the read is about. Null while no account is selected. */
  adAccountId: string | null;
  portfolios: PortfolioListItem[];
  pendingCount: number;
  currency?: string | null;
  onOpenActions: () => void;
  onSelectPortfolio: (portfolioId: string) => void;
  onCreatePortfolio: () => void;
  onPrefetchPortfolio?: (portfolioId: string) => void;
};

/** The tiles sit inside the board as one row, so each drops its own frame. */
const TILE_IN_BOARD = 'rounded-none border-0';

export function OptimizerOverview({
  brandId,
  adAccountId,
  portfolios,
  pendingCount,
  currency,
  onOpenActions,
  onSelectPortfolio,
  onCreatePortfolio,
  onPrefetchPortfolio,
}: OptimizerOverviewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [objectiveFilter, setObjectiveFilter] = useState<string | null>(null);
  const spendQuery = useOptimizerSpendByObjective(brandId, STREAM_DAYS);
  // The account read opens the screen when the worker has written one. Absent is absent:
  // no spinner, no empty shell — the rest of the overview stands on its own.
  const accountRead = useOptimizerAccountRead(brandId, adAccountId);
  const approvals = useInsightApprovalMutations(brandId, adAccountId);
  const approvalMaps = useAccountApprovals(brandId, adAccountId);
  const requestRead = useRequestAccountRead(brandId, adAccountId);

  const dailyTotal = portfolios.reduce((sum, portfolio) => sum + (portfolio.daily_total ?? 0), 0);
  const autopilot = portfolios.filter((portfolio) => portfolio.apply_mode === 'autopilot');
  const paused = autopilot.filter((portfolio) => portfolio.autopilot_paused).length;
  // An autopilot portfolio that has missed a cycle is not "applying within guardrails" — it
  // is applying nothing. Counted from the read; a row without it counts as running.
  const staleAutopilot = staleCount(autopilot);
  // Enrollments minus the ad sets the rosters have lost on Meta: "24 under management" was
  // counting 14 no cycle could touch.
  const book = underManagement(portfolios);
  const stream = useMemo(
    () =>
      spendStream(spendQuery.data, STREAM_DAYS, lastFullDay(new Date().toISOString().slice(0, 10))),
    [spendQuery.data],
  );
  const spentSpark = stream.points.map((point) => point.total);
  const vsPlan = spendVsPlan(stream.latest?.total ?? null, dailyTotal);
  const mix = useMemo(() => accountMix(stream, portfolios), [stream, portfolios]);

  const visible = objectiveFilter
    ? portfolios.filter((portfolio) => portfolio.objective === objectiveFilter)
    : portfolios;
  const sorted = sortPortfolios(visible, sortKey, sortDir);

  const read = accountRead.data?.read ?? null;
  // The stored read is a nightly snapshot, so the state baked into it is last night's. Apply
  // what has been approved SINCE, against the very ceilings that read was composed under —
  // otherwise a change made at noon is invisible until tomorrow and the control looks broken.
  const shown = useMemo(() => {
    if (!read) return null;
    const maps = approvalMaps.data;
    if (!maps) return read;
    const defaults = read.ceiling_defaults as never;
    return {
      ...read,
      candidates: applyApprovals(read.candidates, { ...maps, defaults }),
      guards: applyApprovals(read.guards, { ...maps, defaults }),
    };
  }, [read, approvalMaps.data]);

  // The same read the lead card is built from, resolved per portfolio. Pure — no second fetch,
  // no hook: the portfolios list shows what today already found rather than asking again.
  const { leads, emphasised } = useMemo(
    () => portfolioLeads(shown?.candidates ?? []),
    [shown?.candidates],
  );

  const portfolioNoun = portfolios.length === 1 ? 'portfolio' : 'portfolios';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs font-semibold text-foreground" data-testid="book-line">
          {portfolios.length} {portfolioNoun} · {book.managed} ad sets under management
          {book.gone > 0 ? (
            <span className="font-normal text-muted-foreground"> · {book.gone} gone</span>
          ) : null}
        </p>
        <div className="flex items-center gap-2">
          {pendingCount > 0 ? (
            <Button
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={onOpenActions}
              size="sm"
              type="button"
              variant="secondary"
            >
              Review {pendingCount} pending
              <ArrowRightIcon aria-hidden="true" className="size-3.5" />
            </Button>
          ) : null}
          <Button
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={onCreatePortfolio}
            size="sm"
            type="button"
          >
            <PlusIcon aria-hidden="true" className="size-3.5" />
            New portfolio
          </Button>
        </div>
      </div>

      {/* The board: the lead card, the four tiles seated under it as one row, and the dateline
       *  as its foot. One border around all of it, hairlines inside — so the account's state
       *  reads as one surface rather than as a hero with a half-empty band and three strips. */}
      <section
        className="overflow-hidden rounded-lg border border-border/60 bg-card"
        data-testid="account-board"
      >
        {/* The lead card answers the question the screen is opened with — what is the ONE thing
         *  worth attention across this account, and can it be believed. On a quiet day it says
         *  how the account is doing instead, from the same series the stream below draws. */}
        {shown ? (
          <AccountLeadCard
            candidates={[...shown.candidates, ...shown.guards]}
            className="rounded-none border-0 border-b"
            currency={shown.currency ?? currency ?? null}
            dailySpend={shown.scale_per_day ?? dailyTotal}
            // The same series the stream below draws, handed down rather than fetched again —
            // and only when it HAS rows: a window of zeros is what "no snapshot history" looks
            // like, and a card cannot tell that from an account that spent nothing.
            delivery={
              stream.hasData
                ? stream.points.map((point) => ({ date: point.date, spend: point.total }))
                : null
            }
            mix={mix}
            objective={dominantObjective(portfolios)}
            onOpenPortfolio={onSelectPortfolio}
            plannedPerDay={dailyTotal}
            source={shown.model === 'deterministic' ? 'fallback' : 'brief'}
          />
        ) : null}

        <div
          className="grid grid-cols-2 gap-px bg-border/60 lg:grid-cols-4"
          data-testid="account-tiles"
        >
          <KpiTile
            className={TILE_IN_BOARD}
            figure={figureProps('tiles.daily-budget', dailyTotal, currency)}
            label="Daily budget"
            spark={spentSpark}
            sub={`planned across ${portfolios.length} ${portfolioNoun}`}
            value={formatCurrency(dailyTotal, currency)}
          />
          <KpiTile
            chip={
              vsPlan ? (
                <StatusChip
                  hint="The last full day of spend across every enrolled ad set, against the sum of the daily budgets."
                  tone={vsPlan.tone}
                >
                  <span
                    {...figureProps(
                      'tiles.spent-yesterday.vs-plan',
                      vsPlan.pct,
                      null,
                      'd1',
                      'percent',
                    )}
                  >
                    {formatPercent(vsPlan.pct)}
                  </span>
                  {vsPlan.suffix}
                </StatusChip>
              ) : (
                <StatusChip tone="muted">no spend history yet</StatusChip>
              )
            }
            className={TILE_IN_BOARD}
            figure={figureProps(
              'tiles.spent-yesterday',
              stream.latest?.total ?? null,
              currency,
              'd1',
            )}
            label="Spent yesterday"
            sub={stream.latest ? `last full day · ${STREAM_DAYS}-day trend` : undefined}
            value={stream.latest ? formatCurrency(stream.latest.total, currency) : '—'}
          />
          <KpiTile
            chip={
              paused > 0 ? (
                <StatusChip tone="warning">{paused} stopped</StatusChip>
              ) : staleAutopilot > 0 ? (
                <StatusChip
                  hint="No cycle has landed on these in at least two intervals; nothing is being applied."
                  tone="warning"
                >
                  {staleAutopilot} stale
                </StatusChip>
              ) : autopilot.length > 0 ? (
                <StatusChip tone="success">applying within guardrails</StatusChip>
              ) : (
                <StatusChip tone="muted">you approve every move</StatusChip>
              )
            }
            className={TILE_IN_BOARD}
            figure={figureProps('tiles.on-autopilot', autopilot.length, null, 'none', 'count')}
            label="On autopilot"
            sub={
              book.gone > 0
                ? `of ${portfolios.length} ${portfolioNoun} · ${book.gone} ad ${book.gone === 1 ? 'set' : 'sets'} gone`
                : `of ${portfolios.length} ${portfolioNoun}`
            }
            value={String(autopilot.length)}
          />
          <KpiTile
            action={
              pendingCount > 0 ? (
                <button
                  className="text-2xs text-primary hover:underline"
                  onClick={onOpenActions}
                  type="button"
                >
                  Review
                </button>
              ) : null
            }
            chip={
              pendingCount > 0 ? (
                <StatusChip tone="info">waiting on you</StatusChip>
              ) : (
                <StatusChip tone="success">all clear</StatusChip>
              )
            }
            className={TILE_IN_BOARD}
            figure={figureProps('tiles.decisions-waiting', pendingCount, null, 'none', 'count')}
            label="Decisions waiting"
            value={String(pendingCount)}
          />
        </div>

        {/* A quiet day and a first read still queueing are exactly when a reader most needs to
         *  know WHEN this was taken. A figure without its date cannot be checked, and a row
         *  composed before a deploy is indistinguishable from a current one without this line. */}
        {accountRead.data ? (
          <AccountReadFreshness
            className="border-border/60 border-t px-4 py-2"
            error={requestRead.error instanceof Error ? requestRead.error.message : null}
            onRequest={() => requestRead.mutate()}
            readyAt={accountRead.data.ready_at}
            refresh={accountRead.data.refresh}
            requesting={requestRead.isPending}
            utcDay={accountRead.data.utc_day}
          />
        ) : null}
      </section>

      {/* What else today's read found, ranked — or, on a quiet day, only the operator's
       *  footnotes: what was assumed and which checks could not ask. Never a headline. */}
      {shown ? (
        <AccountRead
          assumptions={shown.assumptions ?? []}
          candidates={[...shown.candidates, ...shown.guards]}
          currency={shown.currency ?? currency ?? null}
          dailySpend={shown.scale_per_day ?? dailyTotal}
          objective={dominantObjective(portfolios)}
          onOpenPortfolio={onSelectPortfolio}
          onSetState={(detector, state) => approvals.setInsight.mutate({ detector, state })}
          // The read's own narrative, not a constant. The envelope has carried it all along
          // while the screen printed the fallback line under a header crediting Jaina.
          sentence={shown.narrative || null}
          source={shown.model === 'deterministic' ? 'fallback' : 'brief'}
          starved={shown.starved}
        />
      ) : null}
      {/* A control that silently does nothing is worse than one that is absent. Until the
       *  approval RPCs are applied to a database, this write fails — say so where the
       *  person tapped, rather than leaving the card looking like it accepted the change. */}
      {approvals.setInsight.isError ? (
        <p className="text-2xs text-destructive" data-testid="approval-error">
          {approvals.setInsight.error instanceof Error
            ? approvals.setInsight.error.message
            : 'Could not change this insight.'}
        </p>
      ) : null}

      <OptimizerPanel
        meta={
          <span className="text-3xs text-muted-foreground">
            {stream.hasData
              ? `last ${STREAM_DAYS} days · click an objective to filter`
              : 'from enrolled ad sets'}
          </span>
        }
        title="Spend by objective"
      >
        <SpendByObjectiveStream
          currency={currency}
          days={STREAM_DAYS}
          filter={objectiveFilter}
          onFilter={setObjectiveFilter}
          portfolios={portfolios}
          rows={spendQuery.data}
          stream={stream}
        />
      </OptimizerPanel>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Portfolios
            {objectiveFilter ? (
              <span className="ml-2 normal-case tracking-normal">
                · {humanize(objectiveFilter)} only
              </span>
            ) : null}
          </p>
          <div className="flex items-center gap-1.5">
            <ToggleGroup
              aria-label="Sort portfolios by"
              onValueChange={(value) => {
                if (value) setSortKey(value as SortKey);
              }}
              size="sm"
              type="single"
              value={sortKey}
              variant="outline"
            >
              <ToggleGroupItem className="h-7 px-2 text-2xs" value="name">
                Name
              </ToggleGroupItem>
              <ToggleGroupItem className="h-7 px-2 text-2xs" value="daily">
                Daily budget
              </ToggleGroupItem>
              <ToggleGroupItem className="h-7 px-2 text-2xs" value="pending">
                Pending
              </ToggleGroupItem>
            </ToggleGroup>
            <Button
              aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
              className="size-7 p-0"
              onClick={() => setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))}
              size="sm"
              type="button"
              variant="ghost"
            >
              {sortDir === 'asc' ? (
                <ArrowUpIcon aria-hidden="true" className="size-3.5" />
              ) : (
                <ArrowDownIcon aria-hidden="true" className="size-3.5" />
              )}
            </Button>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {sorted.map((portfolio) => (
            <PortfolioRowCard
              currency={currency}
              emphasis={portfolio.id === emphasised}
              key={portfolio.id}
              lead={leads.get(portfolio.id) ?? null}
              onPrefetch={onPrefetchPortfolio ? () => onPrefetchPortfolio(portfolio.id) : undefined}
              onSelect={() => onSelectPortfolio(portfolio.id)}
              portfolio={portfolio}
            />
          ))}
          {sorted.length === 0 ? (
            <p className="text-2xs text-muted-foreground">No portfolios match this objective.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
