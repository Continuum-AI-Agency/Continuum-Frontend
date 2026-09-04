// ---------------------------------------------------------------------------
// Rule template library.
//
// Two tiers:
//   BUILTIN_PARITY_TEMPLATES — the engine's native P1-P3 pause triggers and
//     F1/F2 fatigue rules re-expressed in the rule DSL. Proven equivalent to
//     evaluateTriggers()/evaluateFatigue() by tests/rules-parity.test.ts.
//     At wiring time these are the seed rules a portfolio starts with; the
//     TypeScript triggers stay the source of truth + fallback until a
//     portfolio's shadow-parity is verified.
//   DCO_ADAPTED_TEMPLATES — the salvageable subset of the legacy DCO's rule
//     library (rule-templates.js), re-scoped from its ACCOUNT/CAMPAIGN/AD
//     hierarchy to this engine's ad-set-in-portfolio grain. The DCO's SCALE_*
//     templates are deliberately NOT ported: continuous budget scaling is the
//     solver's job here, and a discrete scale rule would fight it. Its
//     ROAS-based templates are also not portable yet — WindowMetrics carries
//     no conversion value (CPP-based analogues stand in).
//
// Thresholds that mirror EngineConfig guardrails are instantiated FROM the
// resolved per-portfolio config, so a generated rule inherits the portfolio's
// objective profile + overrides; the rest keep the DCO's defaults and are the
// per-portfolio tunable surface (rule.params).
// ---------------------------------------------------------------------------

import type { EngineConfig } from '../config';
import type { FactValue, RuleAction, RuleCondition, RuleDefinition } from './types';

export type RuleTemplate = {
  templateId: string;
  name: string;
  description: string;
  /** Higher wins dedup. Parity tier occupies 60-100 (matching the built-in
   *  precedence P1 > P2 > P3 > F2 > F1); adapted tier sits below at 20-45. */
  priority: number;
  action: RuleAction;
  conditions: RuleCondition;
  /** Default params derived from the resolved portfolio EngineConfig. */
  paramsFrom: (cfg: EngineConfig) => Record<string, FactValue>;
};

// --- Parity tier: the built-in triggers, as data --------------------------

const AGE_GATE: RuleCondition = {
  fact: 'age_days',
  operator: 'greaterThan',
  value: { fact: 'protect_days' },
};

