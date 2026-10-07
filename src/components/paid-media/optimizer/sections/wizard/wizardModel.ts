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
  PlatformId,
  PortfolioConfig,
  PortfolioSuggestion,
  SuggestionMember,
  TargetMetric,
} from '@continuum/contracts';
import {
  allowedTargetMetrics,
  budgetFieldsFor,
  flightDays,
  getOptimizationMetricDefinition,
  toMinorUnits,
} from '@continuum/contracts';
import { PLATFORM_NAMES } from '../platforms/platformTabsModel';
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
  /**
   * The members on other platforms a cross-platform suggestion proposed ("Leads // All
   * platforms"), as it proposed them — the Assets step lists every one, ticked or not.
   * Empty for a Meta-only suggestion and for a portfolio built from scratch.
   */
  proposedMembers: SuggestionMember[];
  /** Which of `proposedMembers` are selected, by memberKey. All of them, until unticked. */
  memberKeys: string[];
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
    proposedMembers: [],
    memberKeys: [],
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
    // Meta members are adset_ids above; the other platforms' are pre-selected here.
    proposedMembers: otherPlatformMembers(suggestion),
    memberKeys: otherPlatformMembers(suggestion).map(memberKey),
    dailyTotal: '',
  };
}

/** One member's identity across platforms: the same id can exist on two of them. */
export function memberKey(member: Pick<SuggestionMember, 'platform' | 'account_id' | 'entity_id'>) {
  return `${member.platform}:${member.account_id}:${member.entity_id}`;
}

/** A suggestion's members that live outside Meta. */
export function otherPlatformMembers(suggestion: PortfolioSuggestion): SuggestionMember[] {
  return (suggestion.members ?? []).filter((member) => member.platform !== 'meta');
}

/** The proposed members still ticked, in the order the suggestion gave them. */
export function selectedMembers(
  draft: Pick<WizardDraft, 'proposedMembers' | 'memberKeys'>,
): SuggestionMember[] {
  const keys = new Set(draft.memberKeys);
  return draft.proposedMembers.filter((member) => keys.has(memberKey(member)));
}

/** True when a Meta ad set or campaign is selected — what decides which create the wizard calls. */
export function hasMetaSelection(draft: Pick<WizardDraft, 'adsetIds' | 'campaignIds'>): boolean {
  return draft.adsetIds.length > 0 || draft.campaignIds.length > 0;
}

/** The members as optimizer_add_portfolio_members takes them: the neutral level (a Google
 *  campaign is a campaign, a Meta-shaped 'adset' is a group) and the name the person saw. */
export function memberPayload(members: readonly SuggestionMember[]): {
  platform: PlatformId;
  account_id: string;
  entity_id: string;
  level: 'campaign' | 'group';
  name?: string;
}[] {
  return members.map((member) => ({
    platform: member.platform,
    account_id: member.account_id,
    entity_id: member.entity_id,
    level: member.level === 'campaign' ? 'campaign' : 'group',
    ...(member.name?.trim() ? { name: member.name.trim() } : {}),
  }));
}

/** The account a portfolio with no Meta ad set is hosted on: the first ticked member's.
 *  Null whenever Meta is selected — that portfolio is hosted on the Meta account as always. */
export function platformHost(
  draft: Pick<WizardDraft, 'adsetIds' | 'campaignIds' | 'proposedMembers' | 'memberKeys'>,
): { platform: PlatformId; account_id: string } | null {
  if (hasMetaSelection(draft)) return null;
  const first = selectedMembers(draft)[0];
  return first ? { platform: first.platform, account_id: first.account_id } : null;
}

