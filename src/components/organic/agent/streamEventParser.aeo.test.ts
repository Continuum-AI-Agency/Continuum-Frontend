import { describe, expect, it } from "bun:test";
import { parseOrganicStreamEvent } from "./streamEventParser";

describe("AEO stream parsing", () => {
  it("parses ui.aeo_snapshot_card into a UI card", () => {
    const parsed = parseOrganicStreamEvent({
      type: "ui.aeo_snapshot_card",
      data: {
        snapshotId: "snap_1",
        brandId: "brand_1",
        brandName: "Continuum",
        status: "completed",
        generatedAt: "2026-07-05T00:00:00.000Z",
        engine: "simulated_answer_engine",
        promptCount: 8,
        visibilityScore: 75,
        shareOfVoice: 50,
        sentimentSummary: { positive: 2, neutral: 5, negative: 0, mixed: 1 },
        topNarratives: ["AI marketing"],
        missingTopics: ["pricing"],
        competitors: [],
        citations: [],
        opportunities: [],
      },
    });

    expect(parsed.kind).toBe("uiCard");
    if (parsed.kind === "uiCard") {
      expect(parsed.card.type).toBe("aeo_snapshot");
    }
  });
});