export const BUILTIN_PARITY_TEMPLATES: RuleTemplate[] = [
  {
    templateId: 'P1_zero_upper_funnel',
    name: 'Pause — zero upper funnel (3d)',
    description:
      'Meaningful 3d spend, zero KPI events, and a dead or wildly expensive upper funnel vs the portfolio average.',
    priority: 100,
    action: {
      kind: 'pause',
      severity: 'high',
      reasonTemplate:
        'Spent {{spend_d3}} over 3d with 0 conversions and a dead or over-{{upper_funnel_override_mult}}× upper-funnel cost vs portfolio average.',
    },
    conditions: {
      all: [
        AGE_GATE,
        { fact: 'spend_d3', operator: 'greaterThan', value: { fact: 'budget_floor' } },
        { fact: 'kpi_events_d3', operator: 'equal', value: 0 },
        {
          any: [
            { fact: 'atc_d3', operator: 'equal', value: 0 },
            {
              // isGreaterThanRatio is false when the portfolio average is 0,
              // reproducing the built-in's `avgAtcCost > 0` precondition.
              fact: 'atc_cost_d3',
              operator: 'isGreaterThanRatio',
              value: {
                compareValue: { fact: 'portfolio_avg_atc_cost_d3' },
                ratio: { fact: 'upper_funnel_override_mult' },
              },
            },
          ],
        },
      ],
    },
    paramsFrom: (cfg) => ({
      protect_days: cfg.newItemProtectDays,
      upper_funnel_override_mult: cfg.upperFunnelOverrideMult,
    }),
  },
  {
    templateId: 'P2_sustained_poor',
    name: 'Pause — sustained poor vs robust reference (14d)',
    description:
      'Converting, but 14d cost-per-event above a multiple of the portfolio robust best (P25), with no positive trajectory.',
    priority: 90,
    action: {
      kind: 'pause',
      severity: 'medium',
      reasonTemplate:
        'CPP 14d ${{cpp_d14}} > {{sustained_poor_multiplier}}× the robust reference (${{robust_best_cpp_d14}}), with no recent improvement.',
    },
    conditions: {
      all: [
        AGE_GATE,
        { fact: 'kpi_events_d14', operator: 'greaterThan', value: 0 },
        { fact: 'trajectory_state', operator: 'notEqual', value: 'positive' },
        {
          // False when robust_best_cpp_d14 is 0 (no reference data) — the
          // built-in's `robustBestCpp > 0` precondition.
          fact: 'cpp_d14',
          operator: 'isGreaterThanRatio',
          value: {
            compareValue: { fact: 'robust_best_cpp_d14' },
            ratio: { fact: 'sustained_poor_multiplier' },
          },
        },
      ],
    },
    paramsFrom: (cfg) => ({
      protect_days: cfg.newItemProtectDays,
      sustained_poor_multiplier: cfg.sustainedPoorMultiplier,
    }),
  },
  {
    templateId: 'P3_low_significance',
    name: 'Pause — dead weight (14d)',
    description: 'More than one target CPA spent over 14d with zero KPI events in both 7d and 14d.',
    priority: 80,
    action: {
      kind: 'pause',
      severity: 'low',
      reasonTemplate:
        'Spent ${{spend_d14}} over 14d (> 1 target CPA) with 0 conversions: dead weight.',
    },
    conditions: {
      all: [
        AGE_GATE,
        { fact: 'kpi_events_d14', operator: 'equal', value: 0 },
        { fact: 'kpi_events_d7', operator: 'equal', value: 0 },
        { fact: 'spend_d14', operator: 'greaterThan', value: { fact: 'cpa_target' } },
      ],
    },
    paramsFrom: (cfg) => ({ protect_days: cfg.newItemProtectDays }),
  },
  {
    templateId: 'F2_audience_saturation',
    name: 'Audience saturation — frequency over cap + CPA rising',
    description:
      'Still converting, but 7d frequency is at/over the audience-aware cap while recent CPA decays. Expanding the audience is the lever.',
    priority: 70,
    action: {
      kind: 'audience_expand',
      severity: 'medium',
      reasonTemplate:
        'Frequency {{frequency_7d}} ≥ {{fatigue_freq_cap}} with CPA up (3d ${{cpp_d3}} vs 14d ${{cpp_d14}}): audience saturated — expand or rotate.',
    },
    conditions: {
      all: [
        AGE_GATE,
        { fact: 'status', operator: 'notEqual', value: 'starved' },
        { fact: 'kpi_events_d14', operator: 'greaterThan', value: 0 },
        { fact: 'kpi_events_d3', operator: 'greaterThan', value: 0 },
        {
          fact: 'cpp_d3',
          operator: 'isGreaterThanRatio',
          value: { compareValue: { fact: 'cpp_d14' }, ratio: { fact: 'fatigue_cpa_rise_ratio' } },
        },
        { fact: 'trajectory_state', operator: 'notEqual', value: 'positive' },
        {
          fact: 'frequency_7d',
          operator: 'greaterThanInclusive',
          value: { fact: 'fatigue_freq_cap' },
        },
      ],
    },
    paramsFrom: (cfg) => ({
      protect_days: cfg.newItemProtectDays,
      fatigue_cpa_rise_ratio: 1 + cfg.fatigueCpaDriftPct,
    }),
  },
  {
    templateId: 'F1_creative_fatigue',
    name: 'Creative fatigue — CTR decaying + CPA rising',
    description:
      'Still converting and frequency under the cap, but recent CTR dropped below the keep-ratio of its 14d baseline while CPA rises. Refresh the creative.',
    priority: 60,
    action: {
      kind: 'creative_refresh',
      severity: 'medium',
      reasonTemplate:
        'CTR down (3d {{ctr_d3}} vs 14d {{ctr_d14}}) with CPA up (3d ${{cpp_d3}} vs 14d ${{cpp_d14}}): creative worn out — refresh.',
    },
    conditions: {
      all: [
        AGE_GATE,
        { fact: 'status', operator: 'notEqual', value: 'starved' },
        { fact: 'kpi_events_d14', operator: 'greaterThan', value: 0 },
        { fact: 'kpi_events_d3', operator: 'greaterThan', value: 0 },
        {
          fact: 'cpp_d3',
          operator: 'isGreaterThanRatio',
          value: { compareValue: { fact: 'cpp_d14' }, ratio: { fact: 'fatigue_cpa_rise_ratio' } },
        },
        { fact: 'trajectory_state', operator: 'notEqual', value: 'positive' },
        // Under the frequency cap: at/over it is F2 territory (F2 takes
        // precedence in the built-in loop; expressed here as a condition so
        // the two data rules stay mutually exclusive).
        { fact: 'frequency_7d', operator: 'lessThan', value: { fact: 'fatigue_freq_cap' } },
        // Delivery, not clicks: an ad set still serving with ZERO clicks is the most
        // fatigued state there is. Mirrors the same gate in fatigue.ts — the parity
        // sweep fails if these two ever drift.
        { fact: 'impressions_d3', operator: 'greaterThan', value: 0 },
        {
          fact: 'ctr_d3',
          operator: 'isLessThanRatio',
          value: { compareValue: { fact: 'ctr_d14' }, ratio: { fact: 'fatigue_ctr_keep_ratio' } },
        },
      ],
    },
    paramsFrom: (cfg) => ({
      protect_days: cfg.newItemProtectDays,
      fatigue_cpa_rise_ratio: 1 + cfg.fatigueCpaDriftPct,
      fatigue_ctr_keep_ratio: 1 - cfg.fatigueCtrDropPct,
    }),
  },
];

