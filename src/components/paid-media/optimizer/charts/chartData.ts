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
  /** Sum of the increases. Named "moved" because that is the money changing hands. */
  totalMoved: number;
  /** Sum of the decreases, as a POSITIVE number. */
  totalFreed: number;
  /** totalMoved - totalFreed. On a budget-neutral (observed) portfolio this is ~0; a large
   *  negative net means the cycle is CUTTING total spend, not reallocating it. That
   *  distinction was invisible when only the gainers were totalled — a cycle that took $746
   *  out and put $75 back read as "$75 moved". */
  net: number;
  /** How many ad sets changed at all. ONE definition, so the card and the Apply gate can
   *  never disagree about what "moved" means. */
  movedCount: number;
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
  const totalFreed = losing.reduce((sum, row) => sum - row.change, 0);
  return {
    gaining,
    losing,
    maxAbs,
    totalMoved,
    totalFreed,
    net: totalMoved - totalFreed,
    movedCount: moved.length,
  };
}

// ── Who funded whom ──────────────────────────────────────────────────────────
// The solver is conservation-based: one cycle emits a COMPLETE allocation vector
// where the raises are already paid for by the cuts. Nothing pairwise is stored,
// because the offsetting is n-way and implicit in the vector — which is exactly
// why the queue read as N unrelated recommendations.
//
// This reconstructs the coupling the only way a conserved pool supports: each
// donor's cut is split across recipients in proportion to their gains. Exact when
// one ad set funds one other; proportional otherwise.

export type BudgetTransfer = { fromAdsetId: string; toAdsetId: string; amount: number };

export type TransferAttribution = {
  transfers: BudgetTransfer[];
  /** Cutting ad sets, deepest cut first. */
  donors: FlowRow[];
  /** Gaining ad sets, largest raise first. */
  recipients: FlowRow[];
  /** Dollars actually changing hands — min(raised, cut). */
  moved: number;
  /** raised − cut. ~0 on a conserved run; positive means the pool grew. */
  net: number;
};

export function attributeTransfers(items: CycleItemRow[]): TransferAttribution {
  const { gaining, losing, totalMoved, totalFreed, net } = splitReallocation(items);
  // Only the MATCHED amount is attributed. A 'scale' cycle that grows the pool must never
  // show a donor giving away more than it cut — the shortfall belongs in `net`, visible,
  // not smeared across the links.
  const moved = Math.min(totalMoved, totalFreed);
  if (moved <= 0 || gaining.length === 0 || losing.length === 0) {
    return { transfers: [], donors: losing, recipients: gaining, moved: 0, net };
  }

  // ponytail: full donors × recipients. A portfolio is ~20 ad sets, so ≤100 links; cap to
  // the top-3 donors per recipient if one ever exceeds ~50.
  const transfers = losing.flatMap((donor) =>
    gaining.map((recipient) => ({
      fromAdsetId: donor.adsetId,
      toAdsetId: recipient.adsetId,
      amount: moved * (-donor.change / totalFreed) * (recipient.change / totalMoved),
    })),
  );

  return { transfers, donors: losing, recipients: gaining, moved, net };
}

export type BudgetSlice = { name: string; daily: number };
// Retained alias — the objective breakdown is one of the two mix dimensions.
export type ObjectiveBudget = BudgetSlice;

/** Group daily budget by objective — a pure sum of the authoritative
 *  optimizer_list_portfolios fields (same source as the Daily budget KPI). */
export function budgetByObjective(portfolios: PortfolioListItem[]): BudgetSlice[] {
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

/** Group daily budget by portfolio name — the graceful fallback when every
 *  portfolio shares one objective, so the mix panel is never a single giant bar
 *  that merely restates the Daily budget KPI. Only funded portfolios appear;
 *  descending. */
export function budgetByPortfolio(portfolios: PortfolioListItem[]): BudgetSlice[] {
  return portfolios
    .filter((portfolio) => (portfolio.daily_total ?? 0) > 0)
    .map((portfolio) => ({ name: portfolio.name, daily: Math.round(portfolio.daily_total ?? 0) }))
    .sort((a, b) => b.daily - a.daily);
}

export type BudgetMix = { dimension: 'objective' | 'portfolio'; slices: BudgetSlice[] };

/** Choose the mix dimension: split by objective only when 2+ objectives carry
 *  budget (a genuine mix), otherwise fall back to a per-portfolio breakdown so a
 *  single-objective book reads as its constituent portfolios rather than one
 *  redundant bar. */
export function budgetMix(portfolios: PortfolioListItem[]): BudgetMix {
  const fundedObjectives = budgetByObjective(portfolios).filter((slice) => slice.daily > 0);
  if (fundedObjectives.length >= 2) {
    return { dimension: 'objective', slices: fundedObjectives };
  }
  return { dimension: 'portfolio', slices: budgetByPortfolio(portfolios) };
}
