'use client';

// Overview sub-view — headline KPIs as a quiet MetricStrip (the calm-dense
// styleguide replacement for a stat-card grid) with a primary "New portfolio"
// action, then a two-column body: the "portfolios at a glance" list is the star
// (left, ~2fr, sortable), and the budget mix rides a compact, height-constrained
// panel in the right rail. On narrow widths the grid collapses to one column, list
// first, so the clickable portfolios stay above the fold.

import type { PortfolioListItem } from '@continuum/contracts';
import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { MetricStrip } from '@/components/shared/MetricStrip';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BudgetMixChart } from '../charts/BudgetMixChart';
import { budgetMix } from '../charts/chartData';
import { formatCurrency } from '../format';
import { OptimizerPanel } from './OptimizerPanel';
import { PortfolioRowCard } from './PortfolioRowCard';

type SortKey = 'name' | 'daily' | 'pending';
type SortDir = 'asc' | 'desc';

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
    else delta = a.pending_recommendations - b.pending_recommendations;
    return delta * factor;
  });
}

type OptimizerOverviewProps = {
  portfolios: PortfolioListItem[];
  pendingCount: number;
  currency?: string | null;
  onOpenActions: () => void;
  onSelectPortfolio: (portfolioId: string) => void;
  onCreatePortfolio: () => void;
  onPrefetchPortfolio?: (portfolioId: string) => void;
};

export function OptimizerOverview({
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

  const adsetTotal = portfolios.reduce((sum, portfolio) => sum + portfolio.adset_count, 0);
  const dailyTotal = portfolios.reduce((sum, portfolio) => sum + (portfolio.daily_total ?? 0), 0);
  const autopilotCount = portfolios.filter(
    (portfolio) => portfolio.apply_mode === 'autopilot',
  ).length;

  const sorted = sortPortfolios(portfolios, sortKey, sortDir);
  const mix = budgetMix(portfolios);
  const mixTitle = mix.dimension === 'objective' ? 'Budget by objective' : 'Budget by portfolio';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MetricStrip
          items={[
            { label: 'Portfolios', value: String(portfolios.length) },
            { label: 'Ad sets', value: String(adsetTotal) },
            { label: 'Daily budget', value: formatCurrency(dailyTotal, currency) },
            { label: 'Autopilot', value: String(autopilotCount) },
            { label: 'Pending', value: String(pendingCount) },
          ]}
        />
        <div className="flex items-center gap-2">
          {pendingCount > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={onOpenActions}
            >
              Review {pendingCount} pending
              <ArrowRightIcon className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={onCreatePortfolio}
          >
            <PlusIcon className="size-3.5" aria-hidden="true" />
            New portfolio
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Portfolios at a glance
            </p>
            <div className="flex items-center gap-1.5">
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={sortKey}
                onValueChange={(value) => {
                  if (value) setSortKey(value as SortKey);
                }}
                aria-label="Sort portfolios by"
              >
                <ToggleGroupItem value="name" className="h-7 px-2 text-2xs">
                  Name
                </ToggleGroupItem>
                <ToggleGroupItem value="daily" className="h-7 px-2 text-2xs">
                  Daily budget
                </ToggleGroupItem>
                <ToggleGroupItem value="pending" className="h-7 px-2 text-2xs">
                  Pending
                </ToggleGroupItem>
              </ToggleGroup>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="size-7 p-0"
                aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
                onClick={() => setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))}
              >
                {sortDir === 'asc' ? (
                  <ArrowUpIcon className="size-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDownIcon className="size-3.5" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {sorted.map((portfolio) => (
              <PortfolioRowCard
                key={portfolio.id}
                portfolio={portfolio}
                currency={currency}
                onSelect={() => onSelectPortfolio(portfolio.id)}
                onPrefetch={
                  onPrefetchPortfolio ? () => onPrefetchPortfolio(portfolio.id) : undefined
                }
              />
            ))}
          </div>
        </section>

        <OptimizerPanel
          title={mixTitle}
          className="self-start"
          bodyClassName="max-h-72 overflow-y-auto"
        >
          <BudgetMixChart mix={mix} currency={currency} />
        </OptimizerPanel>
      </div>
    </div>
  );
}
