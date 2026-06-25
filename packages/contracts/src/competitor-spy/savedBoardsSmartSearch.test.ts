import { describe, expect, it } from "bun:test";

import {
  competitorSmartSearchResultSchema,
  savedBoardSchema,
  savedItemSchema,
  saveItemRequestSchema,
} from "./index";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";
const ISO = "2026-06-24T00:00:00.000Z";

describe("competitorSmartSearchResultSchema", () => {
  it("parses grouped brands / ads / actions with ad counts", () => {
    const parsed = competitorSmartSearchResultSchema.parse({
      query: "energy",
      brands: [
        { competitorId: UUID_A, name: "Alani Nu", handle: "@alaninutrition", adCount: 124 },
        { competitorId: UUID_B, name: "Ghost", handle: "ghost", adCount: 38 },
      ],
      ads: [
        {
          snapshotId: UUID_C,
          competitorId: UUID_B,
          competitorName: "Ghost",
          body: "clean energy, zero sugar",
          status: "active",
          hasCreativeMedia: true,
        },
      ],
      actions: [{ kind: "track_new", query: "energy" }],
    });
    expect(parsed.brands[0]?.adCount).toBe(124);
    expect(parsed.ads[0]?.competitorName).toBe("Ghost");
    expect(parsed.actions[0]?.kind).toBe("track_new");
  });

  it("rejects an unknown action kind", () => {
    expect(() =>
      competitorSmartSearchResultSchema.parse({
        query: "x",
        brands: [],
        ads: [],
        actions: [{ kind: "delete_everything", query: "x" }],
      }),
    ).toThrow();
  });
});

describe("savedBoardSchema", () => {
  it("defaults itemCount to 0 for a fresh board", () => {
    const parsed = savedBoardSchema.parse({
      id: UUID_A,
      brandId: UUID_B,
      name: "Winners",
      createdAt: ISO,
      updatedAt: ISO,
    });
    expect(parsed.itemCount).toBe(0);
  });
});

describe("savedItemSchema", () => {
  it("parses a paid item carrying a denormalized payload", () => {
    const parsed = savedItemSchema.parse({
      id: UUID_A,
      boardId: UUID_B,
      brandId: UUID_C,
      competitorId: UUID_B,
      competitorName: "Ghost",
      kind: "paid",
      adSnapshotId: UUID_C,
      sourceRef: "ad-abc",
      hasCreativeMedia: true,
      payload: {
        title: "Ghost",
        caption: "Buy now",
        cta: "Shop now",
        observedActiveDays: 12,
        hook: "scarcity",
        themes: ["sale"],
      },
      addedAt: ISO,
    });
    expect(parsed.kind).toBe("paid");
    expect(parsed.payload.observedActiveDays).toBe(12);
  });
});

describe("saveItemRequestSchema", () => {
  it("accepts a paid save by snapshotId", () => {
    const parsed = saveItemRequestSchema.parse({ kind: "paid", snapshotId: UUID_A });
    expect(parsed.kind).toBe("paid");
  });

  it("accepts an organic save with a post payload", () => {
    const parsed = saveItemRequestSchema.parse({
      kind: "organic",
      competitorId: UUID_A,
      competitorName: "Apple",
      instagramUsername: "apple",
      post: {
        id: "ig-1",
        shortcode: "ABC123",
        permalink: "https://www.instagram.com/p/ABC123/",
        kind: "post",
        coverUrl: "https://example.com/cover.jpg",
        caption: "Think different.",
        likeCount: 1200,
        commentsCount: 34,
        mediaCount: 1,
        items: [{ kind: "image", url: "https://example.com/cover.jpg" }],
      },
    });
    expect(parsed.kind).toBe("organic");
  });

  it("rejects an organic save missing the post", () => {
    expect(() =>
      saveItemRequestSchema.parse({ kind: "organic", competitorId: UUID_A }),
    ).toThrow();
  });
});
