'use client';

// Spend by objective over the last two weeks as a stacked stream, with a live legend of
// the latest day's split beside it. The stream says how the money has been moving between
// objectives; the legend says how it is split right now, and doubles as a filter for the
// portfolio list. The chart kit does not stack areas, so each objective is drawn as its
// running sum, largest at the back — the same picture, no new chart primitive.
//
// With no history yet (portfolios created today), the legend falls back to the plan: the
// daily budgets grouped by objective, labelled as such.

import type { PortfolioListItem } from '@continuum/contracts';
import { Area, AreaChart } from '@/components/charts/area-chart';
import { ChartTooltip } from '@/components/charts/tooltip';
import { cn } from '@/lib/utils';
import { formatCurrency, humanize } from '../format';
import { budgetByObjective, type SpendByObjectiveInput, spendStream } from './chartData';
import { objectiveColor } from './vizTokens';

const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

type SpendByObjectiveStreamProps = {
  rows: SpendByObjectiveInput[];
  portfolios: PortfolioListItem[];
  currency?: string | null;
  days?: number;
  /** ISO date; defaults to today (UTC). Injectable for tests. */
  today?: string;
  /** The objective the list is filtered to; clicking a legend row toggles it. */
  filter?: string | null;
  onFilter?: (objective: string | null) => void;
  className?: string;
};

type LegendRow = { objective: string; value: number; pct: number };

function legendRows(byObjective: Record<string, number>): LegendRow[] {
  const total = Object.values(byObjective).reduce((sum, value) => sum + value, 0);
  return Object.entries(byObjective)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([objective, value]) => ({ objective, value, pct: total > 0 ? value / total : 0 }));
}

export function SpendByObjectiveStream({
  rows,
  portfolios,
  currency,
  days = 14,
  today = new Date().toISOString().slice(0, 10),
  filter,
  onFilter,
  className,
}: SpendByObjectiveStreamProps) {
  const stream = spendStream(rows, days, today);
  const planSplit = Object.fromEntries(
    budgetByObjective(portfolios).map((slice) => [slice.name, slice.daily]),
  );
  // Plan slices are humanized names; the stream keys are raw objectives. Keep each legend
  // keyed the way its source is, and humanize only at render.
  const legend = stream.latest
    ? legendRows(stream.latest.byObjective).map((row) => ({
        ...row,
        label: humanize(row.objective),
      }))
    : legendRows(planSplit).map((row) => ({ ...row, label: row.objective }));
  const legendTitle = stream.latest
    ? `Spent ${DATE_FMT.format(new Date(`${stream.latest.date}T00:00:00Z`))}`
    : 'Planned per day';

  const chartData = stream.points.map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`),
    ...Object.fromEntries(
      stream.objectives.map((objective, i) => [`s${i}`, point.stacked[objective] ?? 0]),
    ),
    ...Object.fromEntries(
      stream.objectives.map((objective, i) => [`v${i}`, point.byObjective[objective] ?? 0]),
    ),
  }));
  // Largest running sum at the back: the last objective in order has the full stack.
  const layers = stream.objectives.map((objective, i) => ({ objective, i })).reverse();

  return (
    <div className={cn('grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]', className)}>
      <div className="min-w-0">
        {stream.hasData ? (
          <AreaChart
            aspectRatio="3 / 1"
            data={chartData}
            margin={{ top: 8, right: 6, bottom: 8, left: 6 }}
            xDataKey="date"
          >
            {layers.map(({ objective, i }) => (
              <Area
                dataKey={`s${i}`}
                fill={objectiveColor(objective)}
                fillOpacity={0.35}
                key={objective}
                showHighlight={false}
                stroke={objectiveColor(objective)}
                strokeWidth={1.5}
              />
            ))}
            <ChartTooltip
              rows={(point) =>
                stream.objectives.map((objective, i) => ({
                  color: objectiveColor(objective),
                  label: humanize(objective),
                  value: formatCurrency(Number(point[`v${i}`] ?? 0), currency),
                }))
              }
            />
          </AreaChart>
        ) : (
          <div className="flex h-full min-h-28 items-center rounded-md border border-border/60 border-dashed bg-muted/10 px-3 py-2 text-2xs text-muted-foreground">
            The spend stream draws after the first scored cycle. Until then the split beside it is
            the plan: each portfolio&rsquo;s daily budget by objective.
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-1.5">
        <p className="text-3xs text-muted-foreground uppercase tracking-wide">{legendTitle}</p>
        {legend.length === 0 ? (
          <p className="text-2xs text-muted-foreground">No budget yet.</p>
        ) : (
          <ul className="space-y-1">
            {legend.map((row) => {
              const active = filter != null && filter === row.objective;
              const dimmed = filter != null && !active;
              return (
                <li key={row.objective}>
                  <button
                    aria-pressed={active}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted/40',
                      active && 'bg-accent/40',
                      dimmed && 'opacity-60',
                    )}
                    disabled={!onFilter}
                    onClick={() => onFilter?.(active ? null : row.objective)}
                    type="button"
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{ background: objectiveColor(row.objective) }}
                    />
                    <span className="min-w-0 flex-1 truncate">{row.label}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {Math.round(row.pct * 100)}%
                    </span>
                    <span className="w-16 shrink-0 text-right font-medium tabular-nums">
                      {formatCurrency(row.value, currency)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {onFilter && filter ? (
          <button
            className="text-2xs text-primary hover:underline"
            onClick={() => onFilter(null)}
            type="button"
          >
            Show all portfolios
          </button>
        ) : null}
      </div>
    </div>
  );
}
