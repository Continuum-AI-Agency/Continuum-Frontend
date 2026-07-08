// ---------------------------------------------------------------------------
// BR1 — Portfolio Budget Optimization (core engine).
// Orchestrates: scoring -> effective score -> share -> raw -> constrained
// solve -> conserving budget table. Mirrors the Excel "Cycle Simulation"
// columns for the intermediate values, then replaces its non-conserving
// final step with the water-filling solver.
// ---------------------------------------------------------------------------

import type { DeepPartial, EngineConfig } from './config';
import { resolveConfig } from './config';
import { clamp, sum } from './internal/math';
import { kpiEvents, scoreAdSet } from './scoring';
import { adSetCpaInterval, shrinkScores } from './significance';
import type { SolverItem } from './solver';
import { solve } from './solver';
import type { AdSetSnapshot, ItemDiagnostics, ReallocationResult } from './types';

function isLearning(s: AdSetSnapshot): boolean {
  return s.learningPhase ?? s.status === 'learning';
}
function isFrozen(s: AdSetSnapshot): boolean {
  return s.freeze ?? s.status === 'frozen';
}
const isFlagged = (s: AdSetSnapshot): boolean => s.status === 'flagged';
const isEligible = (s: AdSetSnapshot): boolean => !isFrozen(s) && !isFlagged(s);

