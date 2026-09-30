// The Overview's figures, composed from typed fields and nothing else.
//
// Performance+ redesign, stage 1b (docs/performance-plus-redesign/overview.html, proposal O1).
// The screen opens with one sentence — what the account spent over the window, what each
// result kind cost against its target, how many decisions wait — and every number in it has
// to be one a reader can check against a tile below. So the sentence and the tiles are built
// here from the SAME rows: the portfolio list (objective, target, budget, mode) and the
// optimizer's own efficiency series per portfolio (spend and results per trailing window,
// aggregated across the portfolio's ad sets at each cycle). No free text, no model prose.
//
// The window is the trailing seven days the latest cycle measured. The window before it is
// the fourteen-day figure minus the seven-day one — the same series, so "last week" cannot
// come from a different read than "this week".

import type { EfficiencySeriesPoint, PortfolioListItem } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { pendingWorkCount } from '../../reportModel';

/** How a figure sits against its target. `none` is "cannot be judged", never "fine". */
export type TileState = 'ok' | 'warn' | 'bad' | 'none';

/** The window every figure on the Overview is quoted over. */
export const WINDOW_DAYS = 7;

/** Over target by more than this reads as `bad`; over by any less reads as `warn`. */
const WARN_CEILING_PCT = 25;

/** Spend against the daily plan reads as ok inside this band, warn outside it. */
const PLAN_TOLERANCE_PCT = 10;

/** Spend per day against the plan, as a tile state. Unjudgeable without a plan. Shared by
 *  the Overview's spend tile and the portfolio hero's. */
export function spendState(perDay: number, plannedPerDay: number): TileState {
  if (plannedPerDay <= 0) return 'none';
  const pct = Math.abs(perDay / plannedPerDay - 1) * 100;
  return pct <= PLAN_TOLERANCE_PCT ? 'ok' : 'warn';
}

/** Which result the account buys, in the words the sentence uses. Keyed by the metric's
 *  KPI field so a custom conversion that behaves like a lead is still called a lead. */
const RESULT_WORDS: Record<string, { one: string; many: string }> = {
  purchases: { one: 'compra', many: 'compras' },
  appInstalls: { one: 'instalación', many: 'instalaciones' },
  signups: { one: 'registro', many: 'registros' },
  leads: { one: 'lead', many: 'leads' },
  landingPageViews: { one: 'visita', many: 'visitas' },
  impressions: { one: 'mil impresiones', many: 'mil impresiones' },
  conversations: { one: 'conversación', many: 'conversaciones' },
  linkClicks: { one: 'clic', many: 'clics' },
  thruplays: { one: 'reproducción', many: 'reproducciones' },
  postEngagement: { one: 'interacción', many: 'interacciones' },
  clicks: { one: 'clic', many: 'clics' },
};

export type PortfolioWindow = {
  portfolioId: string;
  /** The result this portfolio buys — the metric's KPI field, e.g. `leads`. */
  kind: string;
  /** Spend over the window, in the account's currency. */
  spend: number;
  results: number;
  /** The window before this one, from the same series. */
  priorSpend: number;
  priorResults: number;
  /** Cost per result in display units (per thousand for awareness). Null without results. */
  costPerResult: number | null;
  priorCostPerResult: number | null;
  /** The portfolio's target in the same units. Null when none was set. */
  target: number | null;
  /** Whole percent over (+) or under (−) the target. Null without a cost or a target. */
  vsTargetPct: number | null;
  /** Whole percent against the window before. Null without a prior cost. */
  vsPriorPct: number | null;
  state: TileState;
  /** When the cycle that measured this window ran. */
  cycleTs: string;
};

/** Cost against target as a state. A figure with no target or no cost cannot be judged. */
export function windowState(vsTargetPct: number | null): TileState {
  if (vsTargetPct == null) return 'none';
  if (vsTargetPct <= 0) return 'ok';
  if (vsTargetPct <= WARN_CEILING_PCT) return 'warn';
  return 'bad';
}

