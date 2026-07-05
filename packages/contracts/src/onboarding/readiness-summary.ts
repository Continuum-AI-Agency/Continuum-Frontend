// Compact readiness projection for the persistent readiness panel (IMP-006 /
// FEAT-003): a single { score, band, top_blocker, next_action } shape derived
// from the persisted readinessAnalysisSchema. The full analysis (7 dimensions +
// findings) already lives in ./readiness and is persisted in
// brand_profiles.brand_report_readiness; this is a thin view-model over its
// `findings` (sorted by severity) so the dashboard can render a status +
// blocker + next-best-action without re-deriving the sort at every surface.

import { z } from "zod";

import type { ReadinessAnalysis, ReadinessFinding } from "./readiness";

// Band thresholds mirror the BrandScorecard color buckets (>=75 green, >=50
// yellow, >=1 red, 0 gray) so the readiness panel and the scorecard stay in
// visual lockstep.
export const readinessBandSchema = z.enum([
  "not_started",
  "needs_work",
  "developing",
  "ready",
]);
export type ReadinessBand = z.infer<typeof readinessBandSchema>;

export const readinessSummarySchema = z.object({
  score: z.number().int().min(0).max(100),
  band: readinessBandSchema,
  top_blocker: z.string().nullable(),
  next_action: z.string().nullable(),
});
export type ReadinessSummary = z.infer<typeof readinessSummarySchema>;

const SEVERITY_RANK: Record<ReadinessFinding["severity"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function readinessBandForScore(score: number): ReadinessBand {
  if (score >= 75) return "ready";
  if (score >= 50) return "developing";
  if (score >= 1) return "needs_work";
  return "not_started";
}

// Most-blocking finding first: higher severity wins, and within a severity the
// lower dimension score is the tighter blocker. Non-mutating.
export function sortReadinessFindings(
  findings: readonly ReadinessFinding[],
): ReadinessFinding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (bySeverity !== 0) return bySeverity;
    return a.score - b.score;
  });
}

export function deriveReadinessSummary(
  readiness: ReadinessAnalysis | null | undefined,
): ReadinessSummary {
  const score = readiness?.overall_score ?? 0;
  const [topBlocker] = sortReadinessFindings(readiness?.findings ?? []);
  return {
    score,
    band: readinessBandForScore(score),
    top_blocker: topBlocker?.headline ?? null,
    next_action: topBlocker?.recommendation ?? null,
  };
}
