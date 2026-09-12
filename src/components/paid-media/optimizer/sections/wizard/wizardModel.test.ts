import { describe, expect, it } from 'bun:test';
import type { PortfolioSuggestion } from '@continuum/contracts';
import {
  buildCreateConfig,
  draftFromSuggestion,
  effectiveTargetMetric,
  emptyDraft,
  planReadout,
  stepIssues,
  suggestedGuardrails,
} from './wizardModel';

const suggestion: PortfolioSuggestion = {
  objective: 'lead',
  name: 'Leads · Efficiency',
  level: 'adset',
  mode: 'efficiency',
  daily_total: 1600,
  cpa_target: 36,
  adset_ids: ['as-1', 'as-2'],
  summary: { adsets: 2, spend14: 4200, conv14: 60 },
  reason: 'Grouped by objective',
};

const ctx = { selectedBudgetSum: 1600, blockedCount: 0 };
const createCtx = { currency: 'USD', selectedBudgetSum: 1600, level: 'adset' as const };

describe('draftFromSuggestion', () => {
  it('seeds name, objective, mode, ad sets and the target in display units', () => {
    const draft = draftFromSuggestion(suggestion);
    expect(draft.source).toBe('suggestion');
    expect(draft.name).toBe('Leads · Efficiency');
    expect(draft.objective).toBe('lead');
    expect(draft.mode).toBe('efficiency');
    expect(draft.adsetIds).toEqual(['as-1', 'as-2']);
    expect(draft.target).toBe('36');
    expect(draft.applyMode).toBe('recommend');
  });
  it('shows an awareness target as CPM and drops a zero baseline', () => {
    const draft = draftFromSuggestion({
      ...suggestion,
      objective: 'awareness',
      cpa_target: 0.012,
    });
    expect(draft.target).toBe('12');
    expect(draftFromSuggestion({ ...suggestion, cpa_target: 0 }).target).toBe('');
  });
});

describe('effectiveTargetMetric', () => {
  it('honours an allowed alternative and drops a foreign one', () => {
    expect(effectiveTargetMetric({ objective: 'traffic', targetMetric: 'link_clicks' })).toBe(
      'link_clicks',
    );
    expect(effectiveTargetMetric({ objective: 'purchase', targetMetric: 'link_clicks' })).toBe(
      'purchase',
    );
    expect(effectiveTargetMetric({ objective: 'lead', targetMetric: null })).toBe('lead');
  });
});

describe('stepIssues', () => {
  it('names what each step still needs', () => {
    const draft = emptyDraft();
    expect(stepIssues(draft, 'start', ctx)).toHaveLength(1);
    expect(stepIssues(draft, 'assets', ctx)).toEqual(['Select at least one ad set.']);
    expect(
      stepIssues({ ...draft, adsetIds: ['a'] }, 'assets', { ...ctx, blockedCount: 2 })[0],
    ).toMatch(/2 selected ad sets are held/);
    expect(stepIssues({ ...draft, mode: 'scale' }, 'goal', ctx)[0]).toMatch(/how much to grow/);
    expect(
      stepIssues(
        { ...draft, mode: 'scale', scaleGrowthPct: '10', scaleCadenceDays: '7' },
        'goal',
        ctx,
      ),
    ).toEqual([]);
    expect(stepIssues({ ...draft, name: '' }, 'plan', ctx)[0]).toMatch(/name/);
  });
  it('the plan step checks the flight, the budget and the guardrails', () => {
    const base = { ...emptyDraft(), name: 'P', adsetIds: ['a'] };
    expect(stepIssues(base, 'plan', ctx)).toEqual([]);
    expect(stepIssues(base, 'plan', { ...ctx, selectedBudgetSum: 0 })[0]).toMatch(/daily budget/);
    expect(
      stepIssues({ ...base, flightFrom: '2026-09-01', flightTo: '2026-09-30' }, 'plan', ctx)[0],
    ).toMatch(/Give the flight a budget/);
    expect(
      stepIssues({ ...base, budgetAmount: '3000', budgetGranularity: 'monthly' }, 'plan', ctx)[0],
    ).toMatch(/monthly budget needs a flight/);
    expect(stepIssues({ ...base, applyMode: 'autopilot' }, 'plan', ctx)).toHaveLength(2);
    expect(
      stepIssues(
        { ...base, applyMode: 'autopilot', maxDailyApply: '2400', maxChangePct: '20' },
        'plan',
        ctx,
      ),
    ).toEqual([]);
  });
});

