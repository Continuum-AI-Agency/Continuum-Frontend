// A portfolio's daily plan, as every screen prints it.
//
// daily_total is born as the sum of the members' budgets when a portfolio is created and is
// never re-derived. On budget_source 'observed' (the default) the engine ignores it and conserves
// the live sum of the members it scores, so the stored figure drifts: Easy Fit's Google portfolio
// stored 1870 — two PAUSED/ENDED campaigns included — while every cycle conserved 670
// (PP-DT-B-portfolio-plan-counts-paused-campaigns). Its plan is what the last cycle conserved;
// a fixed total is the one a person typed. Settings forms keep reading the stored daily_total.

import type { PortfolioListItem } from '@continuum/contracts';

export type PlanSource = Pick<PortfolioListItem, 'daily_total'> &
  Partial<Pick<PortfolioListItem, 'budget_source' | 'conserved_daily_total'>>;

export function portfolioPlanPerDay(portfolio: PlanSource): number | null {
  const observed = (portfolio.budget_source ?? 'observed') === 'observed';
  const conserved = portfolio.conserved_daily_total;
  if (observed && conserved != null && Number.isFinite(conserved)) return conserved;
  return portfolio.daily_total ?? null;
}
