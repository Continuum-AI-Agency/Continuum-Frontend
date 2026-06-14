import type { AdSetSnapshot, OptimizationMode } from "@continuum/optimization-engine";

export type { OptimizationMode };

/**
 * Portfolio-level configuration. These are the source of truth: once saved,
 * reallocation runs automatically. `velocityCap` is a percent (e.g. 30 = ±30%).
 */
export type PortfolioConfig = {
  mode: OptimizationMode;
  /** Planned total budget for the period (the month). */
  periodBudget: number;
  /** Daily budget to allocate this cycle. */
  dailyBudget: number;
  /** Max change per ad set per cycle, in percent. */
  velocityCap: number;
  /** Target cost per acquisition / install. */
  cpaTarget: number;
};

export type OptimizerPortfolio = {
  id: string;
  name: string;
  objective: string;
  currency: string;
  config: PortfolioConfig;
  snapshots: AdSetSnapshot[];
};

/** An ad set in the account catalog (real Meta ID), addable in Settings. */
export type CatalogAdSet = AdSetSnapshot & { cpi: number };

/**
 * Demo clock: a 30-day month, "today" = day 14. Drives the month-end and
 * "vs plan" projections until real calendar wiring lands.
 */
export const MONTH = { days: 30, day: 14 } as const;