function counted(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** What the portfolio will hold, per platform, in each platform's own unit. */
export function selectionByPlatform(
  draft: Pick<
    WizardDraft,
    'adsetIds' | 'campaignIds' | 'assetMode' | 'proposedMembers' | 'memberKeys'
  >,
): { platform: PlatformId; label: string }[] {
  const out: { platform: PlatformId; label: string }[] = [];
  if (draft.campaignIds.length > 0) {
    out.push({
      platform: 'meta',
      label: `${counted(draft.campaignIds.length, 'campaign', 'campaigns')} · ${counted(draft.adsetIds.length, 'ad set', 'ad sets')}`,
    });
  } else if (draft.adsetIds.length > 0) {
    out.push({ platform: 'meta', label: counted(draft.adsetIds.length, 'ad set', 'ad sets') });
  }
  const counts = new Map<PlatformId, number>();
  for (const member of selectedMembers(draft)) {
    counts.set(member.platform, (counts.get(member.platform) ?? 0) + 1);
  }
  for (const [platform, count] of counts) {
    out.push({ platform, label: counted(count, 'campaign', 'campaigns') });
  }
  return out;
}

/** The Create button: the Meta ad sets as before, plus each other platform's campaigns. */
export function enrollLabel(
  draft: Pick<WizardDraft, 'adsetIds' | 'campaignIds' | 'proposedMembers' | 'memberKeys'>,
): string {
  const parts: string[] = [];
  if (draft.adsetIds.length > 0 || draft.proposedMembers.length === 0) {
    parts.push(counted(draft.adsetIds.length, 'ad set', 'ad sets'));
  }
  const counts = new Map<PlatformId, number>();
  for (const member of selectedMembers(draft)) {
    counts.set(member.platform, (counts.get(member.platform) ?? 0) + 1);
  }
  for (const [platform, count] of counts) {
    parts.push(`${count} ${PLATFORM_NAMES[platform]} ${count === 1 ? 'campaign' : 'campaigns'}`);
  }
  return `Create & enroll ${parts.join(' + ')}`;
}

/** `proposedMembers` grouped by platform account, in the order the suggestion gave them. */
export function membersByAccount(members: readonly SuggestionMember[]): {
  platform: PlatformId;
  accountId: string;
  members: SuggestionMember[];
}[] {
  const groups: { platform: PlatformId; accountId: string; members: SuggestionMember[] }[] = [];
  for (const member of members) {
    const group = groups.find(
      (entry) => entry.platform === member.platform && entry.accountId === member.account_id,
    );
    if (group) group.members.push(member);
    else
      groups.push({ platform: member.platform, accountId: member.account_id, members: [member] });
  }
  return groups;
}

/** What a cross-platform suggestion card counts per platform ("Meta · 9 ad sets"), or null for
 *  a Meta-only suggestion — whose card is unchanged. */
export function suggestionPlatformCounts(
  suggestion: PortfolioSuggestion,
): { platform: PlatformId; count: number; label: string }[] | null {
  if (!suggestion.by_platform || suggestion.by_platform.length === 0) return null;
  const counts = new Map<PlatformId, number>();
  for (const entry of suggestion.by_platform) {
    counts.set(entry.platform, (counts.get(entry.platform) ?? 0) + entry.members);
  }
  return [...counts.entries()].map(([platform, count]) => {
    const adsets = platform === 'meta' && suggestion.level !== 'campaign';
    const noun = adsets
      ? count === 1
        ? 'ad set'
        : 'ad sets'
      : count === 1
        ? 'campaign'
        : 'campaigns';
    return { platform, count, label: `${count} ${noun}` };
  });
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
      // A cross-platform suggestion may become a portfolio with no Meta ad set at all.
      if (draft.proposedMembers.length === 0) {
        if (draft.adsetIds.length === 0) issues.push('Select at least one ad set.');
      } else if (draft.adsetIds.length === 0 && selectedMembers(draft).length === 0) {
        issues.push('Select at least one ad set or campaign.');
      }
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
      if (draft.applyMode === 'autopilot' && platformHost(draft) != null) {
        issues.push(
          'Autopilot writes only to Meta: a portfolio with no Meta ad set runs on recommendations.',
        );
      } else if (draft.applyMode === 'autopilot') {
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
  // No Meta ad set: the portfolio holds campaigns on a platform nothing applies to, so it is
  // created recommend-only whatever the draft says.
  const metaHosted = platformHost(draft) == null;
  const applyMode: ApplyMode = metaHosted ? draft.applyMode : 'recommend';

  return {
    name: draft.name.trim(),
    objective: draft.objective,
    // Only ever sent with a 'custom' objective, and only once it validates — `stepIssues`
    // refuses the step otherwise, so an invalid one cannot reach here.
    ...(conversion && 'descriptor' in conversion
      ? { conversion_descriptor: conversion.descriptor }
      : {}),
    level: metaHosted ? 'adset' : 'campaign',
    mode: draft.mode,
    apply_mode: applyMode,
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
    ...(applyMode === 'autopilot' && maxDaily != null && maxPct != null
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
