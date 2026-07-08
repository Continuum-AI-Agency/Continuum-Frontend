// ---------------------------------------------------------------------------
// Per-objective profiles — CALIBRATED from 18 months of real Meta data
// (26 accounts, $37.4M spend, 440k ad-day rows). Each portfolio declares an
// objective; the engine resolves the matching profile and applies it.
//
// How these numbers were derived (see Duane one-pager / findings):
//  - KPI field: the conversion event Meta optimizes for, per objective.
//  - Window weights: chosen by which window (3/7/14d) predicts next-period
//    efficiency. NOTE: re-weighting barely moves predictiveness (+0.00–0.03
//    Spearman) — the score is robust to weights — so these are principled,
//    not over-fit: fast (3d-heavy) for dense signals, slow (de-weight 3d) for
//    sparse/noisy ones (Lead's optimal 3d weight is literally ~0).
//  - gamma = 1 for ALL objectives: the saturation backtest showed the velocity
//    cap (not gamma) is the real diminishing-returns control; gamma stays a knob.
//  - Asymmetric velocity caps: the disruption study found NO large "learning
//    reset" penalty up to ~50% spend change; raises >50% cost ~+4% extra CPA,
//    cuts never penalize. So raises are wider than the old ±30%, cuts wider
//    still — except objectives that saturate (purchase, lead) keep raises tight.
//  - Significance gate + EWMA: only Lead (Spearman ceiling ~0.45 — noisy +
//    saturating); needs min events per window and score smoothing.
// ---------------------------------------------------------------------------

import type { WindowWeights } from './config';
import type { OptimizationObjective, WindowMetrics } from './types';

export type ObjectiveProfile = {
  objective: OptimizationObjective;
  /** Which WindowMetrics field is the optimization KPI (events). */
  kpiField: keyof WindowMetrics;
  /** Higher KPI count per $ = better. For awareness this is impressions/$ (≈1/CPM). */
  weights: { neutral: WindowWeights; positive: WindowWeights; negative: WindowWeights };
  /** Saturation exponent on the score (share ∝ score^gamma). 1 = data-recommended default. */
  saturationGamma: number;
  /** Asymmetric per-cycle velocity caps. */
  velocityUpPct: number;
  velocityDownPct: number;
  /** Only count a window toward the composite if it has >= minEventsPerWindow events. */
  significanceGate: boolean;
  minEventsPerWindow: number;
  /** EWMA smoothing of the composite across cycles (0 = off). Needs prior state. */
  ewmaAlpha: number;
  /** Calibrated Spearman ceiling — how well this objective's signal predicts next
   *  period. Used as the prior for confidence scoring (not for allocation). */
  predictiveness: number;
  note: string;
};

export const OBJECTIVE_PROFILES: Record<OptimizationObjective, ObjectiveProfile> = {
  purchase: {
    objective: 'purchase', kpiField: 'purchases',
    weights: { neutral: { d3: 0.3, d7: 0.5, d14: 0.2 }, positive: { d3: 0.5, d7: 0.4, d14: 0.1 }, negative: { d3: 0.1, d7: 0.4, d14: 0.5 } },
    saturationGamma: 1, velocityUpPct: 0.30, velocityDownPct: 0.40,
    significanceGate: false, minEventsPerWindow: 0, ewmaAlpha: 0, predictiveness: 0.80,
    note: 'Saturates (β≈0.21) → tighter raises. Incl. fintech approved-credit onboarding.',
  },
  app_install: {
    objective: 'app_install', kpiField: 'appInstalls',
    weights: { neutral: { d3: 0.3, d7: 0.5, d14: 0.2 }, positive: { d3: 0.5, d7: 0.4, d14: 0.1 }, negative: { d3: 0.1, d7: 0.4, d14: 0.5 } },
    saturationGamma: 1, velocityUpPct: 0.40, velocityDownPct: 0.45,
    significanceGate: false, minEventsPerWindow: 0, ewmaAlpha: 0, predictiveness: 0.88,
    note: 'Highly predictable (Spearman ~0.88), mild saturation (β≈0.10).',
  },
  signup: {
    objective: 'signup', kpiField: 'signups',
    weights: { neutral: { d3: 0.45, d7: 0.35, d14: 0.2 }, positive: { d3: 0.6, d7: 0.3, d14: 0.1 }, negative: { d3: 0.2, d7: 0.4, d14: 0.4 } },
    saturationGamma: 1, velocityUpPct: 0.50, velocityDownPct: 0.50,
    significanceGate: false, minEventsPerWindow: 0, ewmaAlpha: 0, predictiveness: 0.75,
    note: 'Flat saturation (β≈0) → scales freely. Account openings / applications.',
  },
  lead: {
    objective: 'lead', kpiField: 'leads',
    weights: { neutral: { d3: 0.1, d7: 0.4, d14: 0.5 }, positive: { d3: 0.2, d7: 0.45, d14: 0.35 }, negative: { d3: 0.05, d7: 0.35, d14: 0.6 } },
    saturationGamma: 1, velocityUpPct: 0.25, velocityDownPct: 0.35,
    significanceGate: true, minEventsPerWindow: 5, ewmaAlpha: 0.5, predictiveness: 0.45,
    note: 'Hardest objective (Spearman ~0.45, β≈0.22): 3d is noise → de-weighted; gate + EWMA + cautious caps.',
  },
  traffic: {
    objective: 'traffic', kpiField: 'landingPageViews',
    weights: { neutral: { d3: 0.5, d7: 0.35, d14: 0.15 }, positive: { d3: 0.65, d7: 0.25, d14: 0.1 }, negative: { d3: 0.25, d7: 0.4, d14: 0.35 } },
    saturationGamma: 1, velocityUpPct: 0.45, velocityDownPct: 0.50,
    significanceGate: false, minEventsPerWindow: 0, ewmaAlpha: 0, predictiveness: 0.82,
    note: 'Dense, stable signal → react fast (3d-heavy). Mild saturation (β≈0.07).',
  },
  awareness: {
    objective: 'awareness', kpiField: 'impressions',
    weights: { neutral: { d3: 0.5, d7: 0.35, d14: 0.15 }, positive: { d3: 0.65, d7: 0.25, d14: 0.1 }, negative: { d3: 0.25, d7: 0.4, d14: 0.35 } },
    saturationGamma: 1, velocityUpPct: 0.45, velocityDownPct: 0.50,
    significanceGate: false, minEventsPerWindow: 0, ewmaAlpha: 0, predictiveness: 0.82,
    note: 'Score = impressions/$ (≈1/CPM). Flat (β≈0.03). Consider reach/frequency in v2.',
  },
};

export function getObjectiveProfile(objective: OptimizationObjective): ObjectiveProfile {
  return OBJECTIVE_PROFILES[objective];
}
