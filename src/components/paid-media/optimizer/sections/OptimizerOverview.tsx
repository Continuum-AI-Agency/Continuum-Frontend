'use client';

// Overview sub-view — headline KPIs as a quiet MetricStrip (the calm-dense
// styleguide replacement for a stat-card grid) and a "portfolios at a glance"
// list. The budget mix rides the shared OptimizerPanel.

import type { PortfolioListItem } from '@continuum/contracts';
import { ArrowRightIcon } from 'lucide-react';

import { MetricStrip } from '@/components/shared/MetricStrip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BudgetByObjectiveChart } from '../charts/BudgetByObjectiveChart';
import { formatCurrency } from '../format';
import { OptimizerPanel } from './OptimizerPanel';
import { PortfolioRowCard } from './PortfolioRowCard';

type OptimizerOverviewProps = {
  portfolios: PortfolioListItem[];
  pendingCount: number;
  currency?: string | null;
  onOpenActions: () => void;
  onSelectPortfolio: (portfolioId: string) => void;
};

export function OptimizerOverview({
  portfolios,
  pendingCount,
  currency,
  onOpenActions,
  onSelectPortfolio,
}: OptimizerOverviewProps) {
  const adsetTotal = portfolios.reduce((sum, portfolio) => sum + portfolio.adset_count, 0);
  const dailyTotal = portfolios.reduce((sum, portfolio) => sum + (portfolio.daily_total ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MetricStrip
          items={[
            { label: 'Portfolios', value: String(portfolios.length) },
            { label: 'Ad sets', value: String(adsetTotal) },
            { label: 'Daily budget', value: formatCurrency(dailyTotal, currency) },
            { label: 'Pending', value: String(pendingCount) },
          ]}
        />
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
      </div>

      <OptimizerPanel title="Budget by objective">
        <BudgetByObjectiveChart portfolios={portfolios} currency={currency} />
      </OptimizerPanel>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Portfolios at a glance
          </p>
          {pendingCount > 0 ? (
            <Badge variant="secondary" className="text-3xs">
              {pendingCount} pending
            </Badge>
          ) : null}
        </div>
        <div className="space-y-2">
          {portfolios.map((portfolio) => (
            <PortfolioRowCard
              key={portfolio.id}
              portfolio={portfolio}
              currency={currency}
              onSelect={() => onSelectPortfolio(portfolio.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
