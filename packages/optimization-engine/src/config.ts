// ---------------------------------------------------------------------------
// Default engine configuration — values mirror the "Config" sheet of
// rules_system_v2_ecuations.xlsx 1:1. Every value is overridable per portfolio.
// Per-portfolio objectives (objectives.ts) overlay onto this base; the default
// (no objective) reproduces the Excel behaviour exactly.
// ---------------------------------------------------------------------------

import { OBJECTIVE_PROFILES, type ObjectiveProfile } from './objectives';
import type { OptimizationObjective, WindowMetrics } from './types';

export type WindowWeights = { d3: number; d7: number; d14: number };

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type EngineConfig = {
  // -- Optimization engine --
  reallocCycleDays: number;
  velocityCapPct: number; // ± max change per item per cycle
  learningReductionCapPct: number; // max REDUCTION while in learning phase

  // -- Scoring weights by trajectory --
  weightsNeutral: WindowWeights;
  weightsPositive: WindowWeights;
  weightsNegative: WindowWeights;

  // -- Trajectory thresholds --
  trajectoryPosThreshold: number;
  trajectoryNegThreshold: number;

  // -- Budget floor --
  floorPortfolioPct: number; // min as % of portfolio avg budget
  floorMinSignals: number; // min conversion events per window
  floorWindowDays: number;
  cpaTarget: number; // business north-star (USD)

  // -- Pause triggers (P1/P2) --
  upperFunnelOverrideMult: number;
  upperFunnelOverrideWindow: number;
  sustainedPoorWindow: number;
  sustainedPoorMultiplier: number;

  // -- Fatigue (creative / audience renewal; surfaces a recommendation, never auto-acts) --
  fatigueFreqProspecting: number; // freq7d cap for prospecting / unknown audiences
  fatigueFreqRemarketing: number; // higher cap for remarketing / retargeting (naturally repeats)
  fatigueCpaDriftPct: number; // recent 3d CPA must be this much over the 14d baseline to count as decaying
  fatigueCtrDropPct: number; // recent 3d CTR this much below the 14d baseline => creative worn out

  // -- Grace periods --
  newItemProtectDays: number;

  // -- Learning phase --
  learningConvThreshold: number;
  learningMinDays: number;

  // -- Tier / significance --
  // minPurchasesSignif: below this many purchases in a window, fall back to the
  // Tier-2 upper-funnel proxy (ATC rate). Default 0 => always Tier-1 (1/CPP),
  // which reproduces the Excel exactly.
  minPurchasesSignif: number;

  // -- Confidence (probability the measured signal is real; never gates allocation) --
  predictiveness?: number; // objective's calibrated Spearman ceiling (set by the profile)
  confidenceSampleK: number; // events/(events+k) saturation for the sample-size factor

  // -- Statistical rigor (P1) --
  precisionK: number; // inverse-variance smoothing: window precision = events/(events+k)
  shrinkageK: number; // empirical-Bayes: pull sparse ad-set scores toward the cohort mean

  // ---- Improvement toggles (default = Excel behaviour) -------------------
  toggles: {
    // #2 Per-window significance gate: a window only counts toward the
    // composite if it has >= minEventsPerWindow events. Off => Excel.
    significanceGate: boolean;
    minEventsPerWindow: number;
    // #1 Non-overlapping momentum: trajectory uses 3d vs the prior block
    // (days 4-7) instead of 3d vs 7d. Off => Excel.
    nonOverlappingMomentum: boolean;
    // #3 Saturation exponent on the score: share ~ score^gamma. 1 => Excel.
    saturationGamma: number;
    // P1 Precision weighting: weight each window by its event-count reliability
    // (events/(events+precisionK)) instead of the binary significance gate. Off => Excel.
    precisionWeighting: boolean;
    // P1 Shrinkage: pull data-bearing ad-set composites toward the cohort mean by
    // sample size (empirical-Bayes), so sparse ad sets don't swing budget. Off => Excel.
    shrinkage: boolean;
  };

  // ---- Objective profile (set when a portfolio declares an objective) -----
  // When absent the engine uses the legacy purchase path (Excel behaviour).
  // When set, scoring uses kpiField (events/$) and velocity caps are asymmetric.
  objective?: OptimizationObjective;
  kpiField?: keyof WindowMetrics; // which WindowMetrics field scores (events/$)
  velocityUpPct?: number; // asymmetric raise cap (defaults to velocityCapPct)
  velocityDownPct?: number; // asymmetric cut cap (defaults to velocityCapPct)
  ewmaAlpha?: number; // composite smoothing across cycles (0 = off)

  // ---- Solver behaviour --------------------------------------------------
  // What to do when freed budget cannot be absorbed within the +cap of the
  // eligible items (Pool > sum of upper bounds).
  //   'breach_best'   -> place the residual on the best-scoring items,
  //                      breaking their cap (Conservation > Velocity cap).
  //   'underspend'    -> respect the cap; leave the residual unallocated and
  //                      report it (Velocity cap > Conservation).
  //   'relax_uniform' -> raise every item's cap uniformly until it fits.
  overflowMode: 'breach_best' | 'underspend' | 'relax_uniform';
};