function pctOver(value: number | null, base: number | null): number | null {
  if (value == null || base == null || base <= 0) return null;
  return Math.round((value / base - 1) * 100);
}

function costOf(spend: number, results: number, multiplier: number): number | null {
  if (results <= 0) return null;
  return (spend / results) * multiplier;
}

/**
 * This portfolio's window, from the latest cycle of its efficiency series.
 *
 * The series arrives oldest first; the last point is the cycle that ran most recently and
 * its `d7` is the window. Null when no cycle has run — a portfolio enrolled this morning has
 * no window to quote, and a zero would read as "spent nothing".
 */
export function portfolioWindow(
  portfolio: PortfolioListItem,
  series: readonly EfficiencySeriesPoint[],
): PortfolioWindow | null {
  const latest = series.at(-1);
  if (!latest) return null;
  const metric = getOptimizationMetricDefinition(portfolio.target_metric ?? portfolio.objective);
  const multiplier = metric.denominatorMultiplier;
  const target =
    portfolio.cpa_target != null && portfolio.cpa_target > 0
      ? portfolio.cpa_target * multiplier
      : null;
  const priorSpend = Math.max(0, latest.spend_d14 - latest.spend_d7);
  const priorResults = Math.max(0, latest.conv_d14 - latest.conv_d7);
  const costPerResult = costOf(latest.spend_d7, latest.conv_d7, multiplier);
  const priorCostPerResult = costOf(priorSpend, priorResults, multiplier);
  const vsTargetPct = pctOver(costPerResult, target);
  return {
    portfolioId: portfolio.id,
    kind: metric.kpiField,
    spend: latest.spend_d7,
    results: latest.conv_d7,
    priorSpend,
    priorResults,
    costPerResult,
    priorCostPerResult,
    target,
    vsTargetPct,
    vsPriorPct: pctOver(costPerResult, priorCostPerResult),
    state: windowState(vsTargetPct),
    cycleTs: latest.cycle_ts,
  };
}

export type ResultKind = {
  /** The metric's KPI field — what the portfolios of this kind buy. */
  kind: string;
  /** The word for one result and for many, in the sentence's language. */
  words: { one: string; many: string };
  results: number;
  spend: number;
  priorResults: number;
  priorSpend: number;
  costPerResult: number | null;
  priorCostPerResult: number | null;
  /** The targets the portfolios of this kind set, lowest and highest. Null when none did. */
  targetRange: { min: number; max: number } | null;
  /** One target to measure the blended cost against: each portfolio's, weighted by its results. */
  target: number | null;
  vsTargetPct: number | null;
  vsPriorPct: number | null;
  state: TileState;
  portfolioIds: string[];
};

/** The words for a result kind — the catalogue's own label when the sentence has none. */
export function resultWords(kind: string, fallbackLabel: string): { one: string; many: string } {
  const known = RESULT_WORDS[kind];
  if (known) return known;
  const label = fallbackLabel.toLowerCase();
  return { one: label, many: label };
}

/**
 * The account's results, one row per kind it buys, largest spend first.
 *
 * A window of zero results still counts: "0 compras en Tours" is a fact the sentence has
 * to state, and folding it into silence would hide the one portfolio spending with nothing
 * to show. Portfolios without a window (no cycle yet) are not counted anywhere.
 */
