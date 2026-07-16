// Setup advisor — what the ad sets you just selected will actually DO inside the portfolio
// you are about to create, said before you create it.
//
// Lives here, next to onboarding.ts, for the reason that file states: the dashboard, the MCP
// `optimizer_manage` tool and the Jaina optimizer tools ALL import it, so an agent creating a
// portfolio gets the same warnings a human does. Pure and dependency-free (types-only
// imports) so the browser, the Backend and the isolated Jaina package can all run it.
//
// Everything here is DETERMINISTIC. Every figure is computed from the selection; nothing is
// estimated and nothing is phrased by a model. The numbers are what the user is about to type
// into a budget field on a live ad account, so they must be exactly reproducible.
//
// The two rules that earn this module's existence:
//
//   kpi_mismatch    runCycle freezes any ad set whose kpiField differs from its portfolio's
//                   objective, and never moves its budget again. The picker CANNOT catch this
//                   — its eligibility test is objective-agnostic by design. This module is the
//                   only place in the product holding BOTH the selection and the objective, so
//                   it is the only place the collision is knowable. Observed on a live account:
//                   3 of 3 enrolled ad sets frozen on kpi_mismatch, pool = total - frozen = 0,
//                   a "working" portfolio that reallocated nothing, forever.
//
//   target_defaulted  The CPA/CPL field is labelled "(optional)". Blank does NOT mean "no
//                   target" — it means the engine's hardcoded $50 (config.ts). That default is
//                   not cosmetic: it sets the per-ad-set budget floor AND the spend at which a
//                   zero-result ad set is proposed for PAUSE. A brand with a real $250 CPL and
//                   a blank field gets every ad set that spent $51 without a lead recommended
//                   for pause. The most expensive lie in the setup form is the word "optional".

import type { AdSetSnapshot, OptimizationObjective, WindowMetrics } from './index';
import { getOptimizationMetricDefinition } from './service';

/** The engine's fallback when a portfolio stores no cpa_target
 *  (the backend optimizer config). Mirrored here so the advisor can NAME the
 *  number the user is silently opting into. Keep in step with the engine. */
export const ENGINE_DEFAULT_CPA_TARGET = 50;

export type SetupAdviceIssueCode =
  | 'no_selection'
  | 'kpi_mismatch'
  | 'target_defaulted'
  | 'no_conversions'
  | 'zero_delivery'
  | 'budget_below_current'
  | 'budget_above_current'
  | 'target_below_best'
  | 'single_adset'
  | 'spend_concentrated';

export type SetupAdviceIssue = {
  code: SetupAdviceIssueCode;
  severity: 'warn' | 'info';
  /** One sentence. Every figure in it is real. */
  message: string;
  /** The ad sets this is ABOUT — drives the repair action ("deselect these 4"). */
  adsetIds: string[];
};

export type SetupAdvice = {
  selectedCount: number;
  /** Sum of what the selected ad sets run today. Major units. */
  currentBudgetSum: number;
  spend14Sum: number;
  events14Sum: number;
  /** Spend-weighted actual cost per KPI event across the selection, in DISPLAY units. */
  blendedCost: number | null;
  costSpread: { best: number; median: number; worst: number } | null;
  suggestedDailyTotal: number | null;
  /** DISPLAY units — the value that goes straight into the target input. */
  suggestedTarget: number | null;
  /** Priority-ordered: the ones that change the outcome come first. */
  issues: SetupAdviceIssue[];
};

export type SetupAdviceInput = {
  /** The SELECTED ad sets only. */
  snapshots: AdSetSnapshot[];
  objective: OptimizationObjective;
  mode: 'efficiency' | 'balanced' | 'scale';
  /** Parsed from the form; null when blank. */
  typedDailyTotal: number | null;
  /** Parsed from the form, in DISPLAY units; null when blank. */
  typedTarget: number | null;
};

/** Round UP to a clean step. Ceil, never round: a total BELOW the current sum makes cycle 1 a
 *  delivery cut, which is exactly what budget_below_current warns about — a suggestion must
 *  never trip its own warning. */
function ceilToStep(value: number): number {
  const step = value < 500 ? 10 : value < 5000 ? 50 : 100;
  return Math.ceil(value / step) * step;
}

/** Nearest clean step. A target is a reference point the engine prices against, not a floor,
 *  so rounding to nearest is honest here. */
function roundToStep(value: number): number {
  const step = value < 20 ? 1 : value < 200 ? 5 : 10;
  return Math.round(value / step) * step;
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 1) return sorted[0];
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(fraction * (sorted.length - 1))),
  );
  return sorted[index];
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Read the KPI event count an ad set is judged on, in the portfolio's currency. */
function eventsIn(snapshot: AdSetSnapshot, kpiField: keyof WindowMetrics): number {
  return Number(snapshot.windows?.d14?.[kpiField] ?? 0);
}

function spendIn(snapshot: AdSetSnapshot): number {
  return Number(snapshot.windows?.d14?.spend ?? 0);
}

/**
 * What will happen to this selection, under this objective, at this budget and target.
 * Pure: same input, same advice, always.
 */
