'use client';

// Per-ad-set reallocation flow — which ad sets gained budget and which lost it in
// the latest cycle, as a sortable InsightDataTable. Each row keeps the diverging
// bar (gain right/green, loss left/red) INSIDE its change cell, so the visual
// language survives the move to a real data table. HELD items (freezeReason) are
// excluded — their budget was left unchanged on purpose, so they are not "flow".
// The gain/loss pair uses the shared semantic tokens (--success / --destructive)
// so light/dark theming stays automatic — no hardcoded emerald/rose.
//
// When an objective (and, ideally, its account snapshots) are threaded in, the
// table also carries the KPI-adaptive cost/results columns; without them those
// read "—" honestly rather than inventing a number.

import type { AdSetSnapshot, CycleItemRow, OptimizationObjective } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { intFmt } from '@/components/charts/chart-formatters';
import {
  type InsightColumn,
  InsightDataTable,
} from '@/components/dashboard/datatable/InsightDataTable';
import { cn } from '@/lib/utils';
import { formatCpa, formatCurrency } from '../format';
import { flowToRow, nameColumn, type OptimizerAdsetRow } from '../kpiColumns';
import { ChartEmpty } from './ChartStates';
import { splitReallocation } from './chartData';
import { pct } from './chartScale';

const DASH = '—';

type ReallocationFlowProps = {
  items: CycleItemRow[];
  currency?: string | null;
  // Human ad-set names keyed by adset_id (from the enrolled roster). When a row's
  // id is present the row reads its name instead of the raw Meta id.
  nameById?: Map<string, string>;
  // Optional: unlocks the KPI-adaptive cost/results columns.
  objective?: OptimizationObjective | string | null;
  snapshotById?: Map<string, AdSetSnapshot>;
  /** How the portfolio decides its total. Lets the card explain a non-zero net instead of
   *  leaving the reader to guess whether a shrinking total is intended. */
  budgetSource?: string | null;
};

export function ReallocationFlow({
  items,
  currency,
  nameById,
  objective,
  snapshotById,
  budgetSource,
}: ReallocationFlowProps) {
  const { gaining, losing, maxAbs, totalMoved, totalFreed, net, movedCount } =
    splitReallocation(items);
  const movedIds = new Set([...gaining, ...losing].map((row) => row.adsetId));

  if (movedCount === 0) {
    return <ChartEmpty message="No budget moved this cycle — allocations held steady." />;
  }

  const metric = objective ? getOptimizationMetricDefinition(objective) : null;
  const rows = items
    .filter((item) => movedIds.has(item.adset_id))
    .map((item) =>
      flowToRow(item, {
        metric,
        nameById,
        snapshot: snapshotById?.get(item.adset_id) ?? null,
      }),
    );

  const columns: InsightColumn<OptimizerAdsetRow>[] = [
    nameColumn(),
    {
      id: 'change',
      header: 'Change',
      align: 'right',
      sortValue: (row) => row.changeAbs ?? 0,
      cell: (row) => <ChangeCell currency={currency} maxAbs={maxAbs} row={row} />,
    },
  ];

  if (metric) {
    columns.push(
      {
        id: 'cost',
        header: metric.costLabel,
        align: 'right',
        sortValue: (row) => row.cost ?? -1,
        cell: (row) => (row.cost != null ? formatCpa(row.cost, currency) : DASH),
      },
      {
        id: 'results',
        header: metric.resultLabel,
        align: 'right',
        sortValue: (row) => row.results ?? -1,
        cell: (row) => (row.results != null ? intFmt(row.results) : DASH),
      },
    );
  }

  return (
    <div className="space-y-2">
      {/* Gainers, losers and the NET, not just the gainers. A cycle that took $746 out and
          put $75 back used to read as "$75 moved", which is how a budget cut passed for a
          reallocation. A non-zero net on a budget-neutral portfolio is the signal. */}
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground tabular-nums">
          <span className="text-success">+{formatCurrency(totalMoved, currency)}</span> to{' '}
          {gaining.length} ·{' '}
          <span className="text-destructive">−{formatCurrency(totalFreed, currency)}</span> from{' '}
          {losing.length} · net{' '}
          <span
            className={cn(
              Math.abs(net) < 1
                ? 'text-muted-foreground'
                : net > 0
                  ? 'text-success'
                  : 'text-destructive',
            )}
          >
            {net >= 0 ? '+' : '−'}
            {formatCurrency(Math.abs(net), currency)}
          </span>{' '}
          across {movedCount} {movedCount === 1 ? 'ad set' : 'ad sets'}
        </p>
        {budgetSource === 'observed' && Math.abs(net) >= 1 ? (
          <p className="text-2xs text-warning">
            This portfolio reallocates within current spend, so the net should be about zero. A gap
            this size usually means ad-set budgets changed in Meta since the last cycle.
          </p>
        ) : null}
        {budgetSource === 'fixed' && net <= -1 ? (
          <p className="text-2xs text-muted-foreground">
            Total spend is coming down because this portfolio targets a fixed daily budget. Switch
            it to &ldquo;Match current spend&rdquo; in Manage to reallocate instead.
          </p>
        ) : null}
      </div>
      <InsightDataTable
        columns={columns}
        defaultSort={{ columnId: 'change', direction: 'desc' }}
        getRowId={(row) => row.adsetId}
        rows={rows}
      />
    </div>
  );
}

function ChangeCell({
  row,
  maxAbs,
  currency,
}: {
  row: OptimizerAdsetRow;
  maxAbs: number;
  currency?: string | null;
}) {
  const change = row.changeAbs ?? 0;
  const positive = change > 0;
  const width = Math.max(4, pct(Math.abs(change), maxAbs));
  const pctLabel =
    row.changePct != null
      ? ` (${positive ? '+' : '−'}${Math.round(Math.abs(row.changePct) * 100)}%)`
      : '';

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="hidden h-2 w-16 overflow-hidden rounded-full bg-muted/40 sm:block">
        <span
          className={cn('block h-full rounded-full', positive ? 'bg-success' : 'bg-destructive')}
          style={{ width: `${width}%`, marginLeft: positive ? 'auto' : 0 }}
        />
      </span>
      <span
        className={cn(
          'shrink-0 font-medium tabular-nums',
          positive ? 'text-success' : 'text-destructive',
        )}
      >
        {positive ? '+' : '−'}
        {formatCurrency(Math.abs(change), currency)}
        <span className="text-2xs text-muted-foreground">{pctLabel}</span>
      </span>
    </div>
  );
}