export function resultKinds(
  portfolios: readonly PortfolioListItem[],
  windows: ReadonlyMap<string, PortfolioWindow>,
): ResultKind[] {
  const byKind = new Map<
    string,
    ResultKind & { multiplier: number; weightedTarget: number; weight: number }
  >();
  for (const portfolio of portfolios) {
    const window = windows.get(portfolio.id);
    if (!window) continue;
    const metric = getOptimizationMetricDefinition(portfolio.target_metric ?? portfolio.objective);
    const row = byKind.get(window.kind) ?? {
      kind: window.kind,
      words: resultWords(window.kind, metric.resultLabel),
      results: 0,
      spend: 0,
      priorResults: 0,
      priorSpend: 0,
      costPerResult: null,
      priorCostPerResult: null,
      targetRange: null,
      target: null,
      vsTargetPct: null,
      vsPriorPct: null,
      state: 'none' as TileState,
      portfolioIds: [],
      multiplier: metric.denominatorMultiplier,
      weightedTarget: 0,
      weight: 0,
    };
    row.results += window.results;
    row.spend += window.spend;
    row.priorResults += window.priorResults;
    row.priorSpend += window.priorSpend;
    row.portfolioIds.push(portfolio.id);
    if (window.target != null) {
      row.targetRange = row.targetRange
        ? {
            min: Math.min(row.targetRange.min, window.target),
            max: Math.max(row.targetRange.max, window.target),
          }
        : { min: window.target, max: window.target };
      // A portfolio with no results yet still declares a target; it weighs as one result so
      // a kind whose every portfolio is at zero keeps a target to be read against.
      const weight = Math.max(1, window.results);
      row.weightedTarget += window.target * weight;
      row.weight += weight;
    }
    byKind.set(window.kind, row);
  }
  return [...byKind.values()]
    .map(({ weightedTarget, weight, multiplier, ...row }) => {
      const costPerResult = costOf(row.spend, row.results, multiplier);
      const priorCostPerResult = costOf(row.priorSpend, row.priorResults, multiplier);
      const target = weight > 0 ? weightedTarget / weight : null;
      const vsTargetPct = pctOver(costPerResult, target);
      return {
        ...row,
        costPerResult,
        priorCostPerResult,
        target,
        vsTargetPct,
        vsPriorPct: pctOver(costPerResult, priorCostPerResult),
        state: windowState(vsTargetPct),
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

/** How the account applies moves, counted from the list. */
export type AutopilotSummary = {
  autopilot: number;
  total: number;
  /** The portfolios that only recommend, named so the tile can say who. */
  recommending: string[];
  paused: number;
};

export function autopilotSummary(portfolios: readonly PortfolioListItem[]): AutopilotSummary {
  const autopilot = portfolios.filter((portfolio) => portfolio.apply_mode === 'autopilot');
  return {
    autopilot: autopilot.length,
    total: portfolios.length,
    recommending: portfolios
      .filter((portfolio) => portfolio.apply_mode !== 'autopilot')
      .map((portfolio) => portfolio.name),
    paused: autopilot.filter((portfolio) => portfolio.autopilot_paused).length,
  };
}

/** The whole account over the window: the sum of every portfolio that has one. */
export function accountSpend(
  windows: ReadonlyMap<string, PortfolioWindow>,
): { spend: number; priorSpend: number; portfolios: number } | null {
  let spend = 0;
  let priorSpend = 0;
  let counted = 0;
  for (const window of windows.values()) {
    spend += window.spend;
    priorSpend += window.priorSpend;
    counted += 1;
  }
  return counted === 0 ? null : { spend, priorSpend, portfolios: counted };
}

/** The most recent cycle across the account — the one the window is dated from. */
export function latestCycle(windows: ReadonlyMap<string, PortfolioWindow>): string | null {
  let latest: string | null = null;
  for (const window of windows.values()) {
    if (latest == null || window.cycleTs > latest) latest = window.cycleTs;
  }
  return latest;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `d` de `mes`, in the sentence's language, from a UTC date. */
function dayOfMonth(date: Date): string {
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/**
 * The calendar days the window covers — "21 al 27 de septiembre".
 *
 * A cycle measures the seven full days before the day it runs, so the window ends the day
 * before the cycle's UTC date. Null when no cycle has run.
 */
export function windowLabel(cycleTs: string | null, days: number = WINDOW_DAYS): string | null {
  if (!cycleTs) return null;
  const cycle = Date.parse(cycleTs);
  if (Number.isNaN(cycle)) return null;
  const end = new Date(Math.floor(cycle / DAY_MS) * DAY_MS - DAY_MS);
  const start = new Date(end.getTime() - (days - 1) * DAY_MS);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  if (sameMonth) return `${start.getUTCDate()} al ${dayOfMonth(end)}`;
  return `${dayOfMonth(start)} al ${dayOfMonth(end)}`;
}

/** Whole-percent distance to target as words: "33% sobre objetivo", "12% bajo objetivo". */
export function vsTargetLabel(vsTargetPct: number | null): string {
  if (vsTargetPct == null) return 'sin objetivo';
  if (vsTargetPct === 0) return 'en objetivo';
  return vsTargetPct > 0
    ? `${vsTargetPct}% sobre objetivo`
    : `${Math.abs(vsTargetPct)}% bajo objetivo`;
}

/** Whole-percent move against the window before: "+12% vs sem. ant." */
export function vsPriorLabel(vsPriorPct: number | null): string | null {
  if (vsPriorPct == null) return null;
  const sign = vsPriorPct > 0 ? '+' : vsPriorPct < 0 ? '−' : '';
  return `${sign}${Math.abs(vsPriorPct)}% vs sem. ant.`;
}

/** Pluralised count of a result: "516 conversaciones", "1 lead", "0 compras". */
export function resultCount(count: number, words: { one: string; many: string }): string {
  return `${count.toLocaleString('es-MX')} ${count === 1 ? words.one : words.many}`;
}

/**
 * One clause of the sentence per result kind, in the tile's own terms.
 *
 * With a cost: "conversaciones a 39.95 MXN (33% sobre objetivo)". Without one — zero results
 * — the clause states the count and who is spending: "0 compras en Tours". `names` resolves
 * the portfolios so that second shape can say where.
 */
export type HeadlineClause =
  | {
      shape: 'cost';
      kind: ResultKind;
      /** The cost figure, already formatted with its currency. */
      cost: string;
      distance: string;
    }
  | { shape: 'count'; kind: ResultKind; count: string; where: string | null };

export function headlineClauses(
  kinds: readonly ResultKind[],
  formatCost: (value: number) => string,
  names: ReadonlyMap<string, string>,
): HeadlineClause[] {
  return kinds.map((kind) => {
    if (kind.costPerResult != null) {
      return {
        shape: 'cost',
        kind,
        cost: formatCost(kind.costPerResult),
        distance: vsTargetLabel(kind.vsTargetPct),
      };
    }
    const owners = kind.portfolioIds.map((id) => names.get(id)).filter((name) => Boolean(name));
    return {
      shape: 'count',
      kind,
      count: resultCount(kind.results, kind.words),
      where: owners.length > 0 && owners.length <= 2 ? owners.join(' y ') : null,
    };
  });
}

/** "a, b y c" — the sentence's own list separator. */
export function joinClauses(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** "4 decisiones esperan" / "1 decisión espera" / "ninguna decisión espera". */
export function decisionsLabel(count: number): string {
  if (count === 0) return 'ninguna decisión espera';
  return count === 1 ? '1 decisión espera' : `${count} decisiones esperan`;
}

export type RowSortKey = 'distance' | 'name' | 'daily' | 'pending';
export type RowSortDir = 'asc' | 'desc';

/**
 * The rows, sortable by distance to target — the question the screen is opened with.
 *
 * Ascending distance puts the portfolio furthest OVER its target first, because that is the
 * one to open. A portfolio with no window or no target has no distance and sorts after every
 * one that does, whichever way the list is turned; ties keep the list's own order.
 */
export function sortPortfolioRows(
  portfolios: readonly PortfolioListItem[],
  windows: ReadonlyMap<string, PortfolioWindow>,
  key: RowSortKey,
  dir: RowSortDir,
): PortfolioListItem[] {
  const factor = dir === 'asc' ? 1 : -1;
  const distance = (portfolio: PortfolioListItem) => windows.get(portfolio.id)?.vsTargetPct ?? null;
  return [...portfolios].sort((a, b) => {
    if (key === 'distance') {
      const da = distance(a);
      const db = distance(b);
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return (db - da) * factor;
    }
    let delta: number;
    if (key === 'name') delta = a.name.localeCompare(b.name);
    else if (key === 'daily') delta = (a.daily_total ?? 0) - (b.daily_total ?? 0);
    else delta = pendingWorkCount(a) - pendingWorkCount(b);
    return delta * factor;
  });
}
