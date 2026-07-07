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
        hint: 'Budget is managed at the campaign level (CBO or lifetime) — the optimizer does not touch it.',
      };
    default:
      if (reason) return { label: 'Held', hint: 'Budget left unchanged on purpose this cycle.' };
      return null;
  }
}

/** Recommendation kind → a short human label + glyph for the actions queue. */
export function recommendationLabel(kind: string): { label: string; glyph: string } {
  switch (kind) {
    case 'pause':
      return { label: 'Pause', glyph: '◫' };
    case 'creative_refresh':
      return { label: 'Refresh creative', glyph: '🎨' };
    case 'audience_expand':
      return { label: 'Expand audience', glyph: '👥' };
    default:
      return { label: kind.replace(/_/g, ' '), glyph: '•' };
  }
}
