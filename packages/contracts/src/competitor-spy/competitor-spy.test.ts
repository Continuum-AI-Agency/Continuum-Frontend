import { describe, expect, it } from "bun:test";

import {
  competitorAdAnalysisSchema,
  competitorSchema,
  timelineEntrySchema,
  adLifecycleEventSchema,
} from "./index";
import { competitorSpyStreamFrameSchema } from "../streaming/competitor-spy";

describe("competitorAdAnalysisSchema", () => {
  it("parses a full analysis object and applies defaults", () => {
    const parsed = competitorAdAnalysisSchema.parse({
      sentiment: "urgent",
      sentimentScore: 0.4,
      hook: "Last chance for 50% off",
      hookArchetype: "scarcity",
      primaryTheme: "seasonal_sale",
      visualStyle: "bold high-contrast product shot",
      targetAudienceSignal: "deal-seekers",
      format: "image",
      headline: "Summer Sale",
      primaryText: "Ends tonight",
      callToAction: "Shop now",
      textOverlay: "50% OFF",
    });
    expect(parsed.themes).toEqual([]);
    expect(parsed.valueProps).toEqual([]);
    expect(parsed.isAd).toBe(true);
    expect(parsed.analyzedFromImage).toBe(false);
  });

  it("rejects an out-of-range sentiment score", () => {
    expect(() =>
      competitorAdAnalysisSchema.parse({
        sentiment: "neutral",
        sentimentScore: 2,
        hook: null,
        hookArchetype: null,
        primaryTheme: null,
        visualStyle: null,
        targetAudienceSignal: null,
        format: null,
        headline: null,
        primaryText: null,
        callToAction: null,
        textOverlay: null,
      }),
    ).toThrow();
  });
});

describe("timelineEntrySchema v2 fields", () => {
  it("accepts a v1-shaped row without the optional v2 fields", () => {
    const entry = {
      snapshotId: "11111111-1111-4111-8111-111111111111",
      competitorId: "22222222-2222-4222-8222-222222222222",
      competitorName: "Acme",
      competitorSlug: "acme",
      sourceAdId: "abc",
      firstSeenAt: "2026-06-01T00:00:00.000Z",
      lastSeenAt: "2026-06-02T00:00:00.000Z",
      status: "active",
      snapshotUrl: "https://www.facebook.com/ads/library/?id=abc",
      imageUrl: null,
      body: "Buy our thing",
      cta: "Shop now",
      platforms: ["instagram", "facebook"],
      deliveryStart: null,
      deliveryStop: null,
    };
    expect(() => timelineEntrySchema.parse(entry)).not.toThrow();
  });
});

describe("adLifecycleEventSchema", () => {
  it("validates a new_ad event", () => {
    const parsed = adLifecycleEventSchema.parse({
      id: "33333333-3333-4333-8333-333333333333",
      brandId: "44444444-4444-4444-8444-444444444444",
      competitorId: "22222222-2222-4222-8222-222222222222",
      snapshotId: "11111111-1111-4111-8111-111111111111",
      sourceAdId: "abc",
      eventType: "new_ad",
      eventAt: "2026-06-02T00:00:00.000Z",
      priorStatus: null,
      newStatus: "active",
    });
    expect(parsed.eventType).toBe("new_ad");
  });
});

describe("competitorSpyStreamFrameSchema", () => {
  it("discriminates on type across the union", () => {
    const frames = [
      { type: "competitor_started", data: { competitorId: "c1", competitorName: "Acme", index: 0, total: 3 } },
      { type: "snapshot_diff", data: { competitorId: "c1", fetched: 10, inserted: 4, updated: 6, lifecycleEvents: 4 } },
      { type: "media_extracted", data: { snapshotId: "s1", status: "stored" } },
      { type: "creative_analyzed", data: { snapshotId: "s1", sourceAdId: "abc", sentiment: "urgent", hookArchetype: "scarcity", primaryTheme: "sale", analyzedFromImage: true } },
      { type: "run_completed", data: { runId: "run_1", competitorsProcessed: 3, snapshotsInserted: 4, snapshotsUpdated: 6, analysisCompleted: 10, durationMs: 1234 } },
      { type: "run_error", data: { message: "boom" } },
    ];
    for (const frame of frames) {
      expect(() => competitorSpyStreamFrameSchema.parse(frame)).not.toThrow();
    }
  });

  it("rejects an unknown frame type", () => {
    expect(() =>
      competitorSpyStreamFrameSchema.parse({ type: "nope", data: {} }),
    ).toThrow();
  });
});

describe("competitorSchema", () => {
  it("requires a uuid brandId", () => {
    expect(() =>
      competitorSchema.parse({
        id: "55555555-5555-4555-8555-555555555555",
        brandId: "not-a-uuid",
        name: "Acme",
        slug: "acme",
        source: "user",
        metaPageId: null,
        status: "active",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      }),
    ).toThrow();
  });
});
