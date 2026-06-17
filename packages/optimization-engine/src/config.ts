// ---------------------------------------------------------------------------
// Default engine configuration — values mirror the "Config" sheet of
// rules_system_v2_ecuations.xlsx 1:1. Every value is overridable per portfolio.
// Per-portfolio objectives (objectives.ts) overlay onto this base; the default
// (no objective) reproduces the Excel behaviour exactly.
// ---------------------------------------------------------------------------

import { OBJECTIVE_PROFILES, type ObjectiveProfile } from './objectives';
import type { OptimizationObjective, WindowMetrics } from './types';

export type WindowWeights = { d3: number; d7: number; d14: number };

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

  // -- Grace periods --
  newItemProtectDays: number;
  postReactivationGraceDays: number;

  // -- Learning phase --
  learningConvThreshold: number;
  learningMinDays: number;

  // -- Creative fatigue (flag only) --
  fatigueFreqThreshold: number;
  fatigueCppWowDecay: number;

  // -- Tier / significance --
  // minPurchasesSignif: below this many purchases in a window, fall back to the
  // Tier-2 upper-funnel proxy (ATC rate). Default 0 => always Tier-1 (1/CPP),
  // which reproduces the Excel exactly.
  minPurchasesSignif: number;

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

  newItemProtectDays: 7,
  postReactivationGraceDays: 5,

  learningConvThreshold: 50,
  learningMinDays: 7,

  fatigueFreqThreshold: 4,
  fatigueCppWowDecay: 0.4,

  minPurchasesSignif: 0,

  toggles: {
    significanceGate: false,
    minEventsPerWindow: 2,
    nonOverlappingMomentum: false,
    saturationGamma: 1,
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

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