export function reallocate(
  snapshots: AdSetSnapshot[],
  totalBudget: number,
  override?: DeepPartial<EngineConfig>,
  priorComposites?: Record<string, number>,
): ReallocationResult {
  const cfg = resolveConfig(override);
  const notes: string[] = [];

  // Velocity caps. Default (no objective): symmetric ±velocityCapPct with the
  // learning down-cap. With a profile: asymmetric up/down, and learning keeps
  // the −8% cap as an additional floor (effective down = the smaller reduction).
  const upPct = cfg.velocityUpPct ?? cfg.velocityCapPct;
  const downBasePct = cfg.velocityDownPct ?? cfg.velocityCapPct;
  const downPctFor = (s: AdSetSnapshot): number =>
    isLearning(s) ? Math.min(downBasePct, cfg.learningReductionCapPct) : downBasePct;

  // --- 1. Score every ad set -------------------------------------------
  const scored = snapshots.map((s) => ({ s, sc: scoreAdSet(s, cfg, priorComposites?.[s.id]) }));

  // --- 1b. Shrinkage (P1) ----------------------------------------------
  // Pull data-bearing composites toward the event-weighted cohort mean so a
  // lucky/unlucky low-volume ad set doesn't swing the reallocation. Items with
  // zero events are left at 0 (handled by grace/floor/triggers, never imputed).
  if (cfg.toggles.shrinkage) {
    const withData = scored.filter((x) => kpiEvents(x.s.windows.d14, cfg) > 0);
    if (withData.length > 1) {
      const cohort = withData.map((x) => ({
        id: x.s.id,
        score: x.sc.composite,
        events: kpiEvents(x.s.windows.d14, cfg),
      }));
      const byId = new Map(shrinkScores(cohort, cfg.shrinkageK).map((r) => [r.id, r.shrunk]));
      for (const x of withData) x.sc = { ...x.sc, composite: byId.get(x.s.id) ?? x.sc.composite };
    }
  }

  // --- 2. Effective score ----------------------------------------------
  // Grace items get the average composite of ACTIVE items (Tier 3). If there
  // are no active items yet, fall back to the average of items that DO have
  // data (active + learning) so grace still participates instead of scoring 0.
  const activeComposites = scored.filter((x) => x.s.status === 'active').map((x) => x.sc.composite);
  const dataComposites = scored
    .filter((x) => x.s.status === 'active' || x.s.status === 'learning')
    .map((x) => x.sc.composite)
    .filter((c) => c > 0);
  const graceScore =
    activeComposites.length > 0
      ? sum(activeComposites) / activeComposites.length
      : dataComposites.length > 0
        ? sum(dataComposites) / dataComposites.length
        : 0;

  // --- 3. Pool & floor --------------------------------------------------
  const frozenBudget = sum(snapshots.filter(isFrozen).map((s) => s.currentBudget));
  const pool = totalBudget - frozenBudget;

  // Excel: floor uses AVERAGE over ALL rows (incl. frozen/flagged).
  const avgAllBudget =
    snapshots.length > 0 ? sum(snapshots.map((s) => s.currentBudget)) / snapshots.length : 0;
  const floor = Math.max(
    cfg.floorPortfolioPct * avgAllBudget,
    (cfg.cpaTarget * cfg.floorMinSignals) / cfg.floorWindowDays,
  );

  const effectiveScore = (x: { s: AdSetSnapshot; sc: { composite: number } }): number => {
    if (isFlagged(x.s)) return 0;
    if (x.s.status === 'starved') return 0; // eligible but driven to its floor
    if (x.s.status === 'grace') return graceScore;
    return x.sc.composite;
  };

  // --- 4. Share & raw (diagnostics, mirrors Excel) ---------------------
  const eligible = scored.filter((x) => isEligible(x.s));
  const denom = sum(eligible.map(effectiveScore));

  // --- 5. Build solver items for eligible ad sets ----------------------
  const solverItems: SolverItem[] = eligible.map((x) => ({
    id: x.s.id,
    score: effectiveScore(x),
    current: x.s.currentBudget,
    floor,
    velocityDown: x.s.currentBudget * (1 - downPctFor(x.s)),
    velocityUp: x.s.currentBudget * (1 + upPct),
  }));

  const solved = solve(solverItems, pool, cfg);
  const allocById = new Map(solved.allocations.map((a) => [a.id, a]));
  notes.push(...solved.notes);

  // --- 6. Assemble per-item diagnostics --------------------------------
  const items: ItemDiagnostics[] = scored.map((x) => {
    const s = x.s;
    const eff = effectiveScore(x);
    const share = isEligible(s) && denom > 0 ? eff / denom : 0;
    const raw = isEligible(s) ? share * pool : 0;
    const velocityCapped = isEligible(s)
      ? clamp(raw, s.currentBudget * (1 - downPctFor(s)), s.currentBudget * (1 + upPct))
      : s.currentBudget;

    let finalBudget: number;
    let lowerBound = 0;
    let upperBound = 0;
    let capBreached = false;
    let floorRelaxed = false;
    if (isFrozen(s)) {
      finalBudget = s.currentBudget;
      lowerBound = upperBound = s.currentBudget;
    } else if (isFlagged(s)) {
      finalBudget = 0;
    } else {
      const a = allocById.get(s.id)!;
      finalBudget = a.amount;
      lowerBound = a.lowerBound;
      upperBound = a.upperBound;
      capBreached = a.capBreached;
      floorRelaxed = a.floorRelaxed;
    }

    return {
      id: s.id,
      status: s.status,
      currentBudget: s.currentBudget,
      score3d: x.sc.score3d,
      score7d: x.sc.score7d,
      score14d: x.sc.score14d,
      trajectoryRatio: x.sc.trajectoryRatio,
      trajectoryState: x.sc.trajectoryState,
      weights: x.sc.weights,
      compositeScore: x.sc.composite,
      effectiveScore: eff,
      portfolioShare: share,
      rawBudget: raw,
      velocityCapped,
      floor: isFlagged(s) ? 0 : floor,
      lowerBound,
      upperBound,
      finalBudget,
      changeAbs: finalBudget - s.currentBudget,
      changePct: s.currentBudget > 0 ? (finalBudget - s.currentBudget) / s.currentBudget : 0,
      capBreached,
      floorRelaxed,
      ci: adSetCpaInterval(s, cfg),
      // Ingest-side abstain reason (undefined for eligible/manual-freeze items) so
      // the report can render "held — no conversion signal" instead of a $0 change.
      ...(s.freezeReason ? { freezeReason: s.freezeReason } : {}),
    };
  });

  const allocatedTotal = sum(items.map((i) => i.finalBudget));
  const conserved = Math.abs(allocatedTotal - totalBudget) < 1e-3 + solved.residual;

  return {
    totalBudget,
    pool,
    frozenBudget,
    items,
    allocatedTotal,
    conserved: Math.abs(allocatedTotal + solved.residual - totalBudget) < 1e-3,
    residual: solved.residual,
    feasibility: {
      sumLowerBounds: solved.sumLowerBounds,
      sumUpperBounds: solved.sumUpperBounds,
      overflow: solved.overflow,
      underflow: solved.underflow,
    },
    notes,
  };
}
