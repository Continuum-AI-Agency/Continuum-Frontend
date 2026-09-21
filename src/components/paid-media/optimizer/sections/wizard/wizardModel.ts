// The portfolio wizard's draft and the pure functions around it: what a suggestion seeds,
// what each step still needs, and the ONE place the draft becomes the create request.
//
// Kept DOM-free so the conversions the wizard performs (target per result → stored target,
// typed guardrails → minor units and fractions, a budget typed per day / per month / for the
// flight → period_budget and daily_total, a growth plan typed in percent and days) are
// testable without React, and cannot disagree with what the Manage panel writes for the
// same fields (portfolioFields shares the same contracts helpers).

import type {
  ApplyMode,
  BudgetGranularity,
  OptimizationModeDto,
  OptimizationObjective,
  PortfolioConfig,
  PortfolioSuggestion,
  TargetMetric,
} from '@continuum/contracts';
import {
  allowedTargetMetrics,
  budgetFieldsFor,
  flightDays,
  getOptimizationMetricDefinition,
  toMinorUnits,
} from '@continuum/contracts';
import {
  buildConversionDescriptor,
  type ConversionDescriptorDraft,
  EMPTY_DESCRIPTOR_DRAFT,
} from './conversionDescriptor';

export const WIZARD_STEPS = [
  { id: 'start', label: 'Start', hint: 'From a suggestion or from scratch' },
  { id: 'assets', label: 'Assets', hint: 'Ad sets or whole campaigns' },
  { id: 'goal', label: 'Goal', hint: 'Objective, target and mode' },
  { id: 'plan', label: 'Plan & autonomy', hint: 'Flight, budget and who applies' },
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number]['id'];

export type AssetMode = 'adset' | 'campaign';

export type WizardDraft = {
  source: 'suggestion' | 'scratch' | null;
  suggestionName: string | null;
  name: string;
  objective: OptimizationObjective;
  /**
   * The conversion being bought, when the objective is 'custom'. Ignored for every other
   * objective — and captured HERE rather than left to the Manage panel, because a portfolio
   * created against an event nobody named is already reporting "conversions" by the time
   * anyone opens it.
   */
  conversion: ConversionDescriptorDraft;
  /** Null = the objective's own metric. */
  targetMetric: TargetMetric | null;
  mode: OptimizationModeDto;
  /** Typed target, in the metric's DISPLAY unit (CPM for awareness). Blank = engine default. */
  target: string;
  assetMode: AssetMode;
  adsetIds: string[];
  /** Whole campaigns chosen in campaign mode (their ad sets also land in adsetIds). */
  campaignIds: string[];
  /** Typed daily total; blank = match the selection's live sum. */
  dailyTotal: string;
  flightFrom: string | null;
  flightTo: string | null;
  /** Typed flight budget in `budgetGranularity` units; blank = unpaced. */
  budgetAmount: string;
  budgetGranularity: BudgetGranularity;
  applyMode: ApplyMode;
  /** Typed in MAJOR units; converted to Meta minor units on create. */
  maxDailyApply: string;
  /** Typed as a whole percent. */
  maxChangePct: string;
  /** Scale plan: whole percent, days, major units. */
  scaleGrowthPct: string;
  scaleCadenceDays: string;
  scaleMaxDaily: string;
};

export const MODE_COPY: Record<OptimizationModeDto, { title: string; body: string }> = {
  efficiency: {
    title: 'Efficiency',
    body: 'Spends up to the plan, never past it. Cuts what costs too much rather than forcing spend.',
  },
  balanced: {
    title: 'Balanced',
    body: 'Keeps the total steady and moves money from the ad sets paying most per result to the ones paying least.',
  },
  scale: {
    title: 'Scale',
    body: 'Grows the budget on a schedule while the portfolio beats its target, then keeps reallocating.',
  },
};

export const DEFAULT_MAX_CHANGE_PCT = '20';
export const DEFAULT_SCALE_GROWTH_PCT = '10';
export const DEFAULT_SCALE_CADENCE_DAYS = '7';

