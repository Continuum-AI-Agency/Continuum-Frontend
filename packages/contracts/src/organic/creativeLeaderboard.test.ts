import { describe, expect, it } from "bun:test";

import { organicCreativeRowSchema } from "./creativeLeaderboard";

describe("organicCreativeRowSchema", () => {
  it("parses a fully-joined creative row", () => {
    const parsed = organicCreativeRowSchema.parse({
      id: "post_1",
      name: "Founder POV reel",
      permalink: "https://instagram.com/p/x",
      mediaType: "REEL",
      thumbnailUrl: "https://cdn.example.com/x.jpg",
      metricLabel: "reach",
      metricValue: 48000,
      hookRate: 32,
      vsAveragePct: 110,
      insightLine: "32% hook rate · 2.1× your average",
    });
    expect(parsed.metricLabel).toBe("reach");
    expect(parsed.metricValue).toBe(48000);
  });

  it("parses a minimal row with metric only", () => {
    const parsed = organicCreativeRowSchema.parse({
      id: "p",
      name: "Post",
      metricLabel: "views",
      metricValue: 100,
    });
    expect(parsed.hookRate).toBeUndefined();
  });

  it("rejects an unknown metric label", () => {
    const result = organicCreativeRowSchema.safeParse({
      id: "p",
      name: "Post",
      metricLabel: "likes",
      metricValue: 1,
    });
    expect(result.success).toBe(false);
  });
});
