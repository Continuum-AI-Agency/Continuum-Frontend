// FE read adapter for the persistent readiness panel (IMP-006 / FEAT-003).
// The persisted readiness is already delivered by the Brand Book read path
// (fetchBrandBook -> BrandBookResponse); this selector pulls it out and projects
// the compact ReadinessSummary via the shared contract. No new endpoint — the
// dashboard fetches the book in an RSC and passes it down to render the panel.

import {
  type BrandBookResponse,
  deriveReadinessSummary,
  type ReadinessAnalysis,
  type ReadinessSummary,
  readinessIsAssessable,
} from '@continuum/contracts';

export type { ReadinessBand, ReadinessSummary } from '@continuum/contracts';
export { deriveReadinessSummary } from '@continuum/contracts';

// Readiness lives on the assembled report layer, with a back-compat mirror on
// the top-level composite for older materialized books.
export function extractReadiness(
  book: BrandBookResponse | null | undefined,
): ReadinessAnalysis | null {
  if (!book) return null;
  return book.assembled?.report?.readiness ?? book.composite?.readiness ?? null;
}

/**
 * The book's readiness as the compact summary, or null when it was never scored (or could not be
 * assessed). `deriveReadinessSummary` gives an unscored readiness a score of 0 — right for a
 * prompt that only needs a number, wrong on screen: the Home printed "Readiness · 0" with a red
 * pip beside "Brand Book ready" while onboarding said "Not scored yet"
 * (PP-DT-C-unscored-readiness-shows-zero).
 */
export function selectReadinessSummary(
  book: BrandBookResponse | null | undefined,
): ReadinessSummary | null {
  const readiness = extractReadiness(book);
  if (!readiness || !readinessIsAssessable(readiness)) return null;
  return deriveReadinessSummary(readiness);
}
