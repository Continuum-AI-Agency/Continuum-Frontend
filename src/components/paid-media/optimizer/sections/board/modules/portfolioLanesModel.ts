// The portfolio lanes (O04): one lane per portfolio, its cost per result against its own goal,
// a status in words, its daily plan and the decisions waiting. The figure is the portfolio's
// headline figure from portfolioFigure() — the one function the Today rows and the portfolio
// hero print — so a lane, a row and the portfolio it opens cannot disagree.

import type { PortfolioListItem } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { pendingWorkCount } from '../../../reportModel';
import { resultWords, sortPortfolioRows } from '../../account/overviewModel';
import { figureAsOfText, type PortfolioFigure } from '../../portfolioFigure';
import { portfolioPlanPerDay } from '../../portfolioPlan';

export type LaneStatus = 'on-track' | 'above-goal' | 'no-goal' | 'lost-ad-sets' | 'unread';

export const LANE_STATUS_LABEL: Record<LaneStatus, string> = {
  'on-track': 'On track',
  'above-goal': 'Above goal',
  'no-goal': 'No goal',
  'lost-ad-sets': 'Lost its ad sets',
  unread: 'Not read yet',
};

export type PortfolioLane = {
  portfolio: PortfolioListItem;
  figure: PortfolioFigure | null;
  status: LaneStatus;
  /** Cost per result in display units (per thousand for awareness); null without results. */
  cost: number | null;
  /** The goal in the same units; null when the portfolio sets none. */
  goal: number | null;
  /** Whole percent over (+) or under (−) the goal; null without both. */
  vsGoalPct: number | null;
  dailyBudget: number | null;
  pending: number;
  words: { one: string; many: string };
  currency: string | null;
  /** "as of Oct 15" when the figure is the last cycle's rather than live; null when live. */
  asOf: string | null;
};

/** The portfolio's goal in display units, read the way portfolioWindowOf reads it. */
export function laneGoal(portfolio: PortfolioListItem): number | null {
  const metric = getOptimizationMetricDefinition(portfolio.target_metric ?? portfolio.objective);
  return portfolio.cpa_target != null && portfolio.cpa_target > 0
    ? portfolio.cpa_target * metric.denominatorMultiplier
    : null;
}

/** Lost its ad sets outranks everything: no figure on it can move. Then a portfolio without a
 *  goal cannot be judged, and one with a goal but no figure has not been read yet. */
export function laneStatus(
  portfolio: Pick<PortfolioListItem, 'roster_state' | 'withdrawn_reason'>,
  goal: number | null,
  figure: Pick<PortfolioFigure, 'vsTargetPct'> | null,
): LaneStatus {
  if (portfolio.roster_state === 'absent' || portfolio.withdrawn_reason === 'roster_absent') {
    return 'lost-ad-sets';
  }
  if (goal == null) return 'no-goal';
  if (figure?.vsTargetPct == null) return 'unread';
  return figure.vsTargetPct > 0 ? 'above-goal' : 'on-track';
}

export function portfolioLane(
  portfolio: PortfolioListItem,
  figure: PortfolioFigure | null,
  fallbackCurrency: string | null,
): PortfolioLane {
  const metric = getOptimizationMetricDefinition(portfolio.target_metric ?? portfolio.objective);
  const goal = figure?.target ?? laneGoal(portfolio);
  return {
    portfolio,
    figure,
    status: laneStatus(portfolio, goal, figure),
    cost: figure?.costPerResult ?? null,
    goal,
    vsGoalPct: figure?.vsTargetPct ?? null,
    dailyBudget: portfolioPlanPerDay(portfolio),
    pending: pendingWorkCount(portfolio),
    words: resultWords(metric.kpiField, metric.resultLabel),
    currency: figure?.currency ?? portfolio.currency ?? fallbackCurrency,
    asOf: figureAsOfText(figure),
  };
}

export type LaneSort = 'distance' | 'budget' | 'decisions';

export const LANE_SORT_LABEL: Record<LaneSort, string> = {
  distance: 'Distance to goal',
  budget: 'Budget',
  decisions: 'Decisions',
};

/**
 * The lanes in the order asked for. Distance puts the portfolio furthest over its goal first —
 * the one to open — and every lane without a distance after the ones with one, as the Today rows
 * sort (sortPortfolioRows). Budget and decisions put the largest first.
 */
export function sortLanes(lanes: readonly PortfolioLane[], sort: LaneSort): PortfolioLane[] {
  const byId = new Map(lanes.map((lane) => [lane.portfolio.id, lane]));
  const windows = new Map(
    lanes.flatMap((lane) => (lane.figure ? [[lane.portfolio.id, lane.figure] as const] : [])),
  );
  const ordered = sortPortfolioRows(
    lanes.map((lane) => lane.portfolio),
    windows,
    sort === 'distance' ? 'distance' : sort === 'budget' ? 'daily' : 'pending',
    sort === 'distance' ? 'asc' : 'desc',
  );
  return ordered.flatMap((portfolio) => {
    const lane = byId.get(portfolio.id);
    return lane ? [lane] : [];
  });
}
