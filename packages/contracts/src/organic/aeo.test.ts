import { describe, expect, it } from "bun:test";
import { aeoSnapshotCardSchema, runAeoSnapshotResponseSchema } from "./aeo";
import { organicStreamFrameSchema } from "../streaming/organic";

const snapshot = {
  snapshotId: "snap_1",
  brandId: "brand_1",
  brandName: "Continuum",
  status: "completed" as const,
  generatedAt: "2026-07-05T00:00:00.000Z",
  engine: "simulated_answer_engine",
  promptCount: 12,
  visibilityScore: 58,
  shareOfVoice: 42,
  sentimentSummary: { positive: 3, neutral: 7, negative: 1, mixed: 1 },
  topNarratives: ["workflow automation"],
  missingTopics: ["comparison pages"],
  competitors: [{ name: "Competitor", mentions: 4 }],
  citations: [{
    url: "https://example.com/page",
    domain: "example.com",
    title: "Example",
    sourceType: "third_party" as const,
  }],
  opportunities: [{
    id: "opp_1",
    type: "faq" as const,
    priority: "high" as const,
    title: "Publish buyer FAQ",
    rationale: "AI answers lack owned-source context.",
    suggestedAction: "Draft a crawlable FAQ for recurring purchase questions.",
    handoffTarget: "faq_brief" as const,
    sourcePrompts: ["Who is Continuum best for?"],
  }],
};

describe("AEO contracts", () => {
  it("parses the snapshot card payload", () => {
    expect(aeoSnapshotCardSchema.safeParse(snapshot).success).toBe(true);
  });

  it("parses a run response", () => {
    const parsed = runAeoSnapshotResponseSchema.safeParse({
      snapshot,
      promptResults: [{
        prompt: "Who is Continuum best for?",
        engine: "simulated_answer_engine",
        answer: "Continuum is best for marketing teams.",
        brandMentioned: true,
        brandPosition: 1,
        sentiment: "positive",
        competitorsMentioned: [],
        narrativeThemes: ["marketing operations"],
        citations: [],
      }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts ui.aeo_snapshot_card through the Organic stream union", () => {
    const parsed = organicStreamFrameSchema.safeParse({
      type: "ui.aeo_snapshot_card",
      data: snapshot,
    });
    expect(parsed.success).toBe(true);
  });
});