export function adviseSetup(input: SetupAdviceInput): SetupAdvice {
  const { snapshots, objective, mode, typedDailyTotal, typedTarget } = input;
  const metric = getOptimizationMetricDefinition(objective);
  const kpiField = metric.kpiField as keyof WindowMetrics;
  const mult = metric.denominatorMultiplier;
  const issues: SetupAdviceIssue[] = [];

  const currentBudgetSum = snapshots.reduce((sum, s) => sum + (s.currentBudget ?? 0), 0);
  const spend14Sum = snapshots.reduce((sum, s) => sum + spendIn(s), 0);
  const events14Sum = snapshots.reduce((sum, s) => sum + eventsIn(s, kpiField), 0);

  const blendedCost = events14Sum > 0 ? (spend14Sum / events14Sum) * mult : null;

  const perCosts = snapshots
    .map((s) => {
      const events = eventsIn(s, kpiField);
      return events > 0 ? (spendIn(s) / events) * mult : null;
    })
    .filter((cost): cost is number => cost !== null)
    .sort((a, b) => a - b);

  const costSpread =
    perCosts.length > 0
      ? {
          best: perCosts[0],
          median: percentile(perCosts, 0.5),
          worst: perCosts[perCosts.length - 1],
        }
      : null;

  // The optimizer REALLOCATES; it does not invent money. A total equal to what the selection
  // already runs makes cycle 1 a pure redistribution and leaves account spend unchanged. Any
  // other number is us guessing with someone else's budget.
  const suggestedDailyTotal = currentBudgetSum > 0 ? ceilToStep(currentBudgetSum) : null;

  // The blended ACTUAL, not an aspirational p25. The target is a constraint the engine prices
  // against: set it below what the account has ever achieved and every ad set reads as a
  // failure, which floods the operator with pause recommendations.
  const suggestedTarget = blendedCost !== null ? roundToStep(blendedCost) : null;

  const advice: SetupAdvice = {
    selectedCount: snapshots.length,
    currentBudgetSum,
    spend14Sum,
    events14Sum,
    blendedCost,
    costSpread,
    suggestedDailyTotal,
    suggestedTarget,
    issues,
  };

  if (snapshots.length === 0) {
    issues.push({
      code: 'no_selection',
      severity: 'warn',
      message: 'Select at least one ad set — a portfolio with nothing enrolled never runs.',
      adsetIds: [],
    });
    return advice;
  }

  // 1. kpi_mismatch — the flagship. These ad sets are frozen and never compared.
  const mismatched = snapshots.filter((s) => s.kpiField != null && s.kpiField !== kpiField);
  if (mismatched.length > 0) {
    issues.push({
      code: 'kpi_mismatch',
      severity: 'warn',
      message:
        `${mismatched.length} of your ${snapshots.length} selected ad ${plural(snapshots.length, 'set', 'sets')} ` +
        `optimize for something other than ${metric.resultLabel} — the optimizer freezes them ` +
        `(kpi_mismatch) and never moves their budget.`,
      adsetIds: mismatched.map((s) => s.id),
    });
  }

  // 2. target_defaulted — blank is not "no target", it is $50.
  if (typedTarget == null) {
    issues.push({
      code: 'target_defaulted',
      severity: 'warn',
      message:
        `${metric.targetLabel} is blank — the optimizer scores against its ` +
        `$${ENGINE_DEFAULT_CPA_TARGET} default, which sets the per-ad-set budget floor and the ` +
        `spend at which an ad set with no results is proposed for pause` +
        (suggestedTarget !== null
          ? `. Suggested: $${suggestedTarget}, the blended actual across your selection.`
          : `, and we cannot suggest one: no tracked ${metric.resultLabel} across the selection in 14 days.`),
      adsetIds: [],
    });
  }

  // 3. no_conversions — spending, zero events.
  //
  // Gated on status==='active' to mirror the engine's own gate (runCycle.ts: the abstain only
  // applies to an ESTABLISHED active ad set — one still in `learning` is not held).
  //
  // The engine does TWO different things to these, and THE TARGET IS THE LINE BETWEEN THEM:
  //   spend <= target  →  held at its current budget (the no_conversions abstain).
  //   spend >  target  →  starved, and PROPOSED FOR PAUSE (the dead-weight trigger).
  //
  // Which is the sharpest available statement of what a blank target costs: it is not a
  // preference, it is the spend at which the optimizer starts recommending you switch ad sets
  // off. Verified against the engine on a live account — an ad set that had spent $1,396 with
  // zero purchases came back `starved` with a pause recommendation, NOT as a hold.
  const effectiveTarget = typedTarget ?? ENGINE_DEFAULT_CPA_TARGET;
  const noConversions = snapshots.filter(
    (s) =>
      s.status === 'active' &&
      !s.freeze &&
      spendIn(s) > 0 &&
      eventsIn(s, kpiField) === 0 &&
      !mismatched.includes(s),
  );
  if (noConversions.length > 0) {
    const all = noConversions.length === snapshots.length;
    const pauseBound = noConversions.filter((s) => spendIn(s) > effectiveTarget);
    const heldCount = noConversions.length - pauseBound.length;
    const only = noConversions.length === 1;
    // "1 of them" reads as nonsense when there is only one; say "It" instead.
    const subject = (count: number) => (only ? 'It' : `${count} of them`);
    issues.push({
      code: 'no_conversions',
      severity: 'warn',
      message:
        `${noConversions.length} of ${snapshots.length} selected ad ${plural(snapshots.length, 'set', 'sets')} ` +
        `${plural(noConversions.length, 'is', 'are')} spending but ${plural(noConversions.length, 'has', 'have')} ` +
        `0 tracked ${metric.resultLabel} in 14 days.` +
        (pauseBound.length > 0
          ? ` ${subject(pauseBound.length)} ${plural(pauseBound.length, 'has', 'have')} already spent past the ` +
            `$${effectiveTarget} target with nothing to show, so the optimizer will propose ` +
            `${plural(pauseBound.length, 'a pause', 'pauses')}.`
          : '') +
        (heldCount > 0
          ? ` ${only ? 'It is' : `The ${plural(heldCount, 'other is', 'others are')}`} held at ` +
            `${plural(heldCount, 'its', 'their')} current budget rather than guess.`
          : '') +
        (all
          ? ' With no signal anywhere in the selection, the first cycle has nothing to rank on.'
          : ''),
      adsetIds: noConversions.map((s) => s.id),
    });
  }

  // 4. zero_delivery — nothing spent, so nothing to rank on.
  const zeroDelivery = snapshots.filter((s) => spendIn(s) === 0);
  if (zeroDelivery.length > 0) {
    issues.push({
      code: 'zero_delivery',
      severity: 'info',
      message:
        `${zeroDelivery.length} selected ad ${plural(zeroDelivery.length, 'set', 'sets')} spent nothing in 14 days — ` +
        `no signal to rank ${plural(zeroDelivery.length, 'it', 'them')} on, so ${plural(zeroDelivery.length, 'it sits', 'they sit')} near ${plural(zeroDelivery.length, 'its', 'their')} current budget.`,
      adsetIds: zeroDelivery.map((s) => s.id),
    });
  }

  // 5. budget_below_current — cycle 1 becomes a delivery CUT.
  if (
    typedDailyTotal != null &&
    currentBudgetSum > 0 &&
    typedDailyTotal < currentBudgetSum * 0.95
  ) {
    const cutPct = Math.round(((currentBudgetSum - typedDailyTotal) / currentBudgetSum) * 100);
    issues.push({
      code: 'budget_below_current',
      severity: 'warn',
      message:
        `Your daily budget ($${typedDailyTotal}) is below the $${currentBudgetSum}/day these ` +
        `${snapshots.length} ad ${plural(snapshots.length, 'set runs', 'sets run')} today — the first cycle would cut about ` +
        `${cutPct}% of their delivery.`,
      adsetIds: [],
    });
  }

  // 6. budget_above_current — the extra has to go somewhere.
  if (
    typedDailyTotal != null &&
    currentBudgetSum > 0 &&
    typedDailyTotal > currentBudgetSum * 1.25
  ) {
    const upPct = Math.round(((typedDailyTotal - currentBudgetSum) / currentBudgetSum) * 100);
    issues.push({
      code: 'budget_above_current',
      severity: 'info',
      message:
        `Your daily budget ($${typedDailyTotal}) is ${upPct}% above the $${currentBudgetSum}/day these ad sets ` +
        `run today — the optimizer pushes the extra into the best-scoring ad sets, within its per-cycle cap.` +
        (mode === 'efficiency'
          ? ' In Efficiency mode the total is a ceiling: it may deliberately underspend rather than force money onto weak inventory.'
          : ''),
      adsetIds: [],
    });
  }

  // 7. target_below_best — every ad set reads as a failure.
  if (typedTarget != null && costSpread && typedTarget < costSpread.best) {
    issues.push({
      code: 'target_below_best',
      severity: 'warn',
      message:
        `Your ${metric.targetLabel.toLowerCase()} ($${typedTarget}) is below every selected ad set's actual cost ` +
        `(best: $${Math.round(costSpread.best)}) — every one of them will read as over-target.`,
      adsetIds: [],
    });
  }

  // 8. single_adset — nothing to reallocate against.
  if (snapshots.length === 1) {
    issues.push({
      code: 'single_adset',
      severity: 'warn',
      message:
        'A portfolio of one ad set has nothing to reallocate against — the cycle can only hold it or cut it.',
      adsetIds: snapshots.map((s) => s.id),
    });
  }

  // 9. spend_concentrated — one ad set dominates the comparison.
  if (snapshots.length >= 3 && spend14Sum > 0) {
    const top = snapshots.reduce((max, s) => (spendIn(s) > spendIn(max) ? s : max), snapshots[0]);
    const share = spendIn(top) / spend14Sum;
    if (share > 0.6) {
      issues.push({
        code: 'spend_concentrated',
        severity: 'info',
        message:
          `One ad set is ${Math.round(share * 100)}% of the selection's 14-day spend — comparisons will be ` +
          `dominated by it.`,
        adsetIds: [top.id],
      });
    }
  }

  return advice;
}
