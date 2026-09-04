// ---------------------------------------------------------------------------
// The decay read: "is this thing getting worse than its own baseline?"
//
// Extracted, not invented. `evaluateFatigue` already computed exactly this at AD SET
// grain for F1/F2, and ad-level creative decay is the identical maths on a different
// subject — a creative's own d3 against its own d14. Two copies of it would drift, and
// this codebase has the receipt: F1's CTR gate was wrong for months (`ctrRecent > 0`
// exempted the most fatigued state there is — full delivery, zero clicks), and fixing it
// meant finding and fixing the mirrored copy in `rules/templates.ts` too. One copy.
//
// This module reads; it does not decide. It returns the numbers AND the booleans so each
// caller can phrase its own recommendation without re-deriving a percentage.
// ---------------------------------------------------------------------------

import type { EngineConfig } from './config';
import { costPerEvent, kpiEvents } from './scoring';
import type { WindowMetrics } from './types';

/** Clicks per impression. Zero when nothing was served — see `delivered` below for why
 *  that distinction matters more than it looks. */
export function ctr(m: WindowMetrics): number {
  return m.impressions && m.impressions > 0 ? (m.clicks ?? 0) / m.impressions : 0;
}

export type DecayThresholds = {
  /** Recent cost-per-event must exceed the baseline by this fraction to count as decaying. */
  cpaDriftPct: number;
  /** Recent CTR this far below the baseline reads as worn out. */
  ctrDropPct: number;
};

export type DecayRead = {
  /** Both windows produced the KPI event, so a cost comparison means something. */
  convertsInBothWindows: boolean;
  /** The recent window served impressions. NOT "got clicks" — see ctrDropped. */
  delivered: boolean;
  cppRecent: number;
  cppBase: number;
  /** Whole-percent rise in cost per event, baseline → recent. 0 when the baseline is 0. */
  cpaUpPct: number;
  cpaRising: boolean;
  ctrRecent: number;
  ctrBase: number;
  /** Whole-percent fall in CTR, baseline → recent. 0 when the baseline is 0. */
  ctrDownPct: number;
  ctrDropped: boolean;
};

/**
 * Compare a recent window against its own baseline.
 *
 * `ctrDropped` gates on `recent.impressions > 0` rather than `ctrRecent > 0` deliberately:
 * something still serving thousands of impressions that has stopped earning clicks
 * entirely reads as CTR 0, and a `> 0` test throws that away as though it were missing
 * data. It is not missing — it is the worst reading on the scale.
 */
export function readDecay(
  recent: WindowMetrics,
  base: WindowMetrics,
  cfg: EngineConfig,
  thresholds: DecayThresholds,
): DecayRead {
  const convertsInBothWindows = kpiEvents(base, cfg) > 0 && kpiEvents(recent, cfg) > 0;
  const cppRecent = costPerEvent(recent, cfg);
  const cppBase = costPerEvent(base, cfg);
  const cpaRising = cppBase > 0 && cppRecent > (1 + thresholds.cpaDriftPct) * cppBase;

  const ctrRecent = ctr(recent);
  const ctrBase = ctr(base);
  const delivered = (recent.impressions ?? 0) > 0;
  const ctrDropped = ctrBase > 0 && delivered && ctrRecent < (1 - thresholds.ctrDropPct) * ctrBase;

  return {
    convertsInBothWindows,
    delivered,
    cppRecent,
    cppBase,
    cpaUpPct: cppBase > 0 ? ((cppRecent - cppBase) / cppBase) * 100 : 0,
    cpaRising,
    ctrRecent,
    ctrBase,
    ctrDownPct: ctrBase > 0 ? ((ctrBase - ctrRecent) / ctrBase) * 100 : 0,
    ctrDropped,
  };
}