export const DEFAULT_CONFIG: EngineConfig = {
  reallocCycleDays: 3,
  velocityCapPct: 0.3,
  learningReductionCapPct: 0.08,

  weightsNeutral: { d3: 0.3, d7: 0.5, d14: 0.2 },
  weightsPositive: { d3: 0.5, d7: 0.4, d14: 0.1 },
  weightsNegative: { d3: 0.1, d7: 0.4, d14: 0.5 },

  trajectoryPosThreshold: 1.15,
  trajectoryNegThreshold: 0.85,

  floorPortfolioPct: 0.15,
  floorMinSignals: 2,
  floorWindowDays: 14,
  cpaTarget: 50,

  upperFunnelOverrideMult: 4,
  upperFunnelOverrideWindow: 3,
  sustainedPoorWindow: 14,
  sustainedPoorMultiplier: 2.5,

  fatigueFreqProspecting: 3.0,
  fatigueFreqRemarketing: 5.0,
  fatigueCpaDriftPct: 0.2,
  fatigueCtrDropPct: 0.25,

  newItemProtectDays: 7,

  learningConvThreshold: 50,
  learningMinDays: 7,

  minPurchasesSignif: 0,

  confidenceSampleK: 20,
  precisionK: 10,
  shrinkageK: 20,

  toggles: {
    significanceGate: false,
    minEventsPerWindow: 2,
    nonOverlappingMomentum: false,
    saturationGamma: 1,
    precisionWeighting: false,
    shrinkage: false,
  },

  overflowMode: 'breach_best',
};

/** Overlay a calibrated objective profile onto the Excel defaults. */
export function applyObjectiveProfile(profile: ObjectiveProfile): EngineConfig {
  return {
    ...DEFAULT_CONFIG,
    weightsNeutral: profile.weights.neutral,
    weightsPositive: profile.weights.positive,
    weightsNegative: profile.weights.negative,
    objective: profile.objective,
    kpiField: profile.kpiField,
    velocityUpPct: profile.velocityUpPct,
    velocityDownPct: profile.velocityDownPct,
    ewmaAlpha: profile.ewmaAlpha,
    predictiveness: profile.predictiveness,
    toggles: {
      ...DEFAULT_CONFIG.toggles,
      significanceGate: profile.significanceGate,
      minEventsPerWindow: profile.minEventsPerWindow,
      saturationGamma: profile.saturationGamma,
    },
  };
}

/**
 * Deep-merge a partial override onto the defaults. Precedence:
 * profile defaults (when `override.objective` is set) -> explicit override
 * (portfolio settings + per-reallocation review overrides, merged by the caller).
 */
export function resolveConfig(override?: DeepPartial<EngineConfig>): EngineConfig {
  const base = override?.objective
    ? applyObjectiveProfile(OBJECTIVE_PROFILES[override.objective])
    : DEFAULT_CONFIG;
  if (!override) return base;
  return {
    ...base,
    ...override,
    weightsNeutral: { ...base.weightsNeutral, ...override.weightsNeutral },
    weightsPositive: { ...base.weightsPositive, ...override.weightsPositive },
    weightsNegative: { ...base.weightsNegative, ...override.weightsNegative },
    toggles: { ...base.toggles, ...override.toggles },
  } as EngineConfig;
}
