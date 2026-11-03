// H04 Opportunities: the decisions waiting on the brand across its Optimizer portfolios, read
// from optimizer_list_portfolios alone. A portfolio counts when it is active and not observing
// (the reading's own rule, readBrand's waitingOf), and what waits there is its pending
// recommendations plus its pending budget moves (the Optimizer's pendingWorkCount). The items
// themselves, with their impact and their buttons, are the Optimizer's Actions queue, opened in
// the tile's expanded module.

import type { PortfolioListItem } from '@continuum/contracts';
import { pendingWorkCount } from '@/components/paid-media/optimizer/reportModel';

const SCALE = '/scale?tab=performance';

export const OPTIMIZER_LINKS = {
  actions: `${SCALE}&optimizerView=actions`,
  create: `${SCALE}&optimizerView=create`,
  automations: `${SCALE}&optimizerView=automations`,
} as const;

/** The portfolio's page in the Optimizer: its queue, its chart and its settings. */
export function portfolioDecisionsHref(portfolioId: string): string {
  return `${SCALE}&optimizerView=portfolios&portfolio=${encodeURIComponent(portfolioId)}`;
}

export const OPPS_MISSING =
  'No portfolio groups these campaigns yet — create one in the Optimizer.';

export const OPPS_GOAL_UNITS_NOTE =
  'Impact in goal units is not readable yet. A decision shows the money per day it is worth where the Optimizer sized it.';

export type WaitingPortfolio = {
  id: string;
  name: string;
  recommendations: number;
  budgetMoves: number;
  count: number;
  portfolio: PortfolioListItem;
};

export type OppsView =
  | { state: 'missing' }
  | { state: 'ready'; waiting: number; portfolios: WaitingPortfolio[] };

export const isActive = (portfolio: Pick<PortfolioListItem, 'status'>): boolean =>
  portfolio.status === 'active';

/** Active and not observing: a portfolio that proposes changes. */
export const proposesChanges = (
  portfolio: Pick<PortfolioListItem, 'status' | 'apply_mode'>,
): boolean => isActive(portfolio) && portfolio.apply_mode !== 'observe';

export function oppsViewOf(rows: readonly PortfolioListItem[]): OppsView {
  if (!rows.some(isActive)) return { state: 'missing' };
  const portfolios = rows
    .filter(proposesChanges)
    .map((portfolio) => ({
      id: portfolio.id,
      name: portfolio.name,
      recommendations: portfolio.pending_recommendations,
      budgetMoves: portfolio.pending_budget_moves,
      count: pendingWorkCount(portfolio),
      portfolio,
    }))
    .filter((waiting) => waiting.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const waiting = portfolios.reduce((sum, portfolio) => sum + portfolio.count, 0);
  return { state: 'ready', waiting, portfolios };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "9 recommendations · 2 budget moves". */
export function waitingLine(portfolio: Pick<WaitingPortfolio, 'recommendations' | 'budgetMoves'>) {
  return [
    portfolio.recommendations > 0
      ? plural(portfolio.recommendations, 'recommendation', 'recommendations')
      : null,
    portfolio.budgetMoves > 0 ? plural(portfolio.budgetMoves, 'budget move', 'budget moves') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
