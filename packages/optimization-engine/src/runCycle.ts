// ---------------------------------------------------------------------------
// runCycle() — the full optimization cycle, end to end:
//   pacing -> classify -> triggers (recommendations + starve) -> reallocate
// The mode shapes the budget boundary:
//   balanced   — spend the planned total exactly (overflow => breach best)
//   efficiency — planned total is a CEILING; underspend if it doesn't fit
//   scale      — may grow up to maxBudget while the portfolio meets target
// ---------------------------------------------------------------------------

import { resolveConfig } from './config';
import type { DeepPartial, EngineConfig } from './config';
import { classifyPortfolio } from './classify';
import { evaluateTriggers } from './triggers';
import { computePacing } from './pacing';
import { reallocate } from './engine';
import { sum } from './internal/math';
import { kpiEvents } from './scoring';
import type {
  AdSetSnapshot,
  CycleResult,
  OptimizationMode,
  OptimizationObjective,
  PacingResult,
  PacingState,
} from './types';

export type CycleOptions = {
  mode?: OptimizationMode; // default 'balanced'
  pacing?: PacingState; // if given, pacing decides the daily total
  total?: number; // explicit total when no pacing state is provided
  maxBudget?: number; // ceiling for 'scale' mode
  weeklyGrowthPct?: number; // step for 'scale' mode (default 0.05)
  objective?: OptimizationObjective; // selects the calibrated profile + KPI
  /** Prior smoothed composite per ad set id (EWMA state from the last cycle). */
  priorComposites?: Record<string, number>;
  config?: DeepPartial<EngineConfig>;
};

export function runCycle(snapshots: AdSetSnapshot[], opts: CycleOptions): CycleResult {
  const mode: OptimizationMode = opts.mode ?? 'balanced';
  const configOverride: DeepPartial<EngineConfig> = { objective: opts.objective, ...opts.config };
  const baseCfg = resolveConfig(configOverride);

  // --- Pacing: the planned daily total ----------------------------------
  let pacing: PacingResult;
  let plannedTotal: number;
  if (opts.pacing) {
    pacing = computePacing(opts.pacing);
    plannedTotal = pacing.dailyTotal;
  } else {
    plannedTotal = opts.total ?? sum(snapshots.map((s) => s.currentBudget));
    pacing = {
      dailyTotal: plannedTotal, idealCumulative: 0, pacingRatio: 1,
      status: 'on_track', note: 'No pacing state: using the provided total.',
    };
  }

  // --- Classify, then run triggers, then mark starved -------------------
  const classified = classifyPortfolio(snapshots, baseCfg);
  const { recommendations, starveIds } = evaluateTriggers(classified, baseCfg);
  const prepared = classified.map((s) =>
    starveIds.has(s.id) && s.status !== 'frozen' ? { ...s, status: 'starved' as const } : s,
  );

  // --- Mode shapes the boundary -----------------------------------------
  let total = plannedTotal;
  let overflowMode: EngineConfig['overflowMode'] = 'breach_best';

  if (mode === 'efficiency') {
    // planned total is a ceiling; never force-spend on bad inventory
    overflowMode = 'underspend';
  } else if (mode === 'scale') {
    overflowMode = 'breach_best';
    const totSpend = sum(prepared.map((s) => s.windows.d14.spend));
    const totEvents = sum(prepared.map((s) => kpiEvents(s.windows.d14, baseCfg)));
    const portfolioCpp = totEvents > 0 ? totSpend / totEvents : Infinity;
    const meetsTarget = portfolioCpp <= baseCfg.cpaTarget;
    if (meetsTarget && opts.maxBudget) {
      const step = 1 + (opts.weeklyGrowthPct ?? 0.05);
      total = Math.min(opts.maxBudget, plannedTotal * step);
    }
  }

  const reallocation = reallocate(
    prepared,
    total,
    { ...configOverride, overflowMode },
    opts.priorComposites,
  );

  return { mode, pacing, reallocation, recommendations };
}