export function emptyDraft(): WizardDraft {
  return {
    source: null,
    suggestionName: null,
    name: '',
    objective: 'purchase',
    conversion: EMPTY_DESCRIPTOR_DRAFT,
    targetMetric: null,
    mode: 'balanced',
    target: '',
    assetMode: 'adset',
    adsetIds: [],
    campaignIds: [],
    dailyTotal: '',
    flightFrom: null,
    flightTo: null,
    budgetAmount: '',
    budgetGranularity: 'daily',
    applyMode: 'recommend',
    maxDailyApply: '',
    maxChangePct: '',
    scaleGrowthPct: '',
    scaleCadenceDays: '',
    scaleMaxDaily: '',
  };
}

function num(value: string): number | null {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** A suggestion seeds the draft. The target arrives priced per result and is shown in the
 *  metric's display unit; the daily total is the group's live sum (a fact, not a choice). */
export function draftFromSuggestion(suggestion: PortfolioSuggestion): WizardDraft {
  const metric = getOptimizationMetricDefinition(suggestion.objective);
  const target =
    suggestion.cpa_target != null && suggestion.cpa_target > 0
      ? String(Number((suggestion.cpa_target * metric.denominatorMultiplier).toPrecision(6)))
      : '';
  return {
    ...emptyDraft(),
    source: 'suggestion',
    suggestionName: suggestion.name,
    name: suggestion.name,
    objective: suggestion.objective,
    mode: suggestion.mode,
    target,
    assetMode: suggestion.level === 'campaign' ? 'campaign' : 'adset',
    adsetIds: suggestion.level === 'campaign' ? [] : [...suggestion.adset_ids],
    campaignIds: suggestion.level === 'campaign' ? [...suggestion.adset_ids] : [],
    dailyTotal: '',
  };
}

/** The objective's own metric unless a still-allowed alternative was chosen. */
export function effectiveTargetMetric(draft: Pick<WizardDraft, 'objective' | 'targetMetric'>) {
  const allowed = allowedTargetMetrics(draft.objective);
  return draft.targetMetric && allowed.includes(draft.targetMetric)
    ? draft.targetMetric
    : draft.objective;
}

export type StepContext = {
  /** Live sum of the selected ad sets' daily budgets. */
  selectedBudgetSum: number;
  /** Selected ad sets held by a portfolio the operator cannot release. */
  blockedCount: number;
};

/** What still blocks leaving a step, in the operator's words. Empty = the step is complete. */
export function stepIssues(draft: WizardDraft, step: WizardStep, ctx: StepContext): string[] {
  const issues: string[] = [];
  switch (step) {
    case 'start':
      if (draft.source == null) issues.push('Pick a suggestion or start from scratch.');
      break;
    case 'assets':
      if (draft.adsetIds.length === 0) issues.push('Select at least one ad set.');
      if (ctx.blockedCount > 0) {
        issues.push(
          `${ctx.blockedCount} selected ${ctx.blockedCount === 1 ? 'ad set is' : 'ad sets are'} held by a portfolio you cannot edit.`,
        );
      }
      break;
    case 'goal': {
      if (draft.objective === 'custom') {
        const built = buildConversionDescriptor(draft.conversion);
        if ('error' in built) issues.push(built.error);
      }
      if (draft.mode === 'scale') {
        const growth = num(draft.scaleGrowthPct);
        const cadence = num(draft.scaleCadenceDays);
        if (growth == null || cadence == null) {
          issues.push('Scale mode needs how much to grow by and how often.');
        } else if (growth > 100) {
          issues.push('Grow by at most 100% per step.');
        }
      }
      break;
    }
    case 'plan': {
      if (draft.name.trim().length === 0) issues.push('Give the portfolio a name.');
      const daily =
        num(draft.dailyTotal) ?? (ctx.selectedBudgetSum > 0 ? ctx.selectedBudgetSum : null);
      if (daily == null)
        issues.push('Set a daily budget — the selection has no live budget to match.');
      const hasFlight = Boolean(draft.flightFrom && draft.flightTo);
      const amount = num(draft.budgetAmount);
      if (amount != null && !hasFlight && draft.budgetGranularity !== 'total') {
        // A per-day figure without a flight is just a daily total; only monthly is ambiguous.
        if (draft.budgetGranularity === 'monthly')
          issues.push('A monthly budget needs a flight window to pace over.');
      }
      if (hasFlight && amount == null) issues.push('Give the flight a budget, or clear the dates.');
      if (draft.applyMode === 'autopilot') {
        if (num(draft.maxDailyApply) == null) issues.push('Autopilot needs a daily spend ceiling.');
        if (num(draft.maxChangePct) == null) issues.push('Autopilot needs a per-cycle change cap.');
      }
      break;
    }
  }
  return issues;
}

export type CreateContext = {
  currency: string | null | undefined;
  selectedBudgetSum: number;
  level: AssetMode;
};

/** The draft as the create request's config. Every conversion happens here, once. */
export function buildCreateConfig(draft: WizardDraft, ctx: CreateContext): PortfolioConfig {
  const targetMetric = effectiveTargetMetric(draft);
  const metric = getOptimizationMetricDefinition(targetMetric);
  const typedDaily = num(draft.dailyTotal);
  const hasFlight = Boolean(draft.flightFrom && draft.flightTo);
  const amount = num(draft.budgetAmount);
  const plan =
    amount != null
      ? budgetFieldsFor({
          amount,
          granularity: draft.budgetGranularity,
          period_start: draft.flightFrom,
          period_end: draft.flightTo,
        })
      : { daily_total: null, period_budget: null };
  // The daily total: typed, else implied by the plan, else the selection's live sum.
  const dailyTotal = typedDaily ?? plan.daily_total ?? ctx.selectedBudgetSum;
  const target = num(draft.target);
  const growth = num(draft.scaleGrowthPct);
  const cadence = num(draft.scaleCadenceDays);
  const ceiling = num(draft.scaleMaxDaily);
  const maxDaily = num(draft.maxDailyApply);
  const maxPct = num(draft.maxChangePct);

  const conversion =
    draft.objective === 'custom' ? buildConversionDescriptor(draft.conversion) : null;

  return {
    name: draft.name.trim(),
    objective: draft.objective,
    // Only ever sent with a 'custom' objective, and only once it validates — `stepIssues`
    // refuses the step otherwise, so an invalid one cannot reach here.
    ...(conversion && 'descriptor' in conversion
      ? { conversion_descriptor: conversion.descriptor }
      : {}),
    level: ctx.level === 'campaign' ? 'adset' : 'adset',
    mode: draft.mode,
    apply_mode: draft.applyMode,
    daily_total: Math.round(dailyTotal * 100) / 100,
    // A typed daily total or a plan is a deliberate target; matching the selection is not.
    budget_source: typedDaily != null || plan.daily_total != null ? 'fixed' : 'observed',
    lookback_window: 'd14',
    budget_granularity: draft.budgetGranularity,
    ...(hasFlight && plan.period_budget != null
      ? {
          period_start: draft.flightFrom as string,
          period_end: draft.flightTo as string,
          period_budget: Math.round(plan.period_budget * 100) / 100,
        }
      : {}),
    ...(target != null ? { cpa_target: target / metric.denominatorMultiplier } : {}),
    ...(targetMetric !== draft.objective ? { target_metric: targetMetric } : {}),
    ...(draft.mode === 'scale' && growth != null && cadence != null
      ? {
          scale_growth_pct: Math.min(1, growth / 100),
          scale_cadence_days: Math.round(cadence),
          ...(ceiling != null ? { scale_max_daily: ceiling } : {}),
        }
      : {}),
    ...(draft.applyMode === 'autopilot' && maxDaily != null && maxPct != null
      ? {
          max_daily_apply_minor: toMinorUnits(maxDaily, ctx.currency),
          max_change_pct_per_cycle: maxPct / 100,
        }
      : {}),
  };
}

/** The plan step's live readout: what the typed figures mean for the flight. */
export function planReadout(draft: WizardDraft): {
  days: number | null;
  perDay: number | null;
  total: number | null;
} {
  const days = flightDays(draft.flightFrom, draft.flightTo);
  const amount = num(draft.budgetAmount);
  if (amount == null) return { days, perDay: null, total: null };
  const fields = budgetFieldsFor({
    amount,
    granularity: draft.budgetGranularity,
    period_start: draft.flightFrom,
    period_end: draft.flightTo,
  });
  return { days, perDay: fields.daily_total, total: fields.period_budget };
}

/** Suggested autopilot guardrails from the daily total the portfolio will run on. */
export function suggestedGuardrails(dailyTotal: number): {
  maxDailyApply: string;
  maxChangePct: string;
} {
  return {
    maxDailyApply: dailyTotal > 0 ? String(Math.round(dailyTotal * 1.5)) : '',
    maxChangePct: DEFAULT_MAX_CHANGE_PCT,
  };
}