// --- Adapted tier: the DCO library, re-scoped to ad sets -------------------
// DCO fact-name notes: the DCO's `ctr` was a PERCENTAGE (Meta insights wire
// format); this engine's ctr_* facts are FRACTIONS — thresholds converted.

export const DCO_ADAPTED_TEMPLATES: RuleTemplate[] = [
  {
    templateId: 'dco_pause_cpp_vs_portfolio',
    name: 'Pause — CPP far above portfolio average (7d)',
    description:
      "DCO 'ROAS Below Account Average' proportional pattern, inverted to cost-per-event vs the portfolio 7d average (no conversion value at this grain).",
    priority: 45,
    action: {
      kind: 'pause',
      severity: 'medium',
      reasonTemplate:
        'CPP 7d ${{cpp_d7}} is over {{cpp_ratio_threshold}}× the portfolio average (${{portfolio_avg_cpp_d7}}) with ${{spend_d7}} spent.',
    },
    conditions: {
      all: [
        AGE_GATE,
        { fact: 'spend_d7', operator: 'greaterThan', value: { fact: 'min_spend' } },
        { fact: 'kpi_events_d7', operator: 'greaterThan', value: 0 },
        {
          fact: 'cpp_d7',
          operator: 'isGreaterThanRatio',
          value: {
            compareValue: { fact: 'portfolio_avg_cpp_d7' },
            ratio: { fact: 'cpp_ratio_threshold' },
          },
        },
      ],
    },
    paramsFrom: (cfg) => ({
      protect_days: cfg.newItemProtectDays,
      min_spend: cfg.cpaTarget, // meaningful spend = at least one target CPA
      cpp_ratio_threshold: 1.5,
    }),
  },
  {
    templateId: 'dco_pause_high_cpc',
    name: 'Pause — CPC above absolute threshold (7d)',
    description:
      "DCO 'AdSet - Pause High CPC' ported directly. Absolute-threshold rule: the per-portfolio tunable surface, not config-derived.",
    priority: 40,
    action: {
      kind: 'pause',
      severity: 'medium',
      reasonTemplate: 'CPC 7d ${{cpc_d7}} above ${{cpc_threshold}} with {{clicks_d7}} clicks.',
    },
    conditions: {
      all: [
        AGE_GATE,
        { fact: 'clicks_d7', operator: 'greaterThan', value: { fact: 'min_clicks' } },
        { fact: 'cpc_d7', operator: 'greaterThan', value: { fact: 'cpc_threshold' } },
      ],
    },
    paramsFrom: (cfg) => ({
      protect_days: cfg.newItemProtectDays,
      min_clicks: 100,
      cpc_threshold: 3.0,
    }),
  },
  {
    templateId: 'dco_creative_low_ctr',
    name: 'Creative refresh — CTR floor (7d)',
    description:
      "DCO 'AD - Pause Low CTR', adapted: chronic low CTR with real delivery asks for new creative here, not a pause. Threshold is a fraction (DCO's 0.6 meant 0.6%).",
    priority: 35,
    action: {
      kind: 'creative_refresh',
      severity: 'low',
      reasonTemplate:
        'CTR 7d {{ctr_d7}} below {{ctr_threshold}} with {{impressions_d7}} impressions: creative underperforming.',
    },
    conditions: {
      all: [
        AGE_GATE,
        { fact: 'impressions_d7', operator: 'greaterThan', value: { fact: 'min_impressions' } },
        { fact: 'ctr_d7', operator: 'lessThan', value: { fact: 'ctr_threshold' } },
      ],
    },
    paramsFrom: (cfg) => ({
      protect_days: cfg.newItemProtectDays,
      min_impressions: 5000,
      ctr_threshold: 0.006,
    }),
  },
  {
    templateId: 'dco_starve_dead_spend',
    name: 'Starve — early dead spend (7d)',
    description:
      'Budget-shaping (no approval object): spend past a multiple of target CPA with zero 7d events is driven to the floor a week earlier than P3 would pause it.',
    priority: 30,
    action: {
      kind: 'starve',
      severity: 'low',
      reasonTemplate:
        'Spent ${{spend_d7}} over 7d (> {{dead_spend_multiple}}× target CPA) with 0 conversions: starving to floor.',
    },
    conditions: {
      all: [
        AGE_GATE,
        { fact: 'kpi_events_d7', operator: 'equal', value: 0 },
        {
          fact: 'spend_d7',
          operator: 'isGreaterThanRatio',
          value: { compareValue: { fact: 'cpa_target' }, ratio: { fact: 'dead_spend_multiple' } },
        },
      ],
    },
    paramsFrom: (cfg) => ({
      protect_days: cfg.newItemProtectDays,
      dead_spend_multiple: 1.5,
    }),
  },
  {
    templateId: 'dco_audience_freq_pressure',
    name: 'Audience expand — frequency pressure + above-average CPP (7d)',
    description:
      'Softer, earlier F2: frequency at the cap while 7d CPP runs over the portfolio average. Surfaces audience work before saturation decays CPA outright.',
    priority: 25,
    action: {
      kind: 'audience_expand',
      severity: 'low',
      reasonTemplate:
        'Frequency {{frequency_7d}} at/over {{fatigue_freq_cap}} and CPP 7d ${{cpp_d7}} over {{cpp_pressure_ratio}}× portfolio average (${{portfolio_avg_cpp_d7}}).',
    },
    conditions: {
      all: [
        AGE_GATE,
        { fact: 'status', operator: 'notEqual', value: 'starved' },
        { fact: 'kpi_events_d7', operator: 'greaterThan', value: 0 },
        {
          fact: 'frequency_7d',
          operator: 'greaterThanInclusive',
          value: { fact: 'fatigue_freq_cap' },
        },
        {
          fact: 'cpp_d7',
          operator: 'isGreaterThanRatio',
          value: {
            compareValue: { fact: 'portfolio_avg_cpp_d7' },
            ratio: { fact: 'cpp_pressure_ratio' },
          },
        },
      ],
    },
    paramsFrom: (cfg) => ({
      protect_days: cfg.newItemProtectDays,
      cpp_pressure_ratio: 1.2,
    }),
  },
  {
    templateId: 'dco_freeze_no_signal',
    name: 'Freeze — spending with no readable signal (14d)',
    description:
      'Budget-shaping: spend but zero events AND thin delivery over 14d — hold the budget rather than bleed it down on a measurement that cannot be trusted (the abstain concept, as a tunable rule).',
    priority: 20,
    action: {
      kind: 'freeze',
      severity: 'low',
      reasonTemplate:
        'Spent ${{spend_d14}} over 14d with 0 conversions and only {{impressions_d14}} impressions: holding budget.',
    },
    conditions: {
      all: [
        { fact: 'spend_d14', operator: 'greaterThan', value: 0 },
        { fact: 'kpi_events_d14', operator: 'equal', value: 0 },
        {
          fact: 'impressions_d14',
          operator: 'lessThan',
          value: { fact: 'min_impressions_for_decision' },
        },
      ],
    },
    paramsFrom: () => ({ min_impressions_for_decision: 1000 }),
  },
];

