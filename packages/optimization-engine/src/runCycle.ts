// ---------------------------------------------------------------------------
// runCycle() — the full optimization cycle, end to end:
//   pacing -> classify -> triggers (recommendations + starve) -> reallocate
// The mode shapes the budget boundary:
//   balanced   — spend the planned total exactly (overflow => breach best)
//   efficiency — planned total is a CEILING; underspend if it doesn't fit
//   scale      — may grow up to maxBudget while the portfolio meets target
// ---------------------------------------------------------------------------

import { classifyPortfolio } from './classify';
import { portfolioConfidence } from './confidence';
import type { DeepPartial, EngineConfig } from './config';
import { resolveConfig } from './config';
import { reallocate } from './engine';
import { evaluateFatigue } from './fatigue';
import { sum } from './internal/math';
import { computePacing } from './pacing';
import { kpiEvents } from './scoring';
import { evaluateTriggers } from './triggers';
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
      dailyTotal: plannedTotal,
      idealCumulative: 0,
      pacingRatio: 1,
      status: 'on_track',
      note: 'No pacing state: using the provided total.',
    };
  }

  // --- Classify, then run triggers, then mark starved -------------------
  const classified = classifyPortfolio(snapshots, baseCfg);
  const { recommendations: pauseRecs, starveIds } = evaluateTriggers(classified, baseCfg);
  // Fatigue is independent of pauses: it never starves, and skips ad sets a pause
  // trigger already flagged (avoid double-noise on the same ad set).
  const fatigueRecs = evaluateFatigue(classified, baseCfg, starveIds);
  const recommendations = [...pauseRecs, ...fatigueRecs];
  const starved = classified.map((s) =>
    starveIds.has(s.id) && s.status !== 'frozen' ? { ...s, status: 'starved' as const } : s,
  );

  // Abstain (D5): an established ACTIVE ad set that is spending but has ZERO KPI
  // events in the decision window has no signal to score on — hold its budget
  // (freeze) rather than let the velocity floor bleed it down cycle after cycle on
  // a measurement it can't trust. Runs AFTER triggers, so any pause/fatigue rec for
  // it is still surfaced for human review; only 'active' items abstain — a
  // trigger-starved item is a decided down-move, not an abstain. Objective-aware via
  // kpiEvents (purchases for 'purchase', leads for 'lead', …).
  const prepared = starved.map((s) => {
    if (s.status !== 'active' || s.freeze) return s;
    if (s.windows.d14.spend <= 0 || kpiEvents(s.windows.d14, baseCfg) > 0) return s;
    return { ...s, freeze: true as const, freezeReason: 'no_conversions' as const };
  });

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

  const confidence = portfolioConfidence(prepared, baseCfg);

  return { mode, pacing, reallocation, recommendations, confidence };
}
