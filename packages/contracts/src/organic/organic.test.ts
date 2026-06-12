import { describe, expect, it } from "bun:test";

import {
  organicMetricsSchema,
  organicPostBreakdownPointSchema,
  metricComparisonSchema,
  organicComputedInsightSchema,
  organicInsightsResponseSchema,
  organicAwarenessBlockSchema,
  organicAwarenessReportPayloadSchema,
  organicAwarenessReportSchema,
  youtubeContentTypeSchema,
  isYoutubeShortType,
} from "./index";

describe("organicMetricsSchema", () => {
  it("accepts a partial per-post metric bag with native hook rate fields", () => {
    const parsed = organicMetricsSchema.parse({
      reach: 1000,
      views: 1500,
      hookRate: 72.5,
      reelsSkipRate: 27.5,
      reelsAvgWatchTime: 4200,
    });
    expect(parsed.hookRate).toBe(72.5);
    expect(parsed.reelsSkipRate).toBe(27.5);
  });

  it("accepts an empty bag (all fields optional)", () => {
    expect(() => organicMetricsSchema.parse({})).not.toThrow();
  });

  it("rejects a non-numeric metric", () => {
    expect(() => organicMetricsSchema.parse({ reach: "lots" })).toThrow();
  });
});

describe("organicPostBreakdownPointSchema", () => {
  it("carries richer engagement deltas (likes/shares/saved)", () => {
    const parsed = organicPostBreakdownPointSchema.parse({
      date: "2026-06-10",
      views: 120,
      engagement: 30,
      likes: 18,
      shares: 4,
      saved: 8,
    });
    expect(parsed.likes).toBe(18);
    expect(parsed.saved).toBe(8);
  });

  it("rejects an hour out of range", () => {
    expect(() => organicPostBreakdownPointSchema.parse({ hour: 24 })).toThrow();
  });
});

describe("metricComparisonSchema", () => {
  it("requires current/previous/percentageChange", () => {
    expect(() =>
      metricComparisonSchema.parse({ current: 10, previous: 5, percentageChange: 100 }),
    ).not.toThrow();
    expect(() => metricComparisonSchema.parse({ current: 10 })).toThrow();
  });
});

describe("organicComputedInsightSchema", () => {
  it("parses an llm insight with optional per-post linkage (snake_case wire shape)", () => {
    const parsed = organicComputedInsightSchema.parse({
      category: "content",
      text: "Reels with strong hooks doubled views.",
      severity: "positive",
      source: "llm",
      recommendation: "Lead with motion in the first second.",
      estimated_impact: "+20% views",
      post_id: "17900000000000000",
    });
    expect(parsed.post_id).toBe("17900000000000000");
    expect(parsed.estimated_impact).toBe("+20% views");
  });

  it("rejects an unknown category", () => {
    expect(() =>
      organicComputedInsightSchema.parse({
        category: "virality",
        text: "x",
        severity: "neutral",
        source: "computed",
      }),
    ).toThrow();
  });
});

describe("organicInsightsResponseSchema", () => {
  it("validates the wire envelope", () => {
    const parsed = organicInsightsResponseSchema.parse({
      insights: [],
      generated_at: "2026-06-10T00:00:00.000Z",
      range: { preset: "last_7d" },
    });
    expect(parsed.insights).toEqual([]);
  });
});

describe("organicAwareness schemas", () => {
  it("parses a self-describing report payload", () => {
    const payload = {
      windowStart: "2026-06-03",
      windowEnd: "2026-06-10",
      summary: { posts: 12, reach: 50000, topHookRate: 81.2, lowHookCount: 3 },
      blocks: [
        { category: "summary", title: "This week", data: { reach: 50000 } },
        { category: "top_posts", title: "Best hooks", data: [{ id: "1", hookRate: 81.2 }] },
        { category: "narrative", title: "What changed", data: "Reels outperformed posts." },
      ],
    };
    expect(() => organicAwarenessReportPayloadSchema.parse(payload)).not.toThrow();

    const report = {
      brandId: "44444444-4444-4444-8444-444444444444",
      runId: "organic_acct1_last_7d_20260610",
      generatedAt: "2026-06-10T00:00:00.000Z",
      windowStart: "2026-06-03",
      windowEnd: "2026-06-10",
      payload,
    };
    expect(() => organicAwarenessReportSchema.parse(report)).not.toThrow();
  });

  it("requires category and title on a block", () => {
    expect(() => organicAwarenessBlockSchema.parse({ data: {} })).toThrow();
  });
});

describe("youtubeContentTypeSchema", () => {
  it("accepts the SHORTS and VIDEO discriminator literals", () => {
    expect(youtubeContentTypeSchema.parse("SHORTS")).toBe("SHORTS");
    expect(youtubeContentTypeSchema.parse("VIDEO")).toBe("VIDEO");
  });

  it("rejects anything that is not a known YouTube content type", () => {
    expect(() => youtubeContentTypeSchema.parse("VIDEO_ON_DEMAND")).toThrow();
    expect(() => youtubeContentTypeSchema.parse("shorts")).toThrow();
  });

  it("isYoutubeShortType is case-insensitive and null-safe", () => {
    expect(isYoutubeShortType("SHORTS")).toBe(true);
    expect(isYoutubeShortType("shorts")).toBe(true);
    expect(isYoutubeShortType("VIDEO")).toBe(false);
    expect(isYoutubeShortType(null)).toBe(false);
    expect(isYoutubeShortType(undefined)).toBe(false);
  });
});