export const ALL_TEMPLATES: RuleTemplate[] = [
  ...BUILTIN_PARITY_TEMPLATES,
  ...DCO_ADAPTED_TEMPLATES,
];

/**
 * Instantiate a template into a concrete rule for one portfolio.
 * `cfg` must be the portfolio's RESOLVED EngineConfig (objective profile +
 * per-portfolio overrides already applied), so generated params inherit the
 * portfolio's calibration. paramOverrides is the tuning surface — the learning
 * loop proposes new params, humans enable them.
 */
export function instantiateTemplate(
  template: RuleTemplate,
  cfg: EngineConfig,
  opts: { id?: string; paramOverrides?: Record<string, FactValue> } = {},
): RuleDefinition {
  return {
    id: opts.id ?? `seed:${template.templateId}`,
    templateId: template.templateId,
    version: 1,
    name: template.name,
    enabled: true,
    priority: template.priority,
    conditions: template.conditions,
    action: template.action,
    params: { ...template.paramsFrom(cfg), ...opts.paramOverrides },
  };
}

/** The default seed set for a newly-enrolled portfolio: parity tier only.
 *  The adapted DCO tier is opt-in (enable per portfolio after review). */
export function seedParityRules(cfg: EngineConfig): RuleDefinition[] {
  return BUILTIN_PARITY_TEMPLATES.map((t) => instantiateTemplate(t, cfg));
}
