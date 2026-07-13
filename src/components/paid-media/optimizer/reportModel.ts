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
    case 'kpi_mismatch':
      return {
        label: 'Held · different goal',
        hint: 'This ad set is bidding for a different result than the portfolio prices (for example messaging conversations in a portfolio measured on leads). Ranking them together would compare a cheap event against an expensive one and hand the budget to whichever is cheaper, so it is held instead. Move it to a portfolio that measures what it actually buys.',
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
    // --- Creative-level kinds. These name ONE AD inside the ad set, not the ad set. ---
    case 'pause_ad':
      return { label: 'Pause this ad', glyph: '⏸' };
    case 'variate_creative':
      return { label: 'Make variations of the winner', glyph: '✦' };
    case 'seed_experiment':
      return { label: 'Nothing to learn from — add variants', glyph: '⚗' };
    default:
      return { label: kind.replace(/_/g, ' '), glyph: '•' };
  }
}

/** The creative-level kinds: they are about ONE AD inside the ad set, and the row must show
 *  WHICH. An ad set with five creatives otherwise gives you five suspects and no defendant. */
export const CREATIVE_RECOMMENDATION_KINDS = new Set([
  'pause_ad',
  'variate_creative',
  'seed_experiment',
]);

/** Kinds the optimizer generates but CANNOT yet execute or track.
 *
 *  The engine emits these, `optimizer.recommendations` stores them (with the ad id and the
 *  generation seed), and the Meta pause/unpause writer exists and is tested — but nothing yet
 *  DRAINS an approved one into it, and no renewal task is opened for them. So approving one
 *  would set a status, do nothing, and leave a burning ad running while the queue looked
 *  handled. That is worse than not offering the button.
 *
 *  Until the drain + autopilot path land, they are SHOWN (the finding is real and useful on its
 *  own) and their action is disabled with an honest message. Delete an entry from this set in
 *  the PR that makes it executable — not before. */
export const NOT_YET_EXECUTABLE_KINDS = new Set([
  'pause_ad',
  'variate_creative',
  'seed_experiment',
]);

export function isExecutable(kind: string): boolean {
  return !NOT_YET_EXECUTABLE_KINDS.has(kind);
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
  // Generated and stored, not yet actionable. The button says so rather than pretending.
  if (kind === 'pause_ad') {
    return {
      approveLabel: 'Pause ad',
      advisory:
        'Not wired up yet — the optimizer can find this ad but cannot pause it for you. Pause it in Meta yourself for now.',
    };
  }
  if (kind === 'variate_creative' || kind === 'seed_experiment') {
    return {
      approveLabel: 'Open in Studio',
      advisory:
        'Not wired up yet — the brief below is real, but it does not open Studio for you yet. Take it there yourself for now.',
    };
  }
  return { approveLabel: 'Approve', advisory: null };
}

/** The reason a not-yet-executable action is refused, shown to the user verbatim. */
export function notImplementedMessage(kind: string): string {
  switch (kind) {
    case 'pause_ad':
      return 'Pausing an ad from here is not built yet. The finding is real — pause it in Meta and it will stop draining the ad set.';
    case 'variate_creative':
      return 'Generating variations from here is not built yet. Copy the brief and take it into AI Studio.';
    case 'seed_experiment':
      return 'Seeding an experiment from here is not built yet. Add a second creative to this ad set and the optimizer can start telling you which one works.';
    default:
      return 'This action is not built yet.';
  }
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

/** One-line legend making the observe↔recommend↔autopilot boundary explicit at the
 *  point a user reads a proposed reallocation. */
export function applyModeExplainer(applyMode: string | null | undefined): string {
  const mode = (applyMode ?? '').toLowerCase();
  if (mode === 'observe') {
    return 'Observe — soak tier. Ingest metrics and score every cycle; no Meta budget writes.';
  }
  if (mode === 'autopilot') {
    return 'Autopilot — budgets are applied automatically within guardrails. Use Stop to halt writes without leaving this mode.';
  }
  if (mode === 'recommend') {
    return 'Recommend — proposals only until a human applies. Promote from Observe when ready for human-in-the-loop.';
  }
  return 'Unknown apply mode.';
}

/** Dense pill metadata for the portfolio apply-mode identifier (ApplyModePill).
 *  Bottom→top tiers get distinct tones so autonomy is scannable next to mode/level chips. */
export function applyModePill(applyMode: string | null | undefined): {
  label: string;
  variant: 'muted' | 'violet' | 'success';
  indicator: 'info' | 'success' | 'warning';
} | null {
  switch ((applyMode ?? '').toLowerCase()) {
    case 'observe':
      return { label: 'Observe', variant: 'muted', indicator: 'info' };
    case 'recommend':
      return { label: 'Recommend', variant: 'violet', indicator: 'info' };
    case 'autopilot':
      return { label: 'Autopilot', variant: 'success', indicator: 'success' };
    default:
      return null;
  }
}
