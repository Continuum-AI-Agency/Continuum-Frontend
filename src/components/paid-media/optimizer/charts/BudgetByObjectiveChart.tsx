'use client';

// Daily budget grouped by objective as a BKLit bar chart. This is a pure sum of
// the authoritative optimizer_list_portfolios fields (objective + daily_total) —
// the same source as the "Daily budget" KPI — so it can never drift from what the
// agents/MCP report. The legend carries exact currency amounts; the bars carry
// the relative mix.

import type { PortfolioListItem } from '@continuum/contracts';

import { Bar } from '@/components/charts/bar';
import { BarChart } from '@/components/charts/bar-chart';
import { BarYAxis } from '@/components/charts/bar-y-axis';
import { formatCurrency } from '../format';
import { ChartEmpty } from './ChartStates';
import { budgetByObjective } from './chartData';

type BudgetByObjectiveChartProps = {
  portfolios: PortfolioListItem[];
  currency?: string | null;
};

export function BudgetByObjectiveChart({ portfolios, currency }: BudgetByObjectiveChartProps) {
  const data = budgetByObjective(portfolios);

  if (data.length === 0) {
    return <ChartEmpty message="Budget mix appears once portfolios carry a daily budget." />;
  }

  return (
    <div className="space-y-2">
      <BarChart
        data={data}
        xDataKey="name"
        orientation="horizontal"
        aspectRatio="5 / 2"
        margin={{ top: 8, right: 16, bottom: 8, left: 96 }}
      >
        <Bar dataKey="daily" />
        <BarYAxis />
      </BarChart>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {data.map((row) => (
          <li key={row.name} className="tabular-nums">
            {row.name} · {formatCurrency(row.daily, currency)}/d
          </li>
        ))}
      </ul>
    </div>
  );
}
