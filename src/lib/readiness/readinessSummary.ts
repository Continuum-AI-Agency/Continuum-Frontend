// FE read adapter for the persistent readiness panel (IMP-006 / FEAT-003).
// The persisted readiness is already delivered by the Brand Book read path
// (fetchBrandBook -> BrandBookResponse); this selector pulls it out and projects
// the compact ReadinessSummary via the shared contract. No new endpoint — the
// dashboard fetches the book in an RSC and passes it down to render the panel.

import {
  deriveReadinessSummary,
  type BrandBookResponse,
  type ReadinessAnalysis,
  type ReadinessSummary,
} from "@continuum/contracts";

export type { ReadinessSummary, ReadinessBand } from "@continuum/contracts";
export { deriveReadinessSummary } from "@continuum/contracts";

// Readiness lives on the assembled report layer, with a back-compat mirror on
// the top-level composite for older materialized books.
export function extractReadiness(
  book: BrandBookResponse | null | undefined,
): ReadinessAnalysis | null {
  if (!book) return null;
  return book.assembled?.report?.readiness ?? book.composite?.readiness ?? null;
}

export function selectReadinessSummary(
  book: BrandBookResponse | null | undefined,
): ReadinessSummary {
  return deriveReadinessSummary(extractReadiness(book));
}
