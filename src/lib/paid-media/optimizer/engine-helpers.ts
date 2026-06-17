import { getObjectiveProfile, runCycle } from "@continuum/optimization-engine";
import type {
  AdSetSnapshot,
  CycleResult,
  ItemDiagnostics,
  OptimizationObjective,
  ReallocationResult,
} from "@continuum/optimization-engine";

import { MONTH, type OptimizerPortfolio } from "./types";

export type ComputeOverrides = {
  /** Override the portfolio daily budget for THIS reallocation only. */
  dailyBudget?: number;
  /** Override the legacy symmetric velocity cap (percent) for THIS reallocation only. */
  velocityCap?: number;
  /** Override the asymmetric raise / cut caps (percent) for THIS reallocation only. */
  velocityUpPct?: number;
  velocityDownPct?: number;
  /** Prior smoothed composite per ad set id (EWMA state from the last cycle). */
  priorComposites?: Record<string, number>;
};

/** Run a full optimization cycle for one portfolio, with optional review overrides. */
export function runPortfolioCycle(
  pf: OptimizerPortfolio,
  overrides?: ComputeOverrides,
): CycleResult {
  const c = pf.config;
  // `|| c.x` (not `??`): a cleared / 0 override falls back to the configured value,
  // so an empty budget field never collapses the whole proposal to zero.
  const total = Math.round(overrides?.dailyBudget || c.dailyBudget);
  // Asymmetric caps precedence: review override -> portfolio setting -> profile default.
  const upPct = overrides?.velocityUpPct ?? c.velocityUpPct;
  const downPct = overrides?.velocityDownPct ?? c.velocityDownPct;
  return runCycle(pf.snapshots, {
    mode: c.mode,
    total,
    maxBudget: Math.round(total * 1.3),
    weeklyGrowthPct: 0.05,
    objective: pf.objective,
    priorComposites: overrides?.priorComposites,
    config: {
      cpaTarget: c.cpaTarget,
      velocityCapPct: (overrides?.velocityCap || c.velocityCap) / 100,
      ...(upPct !== undefined ? { velocityUpPct: upPct / 100 } : {}),
      ...(downPct !== undefined ? { velocityDownPct: downPct / 100 } : {}),
    },
  });
}

/** Reallocation items sorted by proposed budget, descending. */
export function rankedItems(reallocation: ReallocationResult): ItemDiagnostics[] {
  return [...reallocation.items].sort((a, b) => b.finalBudget - a.finalBudget);
}

/** Largest current-or-proposed budget, for scaling the share bars (min 1). */
export function maxBudgetBar(items: ItemDiagnostics[]): number {
  return Math.max(1, ...items.map((i) => Math.max(i.finalBudget, i.currentBudget)));
}

/** Lookup map from ad set id to its snapshot. */
export function snapshotsById(pf: OptimizerPortfolio): Map<string, AdSetSnapshot> {
  return new Map(pf.snapshots.map((s) => [s.id, s]));
}

/** Snapshot the composite scores from a cycle as the next cycle's EWMA prior. */
export function compositesFrom(items: ItemDiagnostics[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const i of items) map[i.id] = i.compositeScore;
  return map;
}

/** Cost-per-event metric per objective: display label + scale (awareness => CPM x1000). */
const COST_METRIC: Record<OptimizationObjective, { label: string; scale: number }> = {
  purchase: { label: "CPA", scale: 1 },
  app_install: { label: "CPI", scale: 1 },
  signup: { label: "CPA", scale: 1 },
  lead: { label: "CPL", scale: 1 },
  traffic: { label: "CPV", scale: 1 },
  awareness: { label: "CPM", scale: 1000 },
};

export const costLabel = (objective: OptimizationObjective): string =>
  COST_METRIC[objective].label;

/** Per-ad-set cost from its 14d score (score = events/spend => cost = scale/score). */
export const costFromScore = (score: number, objective: OptimizationObjective): number =>
  score > 0 ? COST_METRIC[objective].scale / score : 0;

export type Projection = {
  daily: number;
  month30: number;
  toMonthEnd: number;
  remainingDays: number;
  /** Projected 30-day spend vs the planned period budget, in percent. */
  pctVsPlan: number;
};

export function projectSpend(pf: OptimizerPortfolio, dailyOverride?: number): Projection {
  const daily = dailyOverride || pf.config.dailyBudget;
  const month30 = daily * 30;
  const remainingDays = MONTH.days - MONTH.day + 1;
  const toMonthEnd = daily * remainingDays;
  const pctVsPlan =
    pf.config.periodBudget > 0
      ? ((month30 - pf.config.periodBudget) / pf.config.periodBudget) * 100
      : 0;
  return { daily, month30, toMonthEnd, remainingDays, pctVsPlan };
}

/** Portfolio cost per KPI event over the 14-day window (Σ spend / Σ events). */
export function portfolioCpi(pf: OptimizerPortfolio): number {
  const kpiField = getObjectiveProfile(pf.objective).kpiField;
  let spend = 0;
  let conv = 0;
  for (const s of pf.snapshots) {
    spend += s.windows.d14.spend;
    conv += (s.windows.d14[kpiField] ?? 0) as number;
  }
  return conv > 0 ? (spend / conv) * COST_METRIC[pf.objective].scale : 0;
}

export function spend14d(pf: OptimizerPortfolio): number {
  return pf.snapshots.reduce((acc, s) => acc + s.windows.d14.spend, 0);
}

/** Budget moved toward better performers this cycle (sum of positive deltas). */
export function moneyMoved(r: ReallocationResult): number {
  return r.items.reduce((acc, i) => (i.changeAbs > 0 ? acc + i.changeAbs : acc), 0);
}

/** Stable keys for a portfolio's proposed actions (used for approval tracking). */
export function reallocationKey(portfolioId: string): string {
  return `realloc:${portfolioId}`;
}
export function pauseKey(portfolioId: string, adSetId: string): string {
  return `pause:${portfolioId}:${adSetId}`;
}
export function portfolioActionKeys(
  portfolioId: string,
  result: CycleResult,
): string[] {
  return [
    reallocationKey(portfolioId),
    ...result.recommendations.map((rec) => pauseKey(portfolioId, rec.adSetId)),
  ];
}

/** Count of a portfolio's actions still awaiting approval. */
export function pendingRemaining(
  portfolioId: string,
  result: CycleResult,
  isApproved: (key: string) => boolean,
): number {
  return portfolioActionKeys(portfolioId, result).filter((k) => !isApproved(k)).length;
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
