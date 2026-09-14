// Target metric + budget plan helpers shared by the wizard, the Manage panel, the MCP
// write surface and the scheduler — so "traffic priced in CPC" and "240k for the flight"
// mean the same thing on every side of the wire.
//
// Every objective is already a metric definition (OPTIMIZATION_METRIC_DEFINITIONS), so a
// portfolio's target metric is simply an objective key: `target_metric` names which
// definition prices `cpa_target`. Absent, the portfolio's own objective does. The engine
// honours it through `config.kpiField`, the same override the scheduler already merges.

import type { OptimizationObjective } from './engine-contracts';
import {
  type BudgetGranularity,
  getOptimizationMetricDefinition,
  type OptimizationMetricDefinition,
  type TargetMetric,
} from './service';

/** Which metrics an objective may be priced in. The objective's own comes first and is
 *  the default. Only objectives with a defensible second currency offer one:
 *   - traffic: cost per landing-page view (own) or cost per link click. Both are real
 *     Meta events an operator buys; LPV is the stricter of the two.
 *  Awareness stays CPM-only: there is no cost-per-reach metric definition to price against. */
export function allowedTargetMetrics(objective: OptimizationObjective): TargetMetric[] {
  switch (objective) {
    case 'traffic':
      return ['traffic', 'link_clicks'];
    case 'link_clicks':
      return ['link_clicks', 'traffic'];
    default:
      return [objective];
  }
}

/** The metric definition a portfolio's target and cost-per-result read in. */
export function portfolioMetric(portfolio: {
  objective: string;
  target_metric?: string | null;
}): OptimizationMetricDefinition {
  const metric = portfolio.target_metric ?? portfolio.objective;
  return getOptimizationMetricDefinition(metric as OptimizationObjective);
}

const MS_PER_DAY = 86_400_000;

/** Whole days in a flight, both ends inclusive. Null when either date is missing or
 *  malformed, or the end precedes the start. */
export function flightDays(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return Math.round((to - from) / MS_PER_DAY) + 1;
}

/** The average month the "per month" granularity is normalised against. A 30-day month
 *  keeps the arithmetic legible to the operator (240k/month over a 30-day flight is 240k),
 *  which matters more here than calendar precision. */
export const DAYS_PER_MONTH = 30;

/** The period budget a typed amount implies for the flight, by granularity.
 *  Null when the flight is undefined and the amount is not already a period total. */
export function derivePeriodBudget(
  amount: number,
  granularity: BudgetGranularity,
  start?: string | null,
  end?: string | null,
): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (granularity === 'total') return amount;
  const days = flightDays(start, end);
  if (days == null) return null;
  if (granularity === 'daily') return amount * days;
  return (amount * days) / DAYS_PER_MONTH;
}

/** The daily total a typed amount implies, by granularity. Daily is the amount itself;
 *  monthly is amount / 30; total needs the flight length. */
export function deriveDailyTotal(
  amount: number,
  granularity: BudgetGranularity,
  start?: string | null,
  end?: string | null,
): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (granularity === 'daily') return amount;
  if (granularity === 'monthly') return amount / DAYS_PER_MONTH;
  const days = flightDays(start, end);
  if (days == null) return null;
  return amount / days;
}

/** The stored budget fields a wizard/Manage submission implies. `period_budget` is only
 *  set when a flight exists; without one the amount can only be a daily total. */
export function budgetFieldsFor(input: {
  amount: number;
  granularity: BudgetGranularity;
  period_start?: string | null;
  period_end?: string | null;
}): { daily_total: number | null; period_budget: number | null } {
  const { amount, granularity, period_start, period_end } = input;
  const daily = deriveDailyTotal(amount, granularity, period_start, period_end);
  const period = derivePeriodBudget(amount, granularity, period_start, period_end);
  return { daily_total: daily, period_budget: period };
}
