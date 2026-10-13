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
import type { SolverItem, SolverOutput } from './solver';
import { solve } from './solver';
import type {
  AdSetSnapshot,
  ItemDiagnostics,
  ReallocationRefusal,
  ReallocationResult,
} from './types';

function isLearning(s: AdSetSnapshot): boolean {
  return s.learningPhase ?? s.status === 'learning';
}
function isFrozen(s: AdSetSnapshot): boolean {
  return s.freeze ?? s.status === 'frozen';
}
const isFlagged = (s: AdSetSnapshot): boolean => s.status === 'flagged';
const isEligible = (s: AdSetSnapshot): boolean => !isFrozen(s) && !isFlagged(s);

/** `frozenScale` is the factor a frozen ad set's budget moves by. A frozen ad set is one the
 *  engine will not judge, not one the plan stops applying to: on a pacing cycle the caller
 *  passes the plan's portfolio-wide step (planned total ÷ live total), so a new or
 *  signal-less ad set moves with the month like every other. Default 1: held as it is. */
export function reallocate(
  snapshots: AdSetSnapshot[],
  totalBudget: number,
  override?: DeepPartial<EngineConfig>,
  priorComposites?: Record<string, number>,
  frozenScale = 1,
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
  const frozenTarget = (s: AdSetSnapshot): number => s.currentBudget * frozenScale;
  const frozenBudget = sum(snapshots.filter(isFrozen).map(frozenTarget));
  const pool = totalBudget - frozenBudget;

  // The floor is the guaranteed minimum for an ad set we are ALLOCATING, so it averages over
  // the ad sets it applies to — the eligible ones. The Excel sheet this engine mirrors
  // averaged over ALL rows including frozen/flagged; that is deliberately no longer true, and
  // the reason is arithmetic. A held ad set contributes its budget to the numerator only if it
  // has one: a zero-budget boosted post contributes 0 to the sum and 1 to the count, which is
  // pure dilution. On the 64-ad-set account that exposed this, four such rows pulled the
  // average from 170.33 to 159.69 and so cut every legitimate ad set's floor from $25.55 to
  // $23.95 — a real reduction in everyone's guaranteed minimum caused entirely by rows the
  // engine does not fund. Frozen items are pinned at their current budget and flagged items go
  // to 0 (see below); neither receives a floor, so neither should set one.
  const eligibleBudgets = snapshots.filter(isEligible).map((s) => s.currentBudget);
  const avgEligibleBudget =
    eligibleBudgets.length > 0 ? sum(eligibleBudgets) / eligibleBudgets.length : 0;
  const floor = Math.max(
    cfg.floorPortfolioPct * avgEligibleBudget,
    (cfg.cpaTarget * cfg.floorMinSignals) / cfg.floorWindowDays,
  );

  const effectiveScore = (x: { s: AdSetSnapshot; sc: { composite: number } }): number => {
    if (isFlagged(x.s)) return 0;
    if (x.s.status === 'starved') return 0; // eligible but driven to its floor
    if (x.s.status === 'grace') return graceScore;
    return x.sc.composite;
  };

  // --- 4. Allocation weight: efficiency × the budget the ad set holds today ----------
  // The solver targets `pool × weight ÷ Σweight`. With the score alone as the weight, an ad
  // set's target ignored what it has: when the cheapest ad sets already held most of the
  // money (what Meta does with its winners), their score share came out below their budget
  // and the engine cut them to fund pricier ones — Easy Fit's WhatsApp portfolio cut its
  // cheapest ad set 8 % and raised a 45 %-dearer one 25 % (2026-10-13). Weighting by
  // score × current budget makes each target `current × (score ÷ budget-weighted mean score)`,
  // rescaled to the pool: better than the portfolio grows, worse shrinks, never inverted. With
  // equal budgets it is exactly the score share it replaces. An ad set holding nothing today
  // is anchored on the eligible average so it can still be funded.
  const anchorBudget = (s: AdSetSnapshot): number =>
    s.currentBudget > 0 ? s.currentBudget : avgEligibleBudget > 0 ? avgEligibleBudget : 1;
  const allocationWeight = (x: { s: AdSetSnapshot; sc: { composite: number } }): number =>
    effectiveScore(x) * anchorBudget(x.s);

  // --- 4b. Share & raw (diagnostics, mirrors Excel) ---------------------
  const eligible = scored.filter((x) => isEligible(x.s));
  const denom = sum(eligible.map(allocationWeight));

  // --- 5. Build solver items for eligible ad sets ----------------------
  const solverItems: SolverItem[] = eligible.map((x) => ({
    id: x.s.id,
    score: allocationWeight(x),
    current: x.s.currentBudget,
    floor,
    velocityDown: x.s.currentBudget * (1 - downPctFor(x.s)),
    // A creative-drag ad set keeps its budget but may not GROW it: raising an ad set whose
    // money is landing on a creative we already judged funds the loser, not the ad set.
    // Down-moves are untouched — this withholds a raise, it does not starve.
    velocityUp: x.s.noRaise ? x.s.currentBudget : x.s.currentBudget * (1 + upPct),
  }));

  // A negative pool is not a smaller allocation, it is no allocation: frozen ad sets alone
  // hold more than the total, and nothing the solver may move can bring the sum back under
  // it. Solving anyway scaled floors by pool/0 and reported the result as conserved. Refuse
  // by name instead — every budget holds, and the result says the total is not met.
  const refusal: ReallocationRefusal | undefined =
    pool < -POOL_EPS ? { reason: 'frozen_above_total', frozenBudget, totalBudget } : undefined;
  const solved = refusal ? holdEverything(solverItems) : solve(solverItems, pool, cfg);
  if (refusal) {
    notes.push(
      `refused: frozen ad sets hold ${frozenBudget.toFixed(2)}, above the ${totalBudget.toFixed(2)} total — no budget moved; lower them by hand or raise the total`,
    );
  }
  const allocById = new Map(solved.allocations.map((a) => [a.id, a]));
  notes.push(...solved.notes);

  // --- 6. Assemble per-item diagnostics --------------------------------
  const items: ItemDiagnostics[] = scored.map((x) => {
    const s = x.s;
    const eff = effectiveScore(x);
    const share = isEligible(s) && denom > 0 ? allocationWeight(x) / denom : 0;
    const raw = isEligible(s) ? share * pool : 0;
    const velocityCapped = isEligible(s)
      ? clamp(
          raw,
          s.currentBudget * (1 - downPctFor(s)),
          s.noRaise ? s.currentBudget : s.currentBudget * (1 + upPct),
        )
      : s.currentBudget;

    let finalBudget: number;
    let lowerBound = 0;
    let upperBound = 0;
    let capBreached = false;
    let floorRelaxed = false;
    if (isFrozen(s)) {
      finalBudget = frozenTarget(s);
      lowerBound = upperBound = finalBudget;
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

  return {
    totalBudget,
    pool,
    frozenBudget,
    items,
    allocatedTotal,
    conserved: !refusal && Math.abs(allocatedTotal + solved.residual - totalBudget) < 1e-3,
    residual: solved.residual,
    feasibility: {
      sumLowerBounds: solved.sumLowerBounds,
      sumUpperBounds: solved.sumUpperBounds,
      overflow: solved.overflow,
      underflow: solved.underflow,
    },
    notes,
    ...(refusal ? { refusal } : {}),
  };
}

const POOL_EPS = 1e-6;

/** The refusal's allocation: every eligible ad set keeps exactly what it has. */
function holdEverything(items: SolverItem[]): SolverOutput {
  const allocations = items.map((it) => ({
    id: it.id,
    amount: it.current,
    lowerBound: it.current,
    upperBound: it.current,
    capBreached: false,
    floorRelaxed: false,
  }));
  const held = sum(allocations.map((a) => a.amount));
  return {
    allocations,
    allocatedTotal: held,
    residual: 0,
    sumLowerBounds: held,
    sumUpperBounds: held,
    overflow: false,
    underflow: false,
    notes: [],
  };
}
