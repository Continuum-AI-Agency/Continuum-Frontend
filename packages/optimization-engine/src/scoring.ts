// ---------------------------------------------------------------------------
// Signal extraction & scoring (Equations Reference sheet, sections 1-2).
//   Score_t = 1 / CPP_t          (Tier 1, purchase data)
//   Score_t = ATC / Clicks       (Tier 2, upper-funnel proxy)
//   trajectory -> dynamic window weights -> renormalized composite
// ---------------------------------------------------------------------------

import type { EngineConfig, WindowWeights } from './config';
import type { AdSetSnapshot, TrajectoryState, WindowMetrics } from './types';

export const cpp = (m: WindowMetrics): number =>
  m.purchases > 0 ? m.spend / m.purchases : 0;

/** Count of the active KPI events in a window (objective-aware; default purchases). */
export function kpiEvents(m: WindowMetrics, cfg: EngineConfig): number {
  return (m[cfg.kpiField ?? 'purchases'] ?? 0) as number;
}

/** Cost per KPI event for a window (0 when there are no events). */
export function costPerEvent(m: WindowMetrics, cfg: EngineConfig): number {
  const events = kpiEvents(m, cfg);
  return events > 0 ? m.spend / events : 0;
}

/**
 * Score for a single window.
 * With an objective profile active (cfg.kpiField set): score = events / spend on
 * that KPI (higher = better; awareness ≈ impressions/$ ≈ 1/CPM).
 * Legacy default (no kpiField): Tier 1 (1/CPP) when purchases >= minPurchasesSignif,
 * otherwise the Tier-2 ATC-rate proxy. Returns 0 when there is no usable data.
 *
 * NOTE: Tier-1 (≈0.02-0.04) and Tier-2 (≈0.1-0.3) live on different scales.
 * Mixing them in one composite is a known issue (see README parking lot);
 * with the default minPurchasesSignif=0 only Tier-1 is ever used.
 */
export function windowScore(m: WindowMetrics, cfg: EngineConfig): number {
  if (cfg.kpiField) {
    const events = kpiEvents(m, cfg);
    return m.spend > 0 && events > 0 ? events / m.spend : 0;
  }
  if (m.purchases >= cfg.minPurchasesSignif && m.purchases > 0) {
    const c = cpp(m);
    return c > 0 ? 1 / c : 0;
  }
  // Tier 2 fallback
  if (m.clicks > 0) return m.addToCarts / m.clicks;
  return 0;
}

/** True if a window's score should be trusted (significance gate, toggle #2). */
export function windowCounts(m: WindowMetrics, cfg: EngineConfig): boolean {
  if (cfg.toggles.significanceGate) {
    const events = cfg.kpiField
      ? kpiEvents(m, cfg)
      : m.purchases > 0
        ? m.purchases
        : m.addToCarts;
    return events >= cfg.toggles.minEventsPerWindow;
  }
  return true; // Excel behaviour: any window with score > 0 counts
}

/** Derive the prior non-overlapping block (days 4-7) from cumulative windows. */
function priorBlock(d3: WindowMetrics, d7: WindowMetrics): WindowMetrics {
  const sub = (a = 0, b = 0): number => Math.max(0, a - b);
  return {
    spend: sub(d7.spend, d3.spend),
    purchases: sub(d7.purchases, d3.purchases),
    addToCarts: sub(d7.addToCarts, d3.addToCarts),
    clicks: sub(d7.clicks, d3.clicks),
    impressions: sub(d7.impressions, d3.impressions),
    leads: sub(d7.leads, d3.leads),
    appInstalls: sub(d7.appInstalls, d3.appInstalls),
    signups: sub(d7.signups, d3.signups),
    landingPageViews: sub(d7.landingPageViews, d3.landingPageViews),
    reach: sub(d7.reach, d3.reach),
  };
}

export type ScoreBreakdown = {
  score3d: number;
  score7d: number;
  score14d: number;
  trajectoryRatio: number;
  trajectoryState: TrajectoryState;
  weights: WindowWeights;
  composite: number;
};

export function scoreAdSet(
  s: AdSetSnapshot,
  cfg: EngineConfig,
  priorComposite?: number,
): ScoreBreakdown {
  const score3d = windowScore(s.windows.d3, cfg);
  const score7d = windowScore(s.windows.d7, cfg);
  const score14d = windowScore(s.windows.d14, cfg);

  // --- Trajectory ratio --------------------------------------------------
  let trajectoryRatio = 1;
  if (cfg.toggles.nonOverlappingMomentum) {
    const prev = priorBlock(s.windows.d3, s.windows.d7); // days 4-7
    const scorePrev = windowScore(prev, cfg);
    trajectoryRatio = score3d > 0 && scorePrev > 0 ? score3d / scorePrev : 1;
  } else {
    trajectoryRatio = score3d > 0 && score7d > 0 ? score3d / score7d : 1;
  }

  let trajectoryState: TrajectoryState = 'neutral';
  if (trajectoryRatio >= cfg.trajectoryPosThreshold) trajectoryState = 'positive';
  else if (trajectoryRatio <= cfg.trajectoryNegThreshold) trajectoryState = 'negative';

  const weights =
    trajectoryState === 'positive'
      ? cfg.weightsPositive
      : trajectoryState === 'negative'
        ? cfg.weightsNegative
        : cfg.weightsNeutral;

  // --- Composite (renormalized for missing / gated windows) --------------
  const use3 = score3d > 0 && windowCounts(s.windows.d3, cfg);
  const use7 = score7d > 0 && windowCounts(s.windows.d7, cfg);
  const use14 = score14d > 0 && windowCounts(s.windows.d14, cfg);

  const num =
    (use3 ? weights.d3 * score3d : 0) +
    (use7 ? weights.d7 * score7d : 0) +
    (use14 ? weights.d14 * score14d : 0);
  const den =
    (use3 ? weights.d3 : 0) + (use7 ? weights.d7 : 0) + (use14 ? weights.d14 : 0);

  let composite = den > 0 ? num / den : 0;

  // #3 saturation exponent (1 => no-op / Excel)
  if (cfg.toggles.saturationGamma !== 1 && composite > 0) {
    composite = Math.pow(composite, cfg.toggles.saturationGamma);
  }

  // EWMA smoothing across cycles (Lead): blend this cycle's raw composite with
  // the prior cycle's smoothed composite. The returned value IS next cycle's
  // prior. Off when ewmaAlpha is 0 or there is no prior state yet.
  if (cfg.ewmaAlpha && cfg.ewmaAlpha > 0 && priorComposite !== undefined && priorComposite > 0) {
    composite = cfg.ewmaAlpha * composite + (1 - cfg.ewmaAlpha) * priorComposite;
  }

  return { score3d, score7d, score14d, trajectoryRatio, trajectoryState, weights, composite };
}
