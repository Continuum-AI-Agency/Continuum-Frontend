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
