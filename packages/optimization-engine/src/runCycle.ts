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
import { evaluateCreative } from './creative';
import { reallocate } from './engine';
import { evaluateFatigue } from './fatigue';
import { sum } from './internal/math';
import { computePacing } from './pacing';
import { evaluateRules } from './rules/evaluate';
import type { AlreadyFlagged, RuleActionKind, RuleDefinition, RuleEvaluation } from './rules/types';
import { kpiEvents } from './scoring';
import { evaluateTriggers } from './triggers';
import type {
  AdSetSnapshot,
  CycleResult,
  OptimizationMode,
  OptimizationObjective,
  PacingResult,
  PacingState,
  Recommendation,
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
  /** Data-driven rules to evaluate alongside the built-in triggers (see src/rules/).
   *  Empty/absent => the rules layer is inert and the cycle behaves exactly as
   *  it did without it — the current production posture. */
  rules?: RuleDefinition[];
  /** Cutover flag: skip the built-in trigger/fatigue/creative stages and rely on
   *  `rules` alone. The seeded parity rules reproduce the built-ins exactly
   *  (tests/rules-parity.test.ts); default false. */
  suppressBuiltinTriggers?: boolean;
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

  // --- One currency per pool --------------------------------------------
  // The reallocation ranks ad sets on events-per-dollar. That comparison is only
  // meaningful when the "event" is the same thing for every member: a $39 messaging
  // conversation and a $256 lead are not interchangeable, and an ad set buying the
  // cheaper event wins on "efficiency" by definition and drains the pool.
  //
  // So an ad set whose DECLARED goal resolves to a different currency than the portfolio
  // prices is frozen, not compared. This runs BEFORE the triggers on purpose — unlike the
  // no_conversions abstain below, where surfacing a pause rec still helps a human. Here we
  // cannot judge the ad set at all in this portfolio's currency, and a confident pause
  // recommendation computed in the wrong one is worse than silence.
  //
  // The fix is a portfolio that prices what the ad set actually buys; the onboarding
  // suggest step proposes one portfolio per currency for exactly this reason.
  const currencyChecked = snapshots.map((s) => {
    if (!baseCfg.kpiField || !s.kpiField || s.freeze) return s;
    if (s.kpiField === baseCfg.kpiField) return s;
    return { ...s, freeze: true as const, freezeReason: 'kpi_mismatch' as const };
  });

  // --- Two things the optimizer has no business funding ------------------
  // Both run HERE, beside the currency check and before the triggers, because both mean
  // "this ad set is not a member of the pool" rather than "this ad set is doing badly".
  // A recommendation about a non-member is a verdict we have no standing to reach, so —
  // exactly as with kpi_mismatch — silence beats confidence.
  //
  // The live case that forced this: four active "Instagram Post" boosted posts on a 64-ad-set
  // account, each with currentBudget 0, spend 0, and (three of them) no declared goal. They
  // were not frozen at ingest, so they entered the pool, and a zero-budget item's solver box
  // collapses onto the floor (lower = upper = floor). The engine handed them $23.95/day each
  // on no evidence whatsoever.
  const eligibilityChecked = currencyChecked.map((s) => {
    if (s.freeze) return s;
    // No budget of its own. The reallocation moves money BETWEEN ad sets; there is nothing
    // here to move, and nothing that explains where the money lives instead (a CBO/lifetime
    // ad set arrives already frozen `unsupported_budget` from ingest and is skipped above).
    if (s.currentBudget <= 0) {
      return { ...s, freeze: true as const, freezeReason: 'no_own_budget' as const };
    }
    // Declares nothing, and bought none of what this pool prices. Only meaningful once the
    // portfolio itself declares a currency — without cfg.kpiField there is no currency for
    // the ad set to have failed to declare. An undeclared ad set that DID produce the
    // portfolio's events keeps being scored: the events establish what the declaration
    // omitted (see the older-sync fallback in currency.test.ts).
    const declaresNothing = !s.optimization_goal && !s.kpiField;
    if (baseCfg.kpiField && declaresNothing && kpiEvents(s.windows.d14, baseCfg) <= 0) {
      return { ...s, freeze: true as const, freezeReason: 'no_declared_objective' as const };
    }
    return s;
  });

  // --- Classify, then run triggers, then mark starved -------------------
  const classified = classifyPortfolio(eligibilityChecked, baseCfg);

  let recommendations: Recommendation[] = [];
  let starveIds = new Set<string>();
  let noRaiseIds: ReadonlySet<string> = new Set<string>();
  const alreadyFlagged: AlreadyFlagged = new Map();

  // `suppressBuiltinTriggers` skips the three built-in stages entirely — the
  // future cutover posture where the seeded parity rules are the only trigger
  // source (their equivalence is proven by tests/rules-parity.test.ts).
  if (!opts.suppressBuiltinTriggers) {
    const triggers = evaluateTriggers(classified, baseCfg);
    starveIds = triggers.starveIds;
    // Fatigue is independent of pauses: it never starves, and skips ad sets a pause
    // trigger already flagged (avoid double-noise on the same ad set).
    const fatigueRecs = evaluateFatigue(classified, baseCfg, starveIds);

    // Stage C — the creative triggers. An ad set is a budget and an audience; the thing that
    // works or doesn't is the creative inside it. Two creatives in the SAME ad set (same
    // audience, same budget) measured 2.22x apart on cost per result — a gap no budget
    // decision can close, because the money was already in the right ad set and on the wrong
    // ad. Skips ad sets a pause trigger already condemned: no point proposing a creative
    // experiment inside a set we are about to shut off.
    const creative = evaluateCreative(classified, baseCfg, starveIds);
    noRaiseIds = creative.noRaiseIds;
    recommendations = [...triggers.recommendations, ...fatigueRecs, ...creative.recommendations];

    // Tell the rules layer what the built-ins already flagged: built-ins win the
    // per-(adSetId, kind) dedup, and a built-in pause/starve suppresses rule
    // fatigue-kind findings on the same ad set (evaluate.ts precedence contract).
    const flag = (adSetId: string, kind: RuleActionKind) => {
      const kinds = alreadyFlagged.get(adSetId) ?? new Set<RuleActionKind>();
      kinds.add(kind);
      alreadyFlagged.set(adSetId, kinds);
    };
    for (const r of recommendations) {
      if (r.kind === 'pause' || r.kind === 'creative_refresh' || r.kind === 'audience_expand') {
        flag(r.adSetId, r.kind);
      }
    }
    for (const id of starveIds) flag(id, 'starve');
  }

  // --- Data-driven rules (opt-in) ----------------------------------------
  // Evaluated AFTER the built-in stages (so their output dedupes against the
  // built-ins) but BEFORE the starve/freeze mapping and the solver, so a
  // rule-driven starve or freeze shapes this cycle's reallocation exactly like
  // a built-in one. No rules => no evaluations, behavior identical to before.
  let ruleEvaluations: RuleEvaluation[] = [];
  let ruleFreezeIds: ReadonlySet<string> = new Set<string>();
  if (opts.rules && opts.rules.length > 0) {
    const ruleOut = evaluateRules(classified, opts.rules, baseCfg, alreadyFlagged);
    ruleEvaluations = ruleOut.evaluations;
    ruleFreezeIds = ruleOut.freezeIds;
    for (const id of ruleOut.starveIds) starveIds.add(id);
    recommendations = [
      ...recommendations,
      ...ruleOut.findings.map(
        (f): Recommendation => ({
          adSetId: f.adSetId,
          kind: f.kind,
          trigger: f.trigger,
          severity: f.severity,
          reason: f.reason,
          needsApproval: true,
          ruleId: f.ruleId,
        }),
      ),
    ];
  }

  const starved = classified.map((s) => {
    let next: AdSetSnapshot =
      starveIds.has(s.id) && s.status !== 'frozen' ? { ...s, status: 'starved' as const } : s;
    // Withhold the RAISE (not the budget) from an ad set whose spend sits on a creative we
    // have already judged. Implemented as an upper bound of currentBudget in the solver, so
    // conservation still holds and the headroom flows to ad sets that can use it.
    if (noRaiseIds.has(next.id)) next = { ...next, noRaise: true as const };
    // A rule freeze is the abstain lever as data: hold the budget at its current
    // value. No freezeReason — that union describes ingest-side abstains; a rule
    // freeze reads like an operator hold, and the evaluation row carries the why.
    if (ruleFreezeIds.has(next.id) && !next.freeze) next = { ...next, freeze: true as const };
    return next;
  });

  // Abstain (D5): an established ACTIVE ad set that is spending but has ZERO KPI
  // events in the decision window has no signal to score on — hold its budget
  // (freeze) rather than let the velocity floor bleed it down cycle after cycle on
  // a measurement it can't trust. Runs AFTER triggers, so any pause/fatigue rec for
  // it is still surfaced for human review; only 'active' items abstain — a
  // trigger-starved item is a decided down-move, not an abstain.
  //
  // This now means what it says. Before the currency work above, an ad set buying an
  // event the engine had no field for (messaging conversations, thruplays, engagement)
  // counted ZERO events no matter how many it actually produced, and landed here — so
  // "no conversions" was reported about ad sets that were converting fine, and the ones
  // doing most of an account's work were the ones held. A missing measurement is not a
  // measurement of zero. Mismatched currencies are now frozen as `kpi_mismatch` above,
  // which leaves this abstain to mean only what it was meant to: we counted the right
  // event, and there were none.
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

  return { mode, pacing, reallocation, recommendations, confidence, ruleEvaluations };
}
