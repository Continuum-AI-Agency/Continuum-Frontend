// Shared scale helpers for the optimizer visualizations. Pure (no React) so the
// width/marker math and the heatmap ramp are unit-testable and shared once
// instead of re-derived per component (was duplicated across CpaConfidenceBar and
// ReallocationFlow).

/** Clamp value/max into a 0–100 percentage for CSS widths and marker offsets. */
export function pct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

/**
 * The value a row of CI bars must scale against: the widest UPPER BOUND in the
 * set, not the largest point estimate. `pct` clamps at 100, so scaling by the
 * point estimate silently amputates the right whisker of any ad set whose
 * interval runs past it — rendering the noisiest, least-fundable ad set as the
 * most certain-looking one. An interval that gets truncated is worse than no
 * interval, because it still claims to be one.
 */
type CiItem = {
  diagnostics?: {
    ci?: { cpa?: number | null; hi?: number | null; events?: number | null } | null;
  } | null;
};

export function ciUpperBound(item: CiItem): number | null {
  const ci = item.diagnostics?.ci;
  return ci?.hi ?? ci?.cpa ?? null;
}

/**
 * The spend behind an interval — cpa × events — once it holds at least one event; null under
 * one. A cost per result is spend ÷ a count of at least one, so no axis needs to reach past
 * it: since costInterval became Garwood's exact interval, ONE event already carries a finite
 * hi at 39.5× the estimate, which squeezed every other bar in the row to a fortieth of its
 * width (UX-chart-scale-one-event-interval). An axis stops here; the whisker keeps its real
 * upper bound and is clipped at the edge.
 */
export function intervalSpendCeiling(
  ci: { cpa?: number | null; events?: number | null } | null | undefined,
): number | null {
  const cpa = ci?.cpa;
  const events = ci?.events;
  if (cpa == null || events == null || !(cpa > 0) || !(events >= 1)) return null;
  return cpa * events;
}

/** The farthest an item may stretch a row's axis: its upper bound, capped at its spend. */
function plausibleUpperBound(item: CiItem): number | null {
  const hi = ciUpperBound(item);
  const ceiling = intervalSpendCeiling(item.diagnostics?.ci);
  return hi == null || ceiling == null ? hi : Math.min(hi, ceiling);
}

/** Largest plausible CI upper bound across scored items, in display units. Never 0 (would
 *  divide the whole row to nothing), so callers can use it as a denominator. */
export function maxCiUpperBound(items: CiItem[], denominatorMultiplier = 1): number {
  return (
    items.reduce(
      (max, item) => Math.max(max, (plausibleUpperBound(item) ?? 0) * denominatorMultiplier),
      0,
    ) || 1
  );
}

/**
 * CPA heatmap fill on the semantic good→bad ramp: ratio 0 = best (low CPA →
 * `--success`), 1 = worst (high CPA → `--destructive`). Token-driven via
 * color-mix so it adapts to light/dark automatically (replacing the old
 * theme-independent `hsl(140 - ratio*140 …)` ramp); the outer mix toward
 * transparent keeps a low-alpha tint so cell text stays ≥4.5:1. Returns
 * "transparent" for no-data cells.
 */
export function cpaHeatFill(ratio: number | null | undefined): string {
  if (ratio == null || Number.isNaN(ratio)) return 'transparent';
  const badPct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  const tone = `color-mix(in oklab, var(--success), var(--destructive) ${badPct}%)`;
  return `color-mix(in srgb, ${tone} 18%, transparent)`;
}
