// Narrows the LOOSE CycleRunReport (DB jsonb read model) into the typed rows the
// OptimizerTab renders. The report envelope stays loose per the "wire DTOs stay
// loose" contracts rule; this parses each row ONCE with the contracts row schemas
// instead of probing fields ad hoc. Every schema is `.loose()`, so unknown DB
// columns pass through untouched.

import {
  type CycleRunReport,
  type ParsedCycleRunReport,
  ParsedCycleRunReportSchema,
} from '@continuum/contracts';

export function parseReport(
  report: CycleRunReport | null | undefined,
): ParsedCycleRunReport | null {
  if (!report) return null;
  const parsed = ParsedCycleRunReportSchema.safeParse(report);
  if (parsed.success) return parsed.data;
  // A single malformed row must not blank the whole surface: fall back to an
  // empty-but-valid shape so the tab still renders its portfolio header.
  return {
    portfolio: null,
    latest_run: null,
    latest_items: [],
    recommendations: [],
    history: [],
  };
}

/** Confidence band → badge variant + label, tolerant of loose DB strings. */
export function confidenceBand(band: string | null | undefined): {
  variant: 'success' | 'secondary' | 'destructive';
  label: string;
} {
  const normalized = (band ?? '').toLowerCase();
  if (normalized === 'high') return { variant: 'success', label: 'High' };
  if (normalized === 'low') return { variant: 'destructive', label: 'Low' };
  return { variant: 'secondary', label: 'Medium' };
}

/** A cycle item's freeze reason → a labeled "Held" state. Returns null when the
 *  item was NOT held (budget was actually reallocated). Rendering this instead of
 *  a $0.00 change is the point: a held ad set was left unchanged ON PURPOSE, not
 *  scored to no-change. Tolerant of loose DB strings. */
export function freezeLabel(
  reason: string | null | undefined,
): { label: string; hint: string } | null {
  switch (reason) {
    case 'no_conversions':
      return {
        label: 'Held · no conversion signal',
        hint: 'Spending but no tracked conversions yet — budget left unchanged until signal arrives.',
      };
    case 'missing_window':
      return {
        label: 'Held · incomplete data',
        hint: 'Not enough trailing-window history to score reliably — held this cycle.',
      };
    case 'unsupported_budget':
      return {
        label: 'Held · CBO/lifetime',
        hint: 'Budget is managed at the campaign level (CBO or lifetime) — the optimizer does not touch it. Convert the campaign to ad-set budgets to optimize its ad sets.',
      };
    case 'lifetime_budget':
      return {
        label: 'Held · lifetime budget',
        hint: 'This campaign has a whole-flight lifetime budget, not a daily one. The optimizer paces and scores in daily terms, so it will not resize a flight it cannot reason about.',
      };
    default:
      if (reason) return { label: 'Held', hint: 'Budget left unchanged on purpose this cycle.' };
      return null;
  }
}

/** Split a cycle's items into the two guardrail states a human must act on.
 *
 *  'held'            — autopilot scored the change, but it exceeds max_change_pct_per_cycle,
 *                      so it was NOT written. Distinct from an engine freeze (freezeLabel),
 *                      where the item was never scored at all.
 *  'approved_pending'— a human approved it; the service's /apply/approved will execute it.
 *
 *  Everything else (applied / failed / skipped / null) needs no approval affordance. */
export function partitionHeldItems<T extends { apply_status?: string | null }>(
  items: T[],
): { held: T[]; approved: T[] } {
  return {
    held: items.filter((item) => item.apply_status === 'held'),
    approved: items.filter((item) => item.apply_status === 'approved_pending'),
  };
}

/** Recommendation kind → a short human label + glyph for the actions queue. */
export function recommendationLabel(kind: string): { label: string; glyph: string } {
  switch (kind) {
    case 'pause':
      // Advisory only — the optimizer never pauses an ad set on Meta (see recommendationActionCopy).
      return { label: 'Review · pause manually', glyph: '◫' };
    case 'creative_refresh':
      return { label: 'Refresh creative', glyph: '🎨' };
    case 'audience_expand':
      return { label: 'Expand audience', glyph: '👥' };
    default:
      return { label: kind.replace(/_/g, ' '), glyph: '•' };
  }
}

/** The action copy for a recommendation row. A `pause` is ADVISORY: approving it records
 *  the decision but never pauses the ad set on Meta, so the primary button must not read
 *  "Approve" (which implies execution). Fatigue kinds (creative_refresh / audience_expand)
 *  DO open a tracked renewal task, so "Approve" is honest there. */
export function recommendationActionCopy(kind: string): {
  approveLabel: string;
  advisory: string | null;
} {
  if (kind === 'pause') {
    return {
      approveLabel: 'Acknowledge',
      advisory:
        'Advisory — the optimizer never pauses ad sets. Pause it in Meta yourself; this only records your decision.',
    };
  }
  return { approveLabel: 'Approve', advisory: null };
}

/** Recommendation severity → the underline decoration color for the insight anchor.
 *  Tolerant of loose DB strings; a subtle cue, not the primary signal. */
export function severityTone(severity: string | null | undefined): string {
  switch ((severity ?? '').toLowerCase()) {
    case 'high':
      return 'decoration-destructive/60';
    case 'low':
      return 'decoration-muted-foreground/40';
    default:
      return 'decoration-muted-foreground/60';
  }
}

/** Ordinal for sorting the approval queue most-urgent-first (unknown sorts last). */
export function severityRank(severity: string | null | undefined): number {
  switch ((severity ?? '').toLowerCase()) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

/** Recommendation severity → a Badge variant so the queue shows urgency at a glance. */
export function severityBadgeVariant(
  severity: string | null | undefined,
): 'destructive' | 'warning' | 'muted' {
  switch ((severity ?? '').toLowerCase()) {
    case 'high':
      return 'destructive';
    case 'medium':
      return 'warning';
    default:
      return 'muted';
  }
}

/** One-line legend making the recommend↔autopilot boundary explicit at the point a
 *  user reads a proposed reallocation (today the distinction is only an implicit badge). */
export function applyModeExplainer(applyMode: string | null | undefined): string {
  return (applyMode ?? '').toLowerCase() === 'autopilot'
    ? 'Autopilot — budgets are applied automatically within guardrails; pauses always need your approval.'
    : 'Recommend — these are proposals; nothing changes automatically. Apply them below, or switch to Autopilot.';
}
