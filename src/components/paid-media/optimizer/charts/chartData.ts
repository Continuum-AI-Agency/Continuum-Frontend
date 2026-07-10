// Pure data transforms behind the optimizer charts. Extracted from the chart
// components so they can be unit-benched against real-shaped data without a DOM.
// CPA is always derived the engine way (spend / conversions) so the numbers match
// what the agents/MCP report.

import type { CpaSeriesPoint, CycleItemRow, PortfolioListItem } from '@continuum/contracts';

import { deriveEfficiency, humanize } from '../format';

export type CpaTrendPoint = { date: Date; cpa: number };

/** CpaSeriesPoint[] → chronological {date, cpa} points on the 7-day window,
 *  dropping cycles with no conversions (CPA undefined). */
export function buildCpaTrendPoints(
  series: CpaSeriesPoint[],
  denominatorMultiplier = 1,
): CpaTrendPoint[] {
  return series
    .map((point) => ({
      ts: point.cycle_ts,
      cpa: deriveEfficiency(point.spend_d7, point.conv_d7, denominatorMultiplier),
    }))
    .filter((point): point is { ts: string; cpa: number } => point.cpa != null)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    .map((point) => ({ date: new Date(point.ts), cpa: Math.round(point.cpa) }));
}

/** Latest CPA + period delta % (negative = improving, lower CPA is better). */
export function cpaTrendSummary(
  points: CpaTrendPoint[],
): { last: number; deltaPct: number } | null {
  if (points.length < 2) return null;
  const first = points[0].cpa;
  const last = points[points.length - 1].cpa;
  const deltaPct = first > 0 ? Math.round(((last - first) / first) * 100) : 0;
  return { last, deltaPct };
}

export type FlowRow = {
  adsetId: string;
  change: number;
  // The current→proposed pair (+ signed %) so the reallocation reads as a concrete
  // budget move, not just a delta bar. In recommend mode these are proposals; in
  // autopilot they are what was applied.
  current: number;
  proposed: number;
  changePct: number | null;
};
export type Reallocation = {
  gaining: FlowRow[];
  losing: FlowRow[];
  maxAbs: number;
  totalMoved: number;
};

/** Split cycle items into budget gainers/losers. HELD items (freezeReason) are
 *  excluded — their budget was left unchanged on purpose, so they are not flow. */
export function splitReallocation(items: CycleItemRow[]): Reallocation {
  const moved: FlowRow[] = items
    .filter((item) => !item.diagnostics?.freezeReason)
    .map((item) => ({
      adsetId: item.adset_id,
      change: item.change_abs ?? 0,
      current: item.current_budget ?? 0,
      proposed: item.final_budget ?? 0,
      changePct: item.change_pct ?? null,
    }))
    .filter((row) => Math.abs(row.change) >= 1);

  const gaining = moved.filter((row) => row.change > 0).sort((a, b) => b.change - a.change);
  const losing = moved.filter((row) => row.change < 0).sort((a, b) => a.change - b.change);
  const maxAbs = Math.max(...moved.map((row) => Math.abs(row.change)), 1);
  const totalMoved = gaining.reduce((sum, row) => sum + row.change, 0);
  return { gaining, losing, maxAbs, totalMoved };
}

export type ObjectiveBudget = { name: string; daily: number };

/** Group daily budget by objective — a pure sum of the authoritative
 *  optimizer_list_portfolios fields (same source as the Daily budget KPI). */
export function budgetByObjective(portfolios: PortfolioListItem[]): ObjectiveBudget[] {
  const totals = new Map<string, number>();
  for (const portfolio of portfolios) {
    totals.set(
      portfolio.objective,
      (totals.get(portfolio.objective) ?? 0) + (portfolio.daily_total ?? 0),
    );
  }
  return [...totals.entries()]
    .map(([objective, daily]) => ({ name: humanize(objective), daily: Math.round(daily) }))
    .sort((a, b) => b.daily - a.daily);
}
