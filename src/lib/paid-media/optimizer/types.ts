import type {
  AdSetSnapshot,
  OptimizationMode,
  OptimizationObjective,
} from "@continuum/optimization-engine";

export type { OptimizationMode, OptimizationObjective };

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
  /** Max change per ad set per cycle, in percent (legacy symmetric fallback). */
  velocityCap: number;
  /**
   * Asymmetric per-cycle caps in percent. When unset, the objective profile's
   * calibrated caps apply. Set via the reallocation review's "Apply to portfolio".
   */
  velocityUpPct?: number;
  velocityDownPct?: number;
  /** Target cost per acquisition / install. */
  cpaTarget: number;
};

export type OptimizerPortfolio = {
  id: string;
  name: string;
  objective: OptimizationObjective;
  currency: string;
  config: PortfolioConfig;
  snapshots: AdSetSnapshot[];
};

/** Human-readable labels for each objective (UI display). */
export const OBJECTIVE_LABELS: Record<OptimizationObjective, string> = {
  purchase: "Purchases",
  app_install: "App installs",
  signup: "Sign-ups",
  lead: "Leads",
  traffic: "Traffic",
  awareness: "Awareness",
};

/** An ad set in the account catalog (real Meta ID), addable in Settings. */
export type CatalogAdSet = AdSetSnapshot & { cpi: number };

/**
 * Demo clock: a 30-day month, "today" = day 14. Drives the month-end and
 * "vs plan" projections until real calendar wiring lands.
 */
export const MONTH = { days: 30, day: 14 } as const;
