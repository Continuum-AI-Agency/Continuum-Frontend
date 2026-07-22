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
export function ciUpperBound(item: {
  diagnostics?: { ci?: { cpa?: number | null; hi?: number | null } | null } | null;
}): number | null {
  const ci = item.diagnostics?.ci;
  return ci?.hi ?? ci?.cpa ?? null;
}

/** Largest CI upper bound across scored items, in display units. Never 0 (would
 *  divide the whole row to nothing), so callers can use it as a denominator. */
export function maxCiUpperBound(
  items: { diagnostics?: { ci?: { cpa?: number | null; hi?: number | null } | null } | null }[],
  denominatorMultiplier = 1,
): number {
  return (
    items.reduce(
      (max, item) => Math.max(max, (ciUpperBound(item) ?? 0) * denominatorMultiplier),
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
