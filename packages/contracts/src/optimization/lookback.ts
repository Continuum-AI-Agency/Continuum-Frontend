// Which trailing window should this portfolio read on?
//
// Every analysis surface used to hardcode its own answer — the funnel on d7, the angle
// matrix on d14, the cost series on "the last 30 cycles" — so the same portfolio reported
// three different periods with nothing on screen saying which. Making it one setting is only
// half the fix; the other half is recommending a defensible default, because the honest
// answer depends on volume: 7 days is more responsive and 30 days is more trustworthy, and
// which one is right is decided by how many conversion events the shorter window contains.
//
// The rule: pick the SHORTEST window that clears the evidence floor. Responsiveness is what
// an operator wants; sample size is what makes the number mean anything. A window carrying
// four leads will happily draw a cost line that is mostly noise.
//
// This lives in contracts rather than the engine because the window it picks governs READ
// surfaces (funnel, angle standing, cost series), not the cycle: the engine still scores on
// its own d3/d7/d14 blend, and `LookbackWindow` is a stored, wire-crossing value.

import type { AdSetSnapshot, WindowMetrics } from './engine-contracts';
import type { LookbackWindow } from './service';

export const LOOKBACK_WINDOWS: readonly LookbackWindow[] = ['d7', 'd14', 'd30'];

export const LOOKBACK_LABEL: Record<LookbackWindow, string> = {
  d7: '7 days',
  d14: '14 days',
  d30: '30 days',
};

/** How many days each window covers — for labelling and per-day maths. */
export const LOOKBACK_DAYS: Record<LookbackWindow, number> = { d7: 7, d14: 14, d30: 30 };

export type LookbackRecommendation = {
  window: LookbackWindow;
  /** Events counted in the recommended window, across the portfolio. */
  events: number;
  /** The evidence floor the recommendation was judged against. */
  required: number;
  /** Operator-facing justification, e.g. "7 days has only 4 leads". */
  reason: string;
};

/** The engine's own per-ad-set signal floor (config.floorMinSignals). Duplicated as a
 *  constant rather than imported so contracts stays dependency-free; it is a threshold for
 *  a recommendation, never an input to a budget decision. */
const FLOOR_MIN_SIGNALS = 2;

function eventsIn(window: WindowMetrics | undefined, kpiField: keyof WindowMetrics): number {
  if (!window) return 0;
  const value = window[kpiField];
  return typeof value === 'number' ? value : 0;
}

/** d30 lives on archivalWindows — the engine scores on d3/d7/d14 only — so reading a window
 *  by name has to look in both places. */
function windowOf(snapshot: AdSetSnapshot, window: LookbackWindow): WindowMetrics | undefined {
  if (window === 'd30') return snapshot.archivalWindows?.d30;
  return snapshot.windows?.[window];
}

export function eventsInWindow(
  snapshots: readonly AdSetSnapshot[],
  window: LookbackWindow,
  kpiField: keyof WindowMetrics,
): number {
  let total = 0;
  for (const snapshot of snapshots) total += eventsIn(windowOf(snapshot, window), kpiField);
  return total;
}

/**
 * Recommend the shortest window carrying enough evidence to read.
 *
 * The floor scales the per-ad-set signal floor by the number of ad sets, so a 20-ad-set
 * portfolio is held to a higher bar than a 2-ad-set one — a portfolio-wide total of 4 leads
 * means something very different across 2 ad sets than across 20.
 *
 * Falls back to the longest window when nothing clears the floor: with thin data the most
 * defensible thing to show is the widest window, and `reason` says the evidence is short
 * rather than implying the recommendation is well-evidenced.
 */
export function recommendLookbackWindow(
  snapshots: readonly AdSetSnapshot[],
  kpiField: keyof WindowMetrics,
  resultLabel = 'results',
): LookbackRecommendation {
  const required = Math.max(1, FLOOR_MIN_SIGNALS * Math.max(1, snapshots.length));

  for (const window of LOOKBACK_WINDOWS) {
    const events = eventsInWindow(snapshots, window, kpiField);
    if (events >= required) {
      return {
        window,
        events,
        required,
        reason: `${LOOKBACK_LABEL[window]} carries ${Math.round(events)} ${resultLabel} — enough to read.`,
      };
    }
  }

  const window: LookbackWindow = 'd30';
  const events = eventsInWindow(snapshots, window, kpiField);
  const shortest = eventsInWindow(snapshots, 'd7', kpiField);
  return {
    window,
    events,
    required,
    reason: `7 days has only ${Math.round(shortest)} ${resultLabel}; even 30 days (${Math.round(events)}) is below the ${required} needed to read confidently.`,
  };
}
