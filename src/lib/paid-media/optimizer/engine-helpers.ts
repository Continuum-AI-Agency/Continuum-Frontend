import { runCycle } from "@continuum/optimization-engine";
import type { CycleResult, ReallocationResult } from "@continuum/optimization-engine";

import { MONTH, type OptimizerPortfolio } from "./types";

export type ComputeOverrides = {
  /** Override the portfolio daily budget for THIS reallocation only. */
  dailyBudget?: number;
  /** Override the velocity cap (percent) for THIS reallocation only. */
  velocityCap?: number;
};

/** Run a full optimization cycle for one portfolio, with optional review overrides. */
export function runPortfolioCycle(
  pf: OptimizerPortfolio,
  overrides?: ComputeOverrides,
): CycleResult {
  const c = pf.config;
  const total = Math.round(overrides?.dailyBudget ?? c.dailyBudget);
  return runCycle(pf.snapshots, {
    mode: c.mode,
    total,
    maxBudget: Math.round(total * 1.3),
    weeklyGrowthPct: 0.05,
    config: {
      cpaTarget: c.cpaTarget,
      velocityCapPct: (overrides?.velocityCap ?? c.velocityCap) / 100,
    },
  });
}

export type Projection = {
  daily: number;
  month30: number;
  toMonthEnd: number;
  remainingDays: number;
  /** Projected 30-day spend vs the planned period budget, in percent. */
  pctVsPlan: number;
};

export function projectSpend(pf: OptimizerPortfolio, dailyOverride?: number): Projection {
  const daily = dailyOverride ?? pf.config.dailyBudget;
  const month30 = daily * 30;
  const remainingDays = MONTH.days - MONTH.day + 1;
  const toMonthEnd = daily * remainingDays;
  const pctVsPlan =
    pf.config.periodBudget > 0
      ? ((month30 - pf.config.periodBudget) / pf.config.periodBudget) * 100
      : 0;
  return { daily, month30, toMonthEnd, remainingDays, pctVsPlan };
}

/** Portfolio CPI/CPP over the 14-day window (Σ spend / Σ conversions). */
export function portfolioCpi(pf: OptimizerPortfolio): number {
  let spend = 0;
  let conv = 0;
  for (const s of pf.snapshots) {
    spend += s.windows.d14.spend;
    conv += s.windows.d14.purchases;
  }
  return conv > 0 ? spend / conv : 0;
}

export function spend14d(pf: OptimizerPortfolio): number {
  return pf.snapshots.reduce((acc, s) => acc + s.windows.d14.spend, 0);
}

/** Budget moved toward better performers this cycle (sum of positive deltas). */
export function moneyMoved(r: ReallocationResult): number {
  return r.items.reduce((acc, i) => (i.changeAbs > 0 ? acc + i.changeAbs : acc), 0);
}

/** Pending actions for a portfolio = 1 reallocation + N pause recommendations. */
export function pendingCount(result: CycleResult): number {
  return 1 + result.recommendations.length;
}

export const TRIGGER_LABELS: Record<string, string> = {
  P1_zero_upper_funnel: "Zero upper funnel",
  P2_sustained_poor: "Sustained poor performance",
  P3_low_significance: "Dead weight",
};

export const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

/** Last colon-delimited segment of a Meta ad set name. */
export const shortName = (name: string): string => {
  const parts = String(name).split(":");
  return parts[parts.length - 1] || name;
};

export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Short, human label for a portfolio (the segment after the last "·"). */
export const portfolioShortLabel = (name: string): string => {
  const parts = name.split("·");
  return (parts[parts.length - 1] ?? name).trim();
};
