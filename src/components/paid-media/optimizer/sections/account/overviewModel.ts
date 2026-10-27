// The Overview's figures, composed from typed fields and nothing else.
//
// Performance+ redesign, stage 1b (docs/performance-plus-redesign/overview.html, proposal O1).
// The screen opens with one sentence — what the account spent over the window and how many
// decisions wait — and every number in it has to be one a reader can check against a tile
// below; what each result kind cost against its target is the tiles' own line. So the sentence and the tiles are built
// here from the SAME rows: the portfolio list (objective, target, budget, mode) and the
// optimizer's own efficiency series per portfolio (spend and results per trailing window,
// aggregated across the portfolio's ad sets at each cycle). No free text, no model prose.
//
// The window is the trailing seven days the latest cycle measured. The window before it is
// the fourteen-day figure minus the seven-day one — the same series, so "last week" cannot
// come from a different read than "this week".

import type {
  EfficiencySeriesPoint,
  PortfolioListItem,
  PortfolioMetrics,
} from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import type { FigureProps } from '../../format';
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
  purchases: { one: 'purchase', many: 'purchases' },
  appInstalls: { one: 'install', many: 'installs' },
  signups: { one: 'sign-up', many: 'sign-ups' },
  leads: { one: 'lead', many: 'leads' },
  landingPageViews: { one: 'visit', many: 'visits' },
  impressions: { one: 'thousand impressions', many: 'thousand impressions' },
  conversations: { one: 'conversation', many: 'conversations' },
  linkClicks: { one: 'click', many: 'clicks' },
  thruplays: { one: 'play', many: 'plays' },
  postEngagement: { one: 'engagement', many: 'engagements' },
  clicks: { one: 'click', many: 'clicks' },
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
  const figures = seriesWindowFigures(series);
  return figures ? portfolioWindowOf(portfolio, figures) : null;
}

/** The latest cycle's 7-day window (and the 7 days before it) from an efficiency series,
 *  oldest first. Null before the first cycle. */
export function seriesWindowFigures(
  series: readonly EfficiencySeriesPoint[],
): WindowFigures | null {
  const latest = series.at(-1);
  if (!latest) return null;
  return {
    spend: latest.spend_d7,
    results: latest.conv_d7,
    priorSpend: Math.max(0, latest.spend_d14 - latest.spend_d7),
    priorResults: Math.max(0, latest.conv_d14 - latest.conv_d7),
    cycleTs: latest.cycle_ts,
  };
}

/**
 * The same window from the portfolio's metrics read (optimizer_get_portfolio_metrics, d7).
 *
 * The efficiency series sums adset_snapshots, which only Meta ad sets write: a Google
 * portfolio's series is empty however many cycles ran, and a mixed one's counts its Meta half
 * only. Null before the first cycle has landed, as above.
 */
export function portfolioWindowFromMetrics(
  portfolio: PortfolioListItem,
  metrics: PortfolioMetrics,
): PortfolioWindow | null {
  const cycleTs = portfolio.last_actual_cycle_at;
  if (!cycleTs) return null;
  return portfolioWindowOf(portfolio, {
    spend: metrics.totals.spend,
    results: metrics.totals.results,
    priorSpend: metrics.prior_totals?.spend ?? 0,
    priorResults: metrics.prior_totals?.results ?? 0,
    cycleTs,
  });
}

/** The figures one window measured, before they are priced against the portfolio's target. */
export type WindowFigures = Pick<
  PortfolioWindow,
  'spend' | 'results' | 'priorSpend' | 'priorResults' | 'cycleTs'
>;

