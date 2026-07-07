'use client';

// Overview sub-view — top-level KPIs (portfolios / daily budget / pending
// actions) and a "portfolios at a glance" list. Mirrors the Overview tab of the
// reference-ui-preview spec.

import type { PortfolioListItem } from '@continuum/contracts';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BudgetByObjectiveChart } from '../charts/BudgetByObjectiveChart';
import { formatCurrency } from '../format';
import { PortfolioRowCard } from './PortfolioRowCard';

type OptimizerOverviewProps = {
  portfolios: PortfolioListItem[];
  pendingCount: number;
  currency?: string | null;
  onOpenActions: () => void;
  onSelectPortfolio: (portfolioId: string) => void;
};

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="gap-0 rounded-xl bg-muted/30 py-0 shadow-none">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

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
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Portfolios"
          value={String(portfolios.length)}
          sub={`${adsetTotal} ad sets`}
        />
        <KpiCard label="Daily budget" value={formatCurrency(dailyTotal, currency)} sub="total" />
        <button
          type="button"
          onClick={onOpenActions}
          className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
        >
          <KpiCard label="Pending actions" value={String(pendingCount)} sub="awaiting approval" />
        </button>
      </div>

      {portfolios.length > 0 ? (
        <Card className="gap-0 rounded-xl py-0 shadow-none">
          <CardHeader className="border-b border-border/70 p-4">
            <CardTitle className="text-sm">Budget by objective</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <BudgetByObjectiveChart portfolios={portfolios} currency={currency} />
          </CardContent>
        </Card>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight">Portfolios at a glance</h3>
          {pendingCount > 0 ? (
            <Badge variant="secondary" className="text-[11px]">
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
      </div>
    </div>
  );
}
