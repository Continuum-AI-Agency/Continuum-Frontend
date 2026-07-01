import { describe, expect, it } from "bun:test";

import {
  competitorAdAnalysisSchema,
  competitorSchema,
  instagramCompetitorSearchResultSchema,
  competitorSearchResultSchema,
  competitorOrganicPostSchema,
  timelineEntrySchema,
  adLifecycleEventSchema,
} from "./index";
import { competitorSpyStreamFrameSchema } from "../streaming/competitor-spy";
import { runCompetitorAdsQuery, type CompetitorAdsQueryDeps, type CompetitorAdsQueryInput } from "./adsQuery";
import {
  runCompetitorOrganicQuery,
  type CompetitorOrganicQueryDeps,
  type CompetitorOrganicQueryInput,
} from "./organicQuery";

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

  it("accepts public Ad Library metadata for rankable display signals", () => {
    const parsed = timelineEntrySchema.parse({
      snapshotId: "11111111-1111-4111-8111-111111111111",
      competitorId: "22222222-2222-4222-8222-222222222222",
      competitorName: "Acme",
      competitorSlug: "acme",
      sourceAdId: "abc",
      firstSeenAt: "2026-06-01T00:00:00.000Z",
      lastSeenAt: "2026-06-04T00:00:00.000Z",
      status: "active",
      snapshotUrl: "https://www.facebook.com/ads/library/?id=abc",
      imageUrl: null,
      body: "Buy our thing",
      cta: "Shop now",
      platforms: ["instagram", "facebook"],
      deliveryStart: "2026-05-30T00:00:00.000Z",
      deliveryStop: null,
      publicMetadata: {
        sourceAdId: "abc",
        pageId: "123",
        pageName: "Acme",
        linkTitle: "Summer offer",
        linkCaption: "acme.example",
        snapshotUrl: "https://www.facebook.com/ads/library/?id=abc",
        creationTime: "2026-05-29T00:00:00.000Z",
        deliveryStart: "2026-05-30T00:00:00.000Z",
        deliveryStop: null,
        firstSeenAt: "2026-06-01T00:00:00.000Z",
        lastSeenAt: "2026-06-04T00:00:00.000Z",
        fetchedAt: "2026-06-04T00:00:00.000Z",
        observedActiveDays: 3,
        platforms: ["instagram", "facebook"],
        languages: ["en"],
      },
    });
    expect(parsed.publicMetadata?.observedActiveDays).toBe(3);
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
      { type: "paid_page_resolved", data: { competitorId: "c1", competitorName: "Acme", pageId: "123", pageName: "Acme", confidence: 0.96 } },
      { type: "paid_page_needs_review", data: { competitorId: "c1", competitorName: "Acme", candidates: 3 } },
      { type: "competitor_skipped", data: { competitorId: "c1", competitorName: "Acme", reason: "missing_meta_page_id" } },
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
  it("accepts optional Instagram identity fields", () => {
    const parsed = competitorSchema.parse({
      id: "55555555-5555-4555-8555-555555555555",
      brandId: "66666666-6666-4666-8666-666666666666",
      name: "Acme",
      slug: "acme",
      source: "user",
      metaPageId: "123",
      instagramUsername: "acme",
      instagramUserId: "17841400000000000",
      instagramName: "Acme Co",
      instagramFollowersCount: 1200,
      status: "active",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(parsed.instagramUsername).toBe("acme");
  });

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

describe("instagramCompetitorSearchResultSchema", () => {
  it("validates an Instagram identity plus page candidates", () => {
    const parsed = instagramCompetitorSearchResultSchema.parse({
      query: "Apple",
      resolvedUsername: "apple",
      account: {
        id: "17841400000000000",
        username: "apple",
        name: "Apple",
        followersCount: 100,
        mediaCount: 10,
        profilePictureUrl: "https://example.com/apple.jpg",
      },
      posts: [
        {
          id: "ig-media-1",
          shortcode: "ABC123",
          permalink: "https://www.instagram.com/p/ABC123/",
          kind: "post",
          coverUrl: "https://example.com/cover.jpg",
          caption: "Think different.",
          timestamp: "2026-06-01T00:00:00+0000",
          likeCount: 1200,
          commentsCount: 34,
          mediaCount: 1,
          items: [{ kind: "image", url: "https://example.com/cover.jpg" }],
        },
      ],
      metaPageCandidates: [{ pageId: "123", pageName: "Apple" }],
      warnings: ["meta_page_search_failed"],
    });

    expect(parsed.account.username).toBe("apple");
    expect(parsed.metaPageCandidates[0]?.pageId).toBe("123");
  });
});

describe("competitorSearchResultSchema", () => {
  it("validates organic identity plus paid page resolution state", () => {
    const parsed = competitorSearchResultSchema.parse({
      query: "Apple",
      resolvedUsername: "apple",
      account: {
        id: "17841400000000000",
        username: "apple",
        name: "Apple",
        followersCount: 100,
        mediaCount: 10,
        profilePictureUrl: "https://example.com/apple.jpg",
      },
      posts: [],
      metaPageCandidates: [{ pageId: "123", pageName: "Apple" }],
      metaPageResolution: {
        status: "resolved",
        selectedPageId: "123",
        selectedPageName: "Apple",
        confidence: 0.95,
        candidates: [{ pageId: "123", pageName: "Apple", confidence: 0.95, reasons: ["exact match"], source: "deterministic" }],
        resolvedAt: "2026-06-01T00:00:00.000Z",
        error: null,
      },
      organicStatus: "ready",
      paidStatus: "ready",
      warnings: [],
    });
    expect(parsed.metaPageResolution.selectedPageId).toBe("123");
  });
});

describe("competitorOrganicPostSchema", () => {
  it("validates an organic Instagram post tied to a tracked competitor", () => {
    const parsed = competitorOrganicPostSchema.parse({
      competitorId: "22222222-2222-4222-8222-222222222222",
      competitorName: "Apple",
      instagramUsername: "apple",
      post: {
        id: "ig-media-1",
        shortcode: "ABC123",
        permalink: "https://www.instagram.com/p/ABC123/",
        kind: "post",
        coverUrl: "https://example.com/cover.jpg",
        caption: "Think different.",
        timestamp: "2026-06-01T00:00:00+0000",
        likeCount: 1200,
        commentsCount: 34,
        mediaCount: 1,
        items: [{ kind: "image", url: "https://example.com/cover.jpg" }],
      },
    });

    expect(parsed.post.caption).toBe("Think different.");
    expect(parsed.post.likeCount).toBe(1200);
  });
});

// Bug #160: intel_competitor_ads/intel_competitor_organic previously returned a
// bare `{count:0, ads:[]}` for a brand with zero TRACKED competitors —
// indistinguishable from "tracked, but nothing synced yet". These cores now
// surface `trackedCompetitorCount` as that distinguishing signal.
describe("runCompetitorAdsQuery trackedCompetitorCount signal", () => {
  const baseInput: CompetitorAdsQueryInput = {
    brandId: "22222222-2222-4222-8222-222222222222",
    sort: "last_seen_at",
    dir: "desc",
    limit: 20,
  };

  it("reports zero tracked competitors distinctly from zero synced ads", async () => {
    const deps: CompetitorAdsQueryDeps = {
      queryTimeline: async () => [],
      countTrackedCompetitors: async () => 0,
    };
    const result = await runCompetitorAdsQuery(deps, baseInput);
    expect(result).toEqual({ count: 0, ads: [], trackedCompetitorCount: 0 });
  });

  it("reports tracked competitors even when no ad snapshots have synced yet", async () => {
    const deps: CompetitorAdsQueryDeps = {
      queryTimeline: async () => [],
      countTrackedCompetitors: async () => 3,
    };
    const result = await runCompetitorAdsQuery(deps, baseInput);
    expect(result).toEqual({ count: 0, ads: [], trackedCompetitorCount: 3 });
  });
});

describe("runCompetitorOrganicQuery trackedCompetitorCount signal", () => {
  const baseInput: CompetitorOrganicQueryInput = {
    brandId: "22222222-2222-4222-8222-222222222222",
    limit: 12,
  };

  it("reports zero tracked competitors distinctly from zero synced posts", async () => {
    const deps: CompetitorOrganicQueryDeps = {
      listTrackedInstagramPosts: async () => [],
      countTrackedCompetitors: async () => 0,
    };
    const result = await runCompetitorOrganicQuery(deps, baseInput);
    expect(result).toEqual({ count: 0, posts: [], trackedCompetitorCount: 0 });
  });

  it("reports tracked competitors even when no organic posts have synced yet", async () => {
    const deps: CompetitorOrganicQueryDeps = {
      listTrackedInstagramPosts: async () => [],
      countTrackedCompetitors: async () => 2,
    };
    const result = await runCompetitorOrganicQuery(deps, baseInput);
    expect(result).toEqual({ count: 0, posts: [], trackedCompetitorCount: 2 });
  });
});
