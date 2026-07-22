'use client';

// Daily budget mix as a BKLit bar chart. The dimension is chosen upstream by
// budgetMix(): split by objective when 2+ objectives carry budget, else fall
// back to a per-portfolio breakdown so a single-objective book still reads as
// its constituent portfolios. Values are a pure sum of the authoritative
// optimizer_list_portfolios fields (same source as the Daily budget KPI), so
// they can never drift from what the agents/MCP report. The chart degrades
// gracefully: nothing funded → empty state; a lone funded slice → a one-line
// summary instead of a single meaningless full-width bar.

import { Bar } from '@/components/charts/bar';
import { BarChart } from '@/components/charts/bar-chart';
import { BarYAxis } from '@/components/charts/bar-y-axis';
import { formatCurrency } from '../format';
import { ChartEmpty } from './ChartStates';
import type { BudgetMix } from './chartData';

type BudgetMixChartProps = {
  mix: BudgetMix;
  currency?: string | null;
};

export function BudgetMixChart({ mix, currency }: BudgetMixChartProps) {
  const { slices } = mix;

  if (slices.length === 0) {
    return <ChartEmpty message="Budget mix appears once portfolios carry a daily budget." />;
  }

  // A single funded slice would render as one full-width bar that just restates
  // the Daily budget KPI — name it in a line of text instead.
  if (slices.length === 1) {
    const only = slices[0];
    return (
      <p className="px-1 text-xs text-muted-foreground">
        All budget on <span className="font-medium text-foreground">{only.name}</span> ·{' '}
        <span className="tabular-nums">{formatCurrency(only.daily, currency)}/d</span>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <BarChart
        data={slices}
        xDataKey="name"
        orientation="horizontal"
        aspectRatio="5 / 2"
        margin={{ top: 8, right: 16, bottom: 8, left: 96 }}
      >
        <Bar dataKey="daily" />
        <BarYAxis />
      </BarChart>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {slices.map((slice) => (
          <li key={slice.name} className="tabular-nums">
            {slice.name} · {formatCurrency(slice.daily, currency)}/d
          </li>
        ))}
      </ul>
    </div>
  );
}
