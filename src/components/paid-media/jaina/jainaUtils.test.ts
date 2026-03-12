import { describe, expect, it } from "vitest";

import {
  extractRenderableFallbackFromReport,
  extractRenderableFallbackFromStructuredContent,
} from "./jainaUtils";

describe("extractRenderableFallbackFromStructuredContent", () => {
  it("extracts summary, sections, and recommendations from checkpoint json", () => {
    const content = JSON.stringify({
      checkpoint_report: {
        report_metadata: {
          title: "Weekly Summary",
        },
        blocks: [
          {
            category: "summary_breakdown",
            scope: "account",
            title: "Performance Summary",
            summary: "Account performance is stable with room to scale.",
            highlights: [
              {
                text: "ROAS improved by 12% week over week.",
              },
            ],
            actions: [
              {
                title: "Scale top campaign",
                rationale: "Best blend of spend and return this week.",
              },
            ],
            tables: [],
            cached_sources: [],
          },
        ],
      },
    });

    const fallback = extractRenderableFallbackFromStructuredContent(content);

    expect(fallback).toContain("Weekly Summary");
    expect(fallback).toContain("Performance Summary");
    expect(fallback).toContain("ROAS improved by 12%");
    expect(fallback).toContain("Scale top campaign");
  });
});

describe("extractRenderableFallbackFromReport", () => {
  it("extracts direct answer content", () => {
    const fallback = extractRenderableFallbackFromReport({
      type: "direct_answer",
      content: "Use broad match with CPA guardrails.",
    });

    expect(fallback).toBe("Use broad match with CPA guardrails.");
  });
});
