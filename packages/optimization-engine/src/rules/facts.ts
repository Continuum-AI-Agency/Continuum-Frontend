// ---------------------------------------------------------------------------
// Fact builders — the vocabulary rules evaluate against.
//
// This is the DCO's fact-cache pattern (batch metrics + parent-scope averages
// + derived proportional facts, computed once per cycle) rebuilt as pure
// in-memory math over AdSetSnapshot[]. The DCO's "parent scope" (account /
// campaign averages) collapses to PORTFOLIO facts here, because the engine's
// unit is the ad set inside a portfolio.
//
// Parity contract: every fact that mirrors a built-in trigger input is computed
// with the SAME helper (kpiEvents / costPerEvent / scoreAdSet) and the SAME
// aggregate recipe as triggers.ts / fatigue.ts, so a DSL rule and its native
// counterpart see identical numbers. The percentile function below is a
// byte-for-byte copy of the private one in triggers.ts (kept private there on
// purpose — this module must not modify shipped engine files).
// ---------------------------------------------------------------------------

import type { EngineConfig } from '../config';
import { costPerEvent, kpiEvents, scoreAdSet } from '../scoring';
import type { AdSetSnapshot, WindowMetrics } from '../types';
import type { FactMap } from './types';

const isEvaluable = (s: AdSetSnapshot): boolean => s.status !== 'frozen' && s.status !== 'flagged';

/** Copy of triggers.ts percentile — lower-percentile of a numeric array. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const v = [...values].sort((a, b) => a - b);
  const idx = Math.min(v.length - 1, Math.max(0, Math.round((p / 100) * (v.length - 1))));
  return v[idx];
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const ctr = (m: WindowMetrics): number =>
  m.impressions && m.impressions > 0 ? (m.clicks ?? 0) / m.impressions : 0;

const cpc = (m: WindowMetrics): number => (m.clicks && m.clicks > 0 ? m.spend / m.clicks : 0);

const isRemarketing = (a: AdSetSnapshot['audienceType']): boolean =>
  a === 'remarketing' || a === 'retargeting';

/**
 * Portfolio-level facts, computed once per cycle over the whole snapshot set.
 * These are the DSL equivalents of the aggregates the built-in triggers derive
 * inline (robust reference CPP, average ATC cost, budget floor).
 */
export function buildPortfolioFacts(snapshots: AdSetSnapshot[], cfg: EngineConfig): FactMap {
  const evaluable = snapshots.filter(isEvaluable);

  // triggers.ts: P25 of cost-per-KPI-event over d14, items with events only.
  const cpp14s = evaluable
    .filter((s) => kpiEvents(s.windows.d14, cfg) > 0)
    .map((s) => costPerEvent(s.windows.d14, cfg));
  const robustBestCpp = percentile(cpp14s, 25);

  // triggers.ts: portfolio average ATC cost over d3, items with ATCs only.
  const atcCosts = evaluable
    .filter((s) => s.windows.d3.addToCarts > 0)
    .map((s) => s.windows.d3.spend / s.windows.d3.addToCarts);

  // triggers.ts: minimum meaningful daily spend (the P1 spend gate).
  const budgetFloor = Math.max((cfg.cpaTarget * cfg.floorMinSignals) / cfg.floorWindowDays, 0);

  const cpp7s = evaluable
    .filter((s) => kpiEvents(s.windows.d7, cfg) > 0)
    .map((s) => costPerEvent(s.windows.d7, cfg));

  const ctr14s = evaluable
    .filter((s) => (s.windows.d14.impressions ?? 0) > 0)
    .map((s) => ctr(s.windows.d14));

  return {
    robust_best_cpp_d14: robustBestCpp,
    portfolio_avg_atc_cost_d3: mean(atcCosts),
    portfolio_avg_cpp_d7: mean(cpp7s),
    portfolio_avg_cpp_d14: mean(cpp14s),
    portfolio_avg_ctr_d14: mean(ctr14s),
    portfolio_avg_budget: mean(evaluable.map((s) => s.currentBudget)),
    budget_floor: budgetFloor,
    cpa_target: cfg.cpaTarget,
    evaluable_count: evaluable.length,
  };
}

/**
 * Per-ad-set facts: window metrics + derived costs/rates + config-resolved
 * context (audience-aware frequency cap, trajectory state), merged over the
 * portfolio facts. Rule params are merged LAST by the evaluator, so a param
 * can override any fact (the DCO's `{ ...cached, ...paramFacts }` precedence).
 *
 * Note: atc_cost_d3 is Infinity when the ad set has zero ATCs (mirrors the
 * built-in P1's `Infinity` cost proxy); Infinity JSON-serializes to null, which
 * the persistence layer inherits for matched-fact snapshots.
 */
export function buildAdsetFacts(
  s: AdSetSnapshot,
  portfolioFacts: FactMap,
  cfg: EngineConfig,
): FactMap {
  const { d3, d7, d14 } = s.windows;

  return {
    ...portfolioFacts,

    // Identity / context
    adset_id: s.id,
    status: s.status,
    current_budget: s.currentBudget,
    age_days: s.ageDays,
    audience_type: s.audienceType ?? 'unknown',
    frequency_7d: s.frequency7d ?? 0,
    fatigue_freq_cap: isRemarketing(s.audienceType)
      ? cfg.fatigueFreqRemarketing
      : cfg.fatigueFreqProspecting,
    trajectory_state: scoreAdSet(s, cfg).trajectoryState,

    // Spend
    spend_d3: d3.spend,
    spend_d7: d7.spend,
    spend_d14: d14.spend,

    // KPI events (objective-aware via cfg.kpiField, default purchases)
    kpi_events_d3: kpiEvents(d3, cfg),
    kpi_events_d7: kpiEvents(d7, cfg),
    kpi_events_d14: kpiEvents(d14, cfg),

    // Cost per KPI event (0 when no events — costPerEvent semantics)
    cpp_d3: costPerEvent(d3, cfg),
    cpp_d7: costPerEvent(d7, cfg),
    cpp_d14: costPerEvent(d14, cfg),

    // Upper funnel
    atc_d3: d3.addToCarts,
    atc_cost_d3: d3.addToCarts > 0 ? d3.spend / d3.addToCarts : Number.POSITIVE_INFINITY,

    // Engagement
    clicks_d3: d3.clicks,
    clicks_d7: d7.clicks,
    clicks_d14: d14.clicks,
    impressions_d3: d3.impressions,
    impressions_d7: d7.impressions,
    impressions_d14: d14.impressions,
    ctr_d3: ctr(d3),
    ctr_d7: ctr(d7),
    ctr_d14: ctr(d14),
    cpc_d3: cpc(d3),
    cpc_d7: cpc(d7),
    cpc_d14: cpc(d14),
  };
}
