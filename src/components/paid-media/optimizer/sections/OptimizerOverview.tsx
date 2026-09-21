'use client';

// Overview — the optimizer's front page. A health strip of four numbers anyone can read
// (what the book spends per day, what it actually spent yesterday against that, how much of
// it runs itself, what is waiting on a decision), the spend-by-objective stream with the
// live split beside it, and the portfolio cards. The legend filters the cards, so "show me
// the lead portfolios" is one click.

import type { PortfolioListItem } from '@continuum/contracts';
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
  useInsightApprovalMutations,
  useOptimizerAccountRead,
  useOptimizerSpendByObjective,
} from '../useOptimizerData';
import { AccountRead } from './account/AccountRead';
import { OptimizerPanel } from './OptimizerPanel';
import { PortfolioRowCard } from './PortfolioRowCard';

type SortKey = 'name' | 'daily' | 'pending';
type SortDir = 'asc' | 'desc';

const STREAM_DAYS = 14;

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

  return (
    <div className="space-y-3">
      {read && (read.candidates.length > 0 || read.guards.length > 0) ? (
        <AccountRead
          candidates={[...read.candidates, ...read.guards]}
          currency={read.currency ?? currency ?? null}
          dailySpend={read.scale_per_day ?? dailyTotal}
          onOpenPortfolio={onSelectPortfolio}
          onSetState={(detector, state) => approvals.setInsight.mutate({ detector, state })}
          deck={read.deck ?? null}
          source={read.model === 'deterministic' ? 'fallback' : 'brief'}
          starved={read.starved as never}
        />
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