/** A window's figures priced against the portfolio's own metric and target. */
export function portfolioWindowOf(
  portfolio: PortfolioListItem,
  figures: WindowFigures,
): PortfolioWindow {
  const metric = getOptimizationMetricDefinition(portfolio.target_metric ?? portfolio.objective);
  const multiplier = metric.denominatorMultiplier;
  const target =
    portfolio.cpa_target != null && portfolio.cpa_target > 0
      ? portfolio.cpa_target * multiplier
      : null;
  const costPerResult = costOf(figures.spend, figures.results, multiplier);
  const priorCostPerResult = costOf(figures.priorSpend, figures.priorResults, multiplier);
  const vsTargetPct = pctOver(costPerResult, target);
  return {
    portfolioId: portfolio.id,
    kind: metric.kpiField,
    ...figures,
    costPerResult,
    priorCostPerResult,
    target,
    vsTargetPct,
    vsPriorPct: pctOver(costPerResult, priorCostPerResult),
    state: windowState(vsTargetPct),
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
 * A window of zero results still counts: "0 purchases in Tours" is a fact the sentence has
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

/** The account's spend against the week before, in whole percent; null without a prior week. */
export function spendVsPriorPct(
  spend: { spend: number; priorSpend: number } | null,
): number | null {
  return spend ? pctOver(spend.spend, spend.priorSpend) : null;
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

/** `Mon d`, en-US, from a UTC date: "Sep 27". */
function monthDay(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * The calendar days the window covers — "Sep 21–27", or "Sep 26 – Oct 2" across a month.
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
  if (sameMonth) return `${monthDay(start)}–${end.getUTCDate()}`;
  return `${monthDay(start)} – ${monthDay(end)}`;
}

/** Which side of its target a cost sits on. `none` is "no cost or no target to judge by". */
export type TargetSide = 'over' | 'under' | 'on' | 'none';

/** The side of the target, as a value — callers branch on this, never on the label's words. */
export function targetSide(vsTargetPct: number | null): TargetSide {
  if (vsTargetPct == null) return 'none';
  if (vsTargetPct === 0) return 'on';
  return vsTargetPct > 0 ? 'over' : 'under';
}

/** Whole-percent distance to target as words: "33% over target", "12% under target". */
export function vsTargetLabel(vsTargetPct: number | null): string {
  const side = targetSide(vsTargetPct);
  if (side === 'none') return 'no target';
  if (side === 'on') return 'on target';
  return `${Math.abs(vsTargetPct ?? 0)}% ${side} target`;
}

/**
 * The Overview's sentence, as parts a renderer can style without re-reading the words: plain
 * text, a figure (mono, with its provenance) and the decisions clause (the one part that asks
 * for a person, so it takes the primary colour). One sentence, three facts — what was spent,
 * over which window, and how many decisions wait. What each result kind cost is the tiles'
 * job; repeating it here made the sentence two lines of figures.
 */
export type HeadlineSegment =
  | { kind: 'text'; text: string }
  | { kind: 'figure'; text: string; figure: FigureProps }
  | {
      kind: 'decisions';
      count: number;
      /** The count as the sentence prints it, or null when there is none ("No decisions…"). */
      figure: string | null;
      /** The words after the count, or the whole clause when there is no count. */
      words: string;
    };

export type HeadlineSpend = { text: string; figure: FigureProps };

export function accountHeadlineSegments({
  spends,
  span,
  decisions,
}: {
  /** The account's spend, one figure per currency — never one sum across two. */
  spends: readonly HeadlineSpend[];
  /** What follows the spend: "in 7 days", "in 7 days across two platforms". */
  span: string;
  decisions: number;
}): HeadlineSegment[] {
  const segments: HeadlineSegment[] = [{ kind: 'text', text: 'The account spent ' }];
  spends.forEach((spend, index) => {
    if (index > 0)
      segments.push({ kind: 'text', text: index === spends.length - 1 ? ' and ' : ', ' });
    segments.push({ kind: 'figure', text: spend.text, figure: spend.figure });
  });
  segments.push({ kind: 'text', text: ` ${span}. ` });
  segments.push(decisionsSegment(decisions));
  return segments;
}

/** "16 decisions waiting." split into its count and its words; "No decisions waiting." whole. */
export function decisionsSegment(count: number): HeadlineSegment {
  if (count === 0)
    return { kind: 'decisions', count, figure: null, words: 'No decisions waiting.' };
  return {
    kind: 'decisions',
    count,
    figure: count.toLocaleString('en-US'),
    words: count === 1 ? ' decision waiting.' : ' decisions waiting.',
  };
}

/** The sentence as one string — what a screen reader, a test or a log line reads. */
export function headlineText(segments: readonly HeadlineSegment[]): string {
  return segments
    .map((segment) =>
      segment.kind === 'decisions' ? `${segment.figure ?? ''}${segment.words}` : segment.text,
    )
    .join('');
}

/** "4 decisions waiting" / "1 decision waiting" / "no decisions waiting". */
export function decisionsLabel(count: number): string {
  if (count === 0) return 'no decisions waiting';
  return count === 1 ? '1 decision waiting' : `${count} decisions waiting`;
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
