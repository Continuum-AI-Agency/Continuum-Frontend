import { describe, expect, it } from "bun:test";

import type { ReadinessAnalysis, ReadinessFinding } from "./readiness";
import {
  deriveReadinessSummary,
  readinessBandForScore,
  readinessSummarySchema,
  sortReadinessFindings,
} from "./readiness-summary";

const DIMENSION = { score: 50, rationale: "n/a" };

function buildReadiness(overrides: Partial<ReadinessAnalysis> = {}): ReadinessAnalysis {
  return {
    overall_score: 60,
    dimensions: {
      value_proposition: DIMENSION,
      icp_clarity: DIMENSION,
      customer_pains: DIMENSION,
      success_metrics: DIMENSION,
      positioning: DIMENSION,
      messaging_coherence: DIMENSION,
      brand_identity: DIMENSION,
    },
    findings: [],
    generated_at: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

function finding(overrides: Partial<ReadinessFinding>): ReadinessFinding {
  return {
    dimension: "value_proposition",
    score: 40,
    severity: "medium",
    headline: "Headline",
    detail: "Detail",
    recommendation: "Do the thing",
    ...overrides,
  };
}

describe("readinessBandForScore", () => {
  it("maps score thresholds to bands (aligned with BrandScorecard buckets)", () => {
    expect(readinessBandForScore(0)).toBe("not_started");
    expect(readinessBandForScore(1)).toBe("needs_work");
    expect(readinessBandForScore(49)).toBe("needs_work");
    expect(readinessBandForScore(50)).toBe("developing");
    expect(readinessBandForScore(74)).toBe("developing");
    expect(readinessBandForScore(75)).toBe("ready");
    expect(readinessBandForScore(100)).toBe("ready");
  });
});

describe("sortReadinessFindings", () => {
  it("orders high severity before low and is non-mutating", () => {
    const low = finding({ severity: "low", headline: "low" });
    const high = finding({ severity: "high", headline: "high" });
    const input = [low, high];
    const sorted = sortReadinessFindings(input);
    expect(sorted.map((f) => f.headline)).toEqual(["high", "low"]);
    expect(input.map((f) => f.headline)).toEqual(["low", "high"]);
  });

  it("breaks severity ties by lower dimension score (tighter blocker first)", () => {
    const looser = finding({ severity: "high", score: 55, headline: "looser" });
    const tighter = finding({ severity: "high", score: 10, headline: "tighter" });
    const sorted = sortReadinessFindings([looser, tighter]);
    expect(sorted.map((f) => f.headline)).toEqual(["tighter", "looser"]);
  });
});

describe("deriveReadinessSummary", () => {
  it("projects score/band and the most-blocking finding into top_blocker + next_action", () => {
    const readiness = buildReadiness({
      overall_score: 82,
      findings: [
        finding({ severity: "low", headline: "minor", recommendation: "later" }),
        finding({
          severity: "high",
          headline: "Weak value proposition",
          recommendation: "Sharpen the one-liner",
        }),
      ],
    });
    const summary = deriveReadinessSummary(readiness);
    expect(summary).toEqual({
      score: 82,
      band: "ready",
      top_blocker: "Weak value proposition",
      next_action: "Sharpen the one-liner",
    });
    expect(readinessSummarySchema.safeParse(summary).success).toBe(true);
  });

  it("returns a not_started summary with null blocker/action for null readiness", () => {
    const summary = deriveReadinessSummary(null);
    expect(summary).toEqual({
      score: 0,
      band: "not_started",
      top_blocker: null,
      next_action: null,
    });
    expect(readinessSummarySchema.safeParse(summary).success).toBe(true);
  });

  it("has no blocker when the analysis carries no findings", () => {
    const summary = deriveReadinessSummary(buildReadiness({ overall_score: 55, findings: [] }));
    expect(summary.band).toBe("developing");
    expect(summary.top_blocker).toBeNull();
    expect(summary.next_action).toBeNull();
  });
});
