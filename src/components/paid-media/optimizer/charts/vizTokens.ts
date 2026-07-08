// Shared visual-language tokens for the optimizer viz layer. Pure constants (no
// React) so every chart shares ONE color language for statuses / objectives /
// trajectory / confidence and one heat ramp, instead of re-deriving per component.
// All colors are semantic CSS vars so light/dark switch automatically. The pink
// --chart-5 / --brand-magenta is reserved for AI-generated insight labels, so it
// is never used for a structural status here.

/** Ad-set lifecycle status → categorical color. */
export const STATUS_COLOR: Record<string, string> = {
  active: 'var(--chart-1)',
  learning: 'var(--chart-4)',
  grace: 'var(--chart-2)',
  frozen: 'var(--muted-foreground)',
  flagged: 'var(--warning)',
  starved: 'var(--destructive)',
};

/** Optimization objective → categorical color (matches BudgetByObjective usage). */
export const OBJECTIVE_COLOR: Record<string, string> = {
  purchase: 'var(--chart-1)',
  lead: 'var(--chart-2)',
  signup: 'var(--chart-3)',
  app_install: 'var(--chart-4)',
  traffic: 'var(--chart-5)',
  awareness: 'var(--muted-foreground)',
};

/** Momentum trajectory → semantic feedback color. */
export const TRAJECTORY_COLOR: Record<string, string> = {
  positive: 'var(--success)',
  neutral: 'var(--muted-foreground)',
  negative: 'var(--destructive)',
};

export function statusColor(status: string | null | undefined): string {
  return STATUS_COLOR[(status ?? '').toLowerCase()] ?? 'var(--muted-foreground)';
}

export function objectiveColor(objective: string | null | undefined): string {
  return OBJECTIVE_COLOR[(objective ?? '').toLowerCase()] ?? 'var(--chart-1)';
}

export function trajectoryColor(state: string | null | undefined): string {
  return TRAJECTORY_COLOR[(state ?? '').toLowerCase()] ?? 'var(--muted-foreground)';
}

/**
 * Step-conversion heat fill for funnel segments on the semantic bad→good ramp:
 * rate 1 (great conversion) = `--success`, rate 0 (poor) = `--destructive`.
 * Token-driven via color-mix so it adapts to light/dark; kept at a moderate alpha
 * so a value label overlaid on the segment stays legible (≥4.5:1). Mirrors the
 * `cpaHeatFill` ramp in chartScale but oriented so HIGHER is better (conversion),
 * where CPA is oriented so LOWER is better.
 */
export function stepHeatFill(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return 'var(--muted)';
  const goodPct = Math.round(Math.max(0, Math.min(1, rate)) * 100);
  const tone = `color-mix(in oklab, var(--destructive), var(--success) ${goodPct}%)`;
  return `color-mix(in srgb, ${tone} 60%, transparent)`;
}

/** Confidence band → the accent used for the radar polygon / gauge fill. */
export function confidenceColor(band: string | null | undefined): string {
  const normalized = (band ?? '').toLowerCase();
  if (normalized === 'high') return 'var(--success)';
  if (normalized === 'low') return 'var(--destructive)';
  return 'var(--chart-1)';
}
