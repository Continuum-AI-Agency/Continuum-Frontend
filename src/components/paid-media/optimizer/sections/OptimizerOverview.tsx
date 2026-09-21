'use client';

// Overview — the optimizer's front page. A health strip of four numbers anyone can read
// (what the book spends per day, what it actually spent yesterday against that, how much of
// it runs itself, what is waiting on a decision), the spend-by-objective stream with the
// live split beside it, and the portfolio cards. The legend filters the cards, so "show me
// the lead portfolios" is one click.

import type { OptimizationObjective, PortfolioListItem } from '@continuum/contracts';
import { applyApprovals, OptimizationObjectiveSchema } from '@continuum/contracts';
import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { lastFullDay, spendStream } from '../charts/chartData';
import { SpendByObjectiveStream } from '../charts/SpendByObjectiveStream';
import { KpiTile } from '../components/KpiTile';
import { StatusChip, type StatusTone } from '../components/StatusChip';
import { formatCurrency, humanize } from '../format';
import { pendingWorkCount } from '../reportModel';
import {
  useAccountApprovals,
  useInsightApprovalMutations,
  useOptimizerAccountRead,
  useOptimizerSpendByObjective,
} from '../useOptimizerData';
import { AccountLeadCard } from './account/AccountLeadCard';
import { AccountRead } from './account/AccountRead';
import { FamilyCeilings } from './account/FamilyCeilings';
import { OptimizerPanel } from './OptimizerPanel';
import { PortfolioRowCard } from './PortfolioRowCard';

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

/** Whether the read has anything at all to put on screen. */
function hasSomethingToSay(read: {
  candidates: unknown[];
  guards: unknown[];
  starved: unknown[];
  assumptions?: string[];
  deck?: { total: number } | null;
}): boolean {
  return (
    read.candidates.length > 0 ||
    read.guards.length > 0 ||
    read.starved.length > 0 ||
    (read.assumptions?.length ?? 0) > 0 ||
    (read.deck?.total ?? 0) > 0
  );
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
): { pct: number; tone: StatusTone; label: string } | null {
  if (spent == null || plan <= 0) return null;
  const ratio = spent / plan;
  const pct = Math.round(ratio * 100);
  if (ratio > 1.1) return { pct, tone: 'warning', label: `${pct}% of plan · over` };
  if (ratio < 0.9) return { pct, tone: 'info', label: `${pct}% of plan · under` };
  return { pct, tone: 'success', label: `${pct}% of plan` };
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

  const dailyTotal = portfolios.reduce((sum, portfolio) => sum + (portfolio.daily_total ?? 0), 0);
  const autopilot = portfolios.filter((portfolio) => portfolio.apply_mode === 'autopilot');
  const paused = autopilot.filter((portfolio) => portfolio.autopilot_paused).length;
  const stream = useMemo(
    () =>
      spendStream(spendQuery.data, STREAM_DAYS, lastFullDay(new Date().toISOString().slice(0, 10))),
    [spendQuery.data],
  );
  const spentSpark = stream.points.map((point) => point.total);
  const vsPlan = spendVsPlan(stream.latest?.total ?? null, dailyTotal);

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

  return (
    <div className="space-y-3">
      {/* The lead card answers the question the screen is opened with — what is the ONE thing
       *  worth attention across this account, and can it be believed. The ranked strip below
       *  answers "what else", which is a different question and never led the screen well. */}
      {shown && hasSomethingToSay(shown) ? (
        <AccountLeadCard
          candidates={[...shown.candidates, ...shown.guards]}
          currency={shown.currency ?? currency ?? null}
          dailySpend={shown.scale_per_day ?? dailyTotal}
          deck={shown.deck ?? null}
          objective={dominantObjective(portfolios)}
          onOpenPortfolio={onSelectPortfolio}
          source={shown.model === 'deterministic' ? 'fallback' : 'brief'}
          starved={shown.starved}
        />
      ) : null}
      {/* A read with nothing to act on still has things to say: what it assumed, how much of
       *  the catalogue applies, and which checks could not run. Gating on candidates alone
       *  meant the component's "Nothing to move today" branch could never appear on screen —
       *  the quiet day rendered as a blank where a sentence belonged. */}
      {shown && hasSomethingToSay(shown) ? (
        <AccountRead
          assumptions={shown.assumptions ?? []}
          candidates={[...shown.candidates, ...shown.guards]}
          currency={shown.currency ?? currency ?? null}
          dailySpend={shown.scale_per_day ?? dailyTotal}
          deck={shown.deck ?? null}
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
      {/* The other half of the approval: the card is where someone decides to trust a
       *  recommendation, this is where that decision gets a boundary. Without it the
       *  per-insight switch is capped by a ceiling nobody can reach. */}
      {shown && approvalMaps.data ? (
        <FamilyCeilings
          current={approvalMaps.data.families}
          defaults={shown.ceiling_defaults}
          error={
            approvals.setFamily.error instanceof Error ? approvals.setFamily.error.message : null
          }
          onSetFamily={(family, state) => approvals.setFamily.mutate({ family, state })}
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">
          {portfolios.length} {portfolios.length === 1 ? 'portfolio' : 'portfolios'} ·{' '}
          {portfolios.reduce((sum, portfolio) => sum + portfolio.adset_count, 0)} ad sets under
          management
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

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiTile
          label="Daily budget"
          spark={spentSpark}
          sub={`planned across ${portfolios.length} ${portfolios.length === 1 ? 'portfolio' : 'portfolios'}`}
          value={formatCurrency(dailyTotal, currency)}
        />
        <KpiTile
          chip={
            vsPlan ? (
              <StatusChip
                hint="The last full day of spend across every enrolled ad set, against the sum of the daily budgets."
                tone={vsPlan.tone}
              >
                {vsPlan.label}
              </StatusChip>
            ) : (
              <StatusChip tone="muted">no spend history yet</StatusChip>
            )
          }
          label="Spent yesterday"
          sub={stream.latest ? `last full day · ${STREAM_DAYS}-day trend` : undefined}
          value={stream.latest ? formatCurrency(stream.latest.total, currency) : '—'}
        />
        <KpiTile
          chip={
            paused > 0 ? (
              <StatusChip tone="warning">{paused} stopped</StatusChip>
            ) : autopilot.length > 0 ? (
              <StatusChip tone="success">applying within guardrails</StatusChip>
            ) : (
              <StatusChip tone="muted">you approve every move</StatusChip>
            )
          }
          label="On autopilot"
          sub={`of ${portfolios.length} ${portfolios.length === 1 ? 'portfolio' : 'portfolios'}`}
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
          label="Decisions waiting"
          value={String(pendingCount)}
        />
      </div>

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
              key={portfolio.id}
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