describe('buildCreateConfig', () => {
  it('a suggestion draft matches the selection and carries only what was chosen', () => {
    const config = buildCreateConfig(draftFromSuggestion(suggestion), createCtx);
    expect(config).toMatchObject({
      name: 'Leads · Efficiency',
      objective: 'lead',
      level: 'adset',
      mode: 'efficiency',
      apply_mode: 'recommend',
      daily_total: 1600,
      budget_source: 'observed',
      lookback_window: 'd14',
      budget_granularity: 'daily',
      cpa_target: 36,
    });
    expect(config.target_metric).toBeUndefined();
    expect(config.period_budget).toBeUndefined();
    expect(config.max_daily_apply_minor).toBeUndefined();
    expect(config.scale_growth_pct).toBeUndefined();
  });

  it('a full plan derives the flight budget and the daily total from the typed granularity', () => {
    const draft = {
      ...emptyDraft(),
      name: 'Q4',
      objective: 'traffic' as const,
      targetMetric: 'link_clicks' as const,
      target: '0.5',
      flightFrom: '2026-10-01',
      flightTo: '2026-10-30',
      budgetAmount: '240000',
      budgetGranularity: 'monthly' as const,
    };
    const config = buildCreateConfig(draft, createCtx);
    expect(config.period_start).toBe('2026-10-01');
    expect(config.period_end).toBe('2026-10-30');
    expect(config.period_budget).toBe(240_000);
    expect(config.daily_total).toBe(8000);
    expect(config.budget_source).toBe('fixed');
    expect(config.budget_granularity).toBe('monthly');
    expect(config.target_metric).toBe('link_clicks');
    expect(config.cpa_target).toBe(0.5);
  });

  it('autopilot guardrails land in minor units and fractions; the scale plan in fractions and days', () => {
    const draft = {
      ...emptyDraft(),
      name: 'Grow',
      mode: 'scale' as const,
      scaleGrowthPct: '10',
      scaleCadenceDays: '7',
      scaleMaxDaily: '5000',
      applyMode: 'autopilot' as const,
      maxDailyApply: '2400',
      maxChangePct: '20',
    };
    const config = buildCreateConfig(draft, createCtx);
    expect(config.max_daily_apply_minor).toBe(240_000);
    expect(config.max_change_pct_per_cycle).toBe(0.2);
    expect(config.scale_growth_pct).toBe(0.1);
    expect(config.scale_cadence_days).toBe(7);
    expect(config.scale_max_daily).toBe(5000);
    const jpy = buildCreateConfig(draft, { ...createCtx, currency: 'JPY' });
    expect(jpy.max_daily_apply_minor).toBe(2400);
  });

  it('prices an awareness target per thousand', () => {
    const config = buildCreateConfig(
      { ...emptyDraft(), name: 'Reach', objective: 'awareness', target: '12' },
      createCtx,
    );
    expect(config.cpa_target).toBeCloseTo(0.012, 9);
  });
});

describe('planReadout / suggestedGuardrails', () => {
  it('reads the typed budget back per day and for the flight', () => {
    const readout = planReadout({
      ...emptyDraft(),
      flightFrom: '2026-09-01',
      flightTo: '2026-09-30',
      budgetAmount: '8000',
      budgetGranularity: 'daily',
    });
    expect(readout).toEqual({ days: 30, perDay: 8000, total: 240_000 });
    expect(planReadout(emptyDraft())).toEqual({ days: null, perDay: null, total: null });
  });
  it('suggests a ceiling of 1.5× the daily total and a 20% cap', () => {
    expect(suggestedGuardrails(1600)).toEqual({ maxDailyApply: '2400', maxChangePct: '20' });
    expect(suggestedGuardrails(0)).toEqual({ maxDailyApply: '', maxChangePct: '20' });
  });
});
