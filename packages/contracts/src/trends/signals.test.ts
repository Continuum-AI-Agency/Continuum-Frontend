import { describe, expect, it } from "bun:test";

import {
  eventSignalSchema,
  questionSignalSchema,
  trendSignalSchema,
} from "./signals";

describe("trendSignalSchema", () => {
  it("parses a minimal trend and defaults isSelected/timesUsed", () => {
    const parsed = trendSignalSchema.parse({ id: "t1", title: "Matcha everything" });
    expect(parsed.isSelected).toBe(false);
    expect(parsed.timesUsed).toBe(0);
  });

  it("keeps the rich optional fields", () => {
    const parsed = trendSignalSchema.parse({
      id: "t2",
      title: "UGC unboxings",
      confidence: 0.82,
      platforms: ["instagram", "tiktok"],
      platformRecommendations: [{ platform: "tiktok", reason: "Native unboxing format" }],
      analysisTags: ["evidence_scored"],
    });
    expect(parsed.confidence).toBe(0.82);
    expect(parsed.platformRecommendations?.[0]?.platform).toBe("tiktok");
  });

  it("rejects a confidence above 1", () => {
    expect(trendSignalSchema.safeParse({ id: "t3", title: "x", confidence: 1.5 }).success).toBe(false);
  });
});

describe("eventSignalSchema", () => {
  it("parses an event with a date and opportunity", () => {
    const parsed = eventSignalSchema.parse({
      id: "e1",
      title: "Earth Day",
      date: "2026-04-22",
      opportunity: "Sustainability angle",
    });
    expect(parsed.date).toBe("2026-04-22");
  });
});

describe("questionSignalSchema", () => {
  it("parses an audience question with a platform distribution", () => {
    const parsed = questionSignalSchema.parse({
      id: "q1",
      question: "How do I store matcha?",
      platformDistribution: { instagram: 3, tiktok: 5 },
    });
    expect(parsed.platformDistribution?.tiktok).toBe(5);
  });
});
