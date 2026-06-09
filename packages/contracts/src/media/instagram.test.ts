import { describe, expect, it } from "bun:test";

import {
  instagramAccountSchema,
  instagramPostSchema,
  instagramTopMediaRequestSchema,
  instagramTopMediaResponseSchema,
} from "./instagram";

const BRAND_ID = "22222222-2222-4222-8222-222222222222";

describe("instagramTopMediaRequestSchema", () => {
  it("accepts a brandId + username and applies the default limit", () => {
    const parsed = instagramTopMediaRequestSchema.safeParse({
      brandId: BRAND_ID,
      username: "nasa",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.limit).toBe(50);
  });

  it("rejects a missing username", () => {
    expect(instagramTopMediaRequestSchema.safeParse({ brandId: BRAND_ID }).success).toBe(false);
  });

  it("rejects a non-uuid brandId", () => {
    const parsed = instagramTopMediaRequestSchema.safeParse({ brandId: "nope", username: "nasa" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a limit above 50", () => {
    const parsed = instagramTopMediaRequestSchema.safeParse({
      brandId: BRAND_ID,
      username: "nasa",
      limit: 51,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const parsed = instagramTopMediaRequestSchema.safeParse({
      brandId: BRAND_ID,
      username: "nasa",
      cursor: "abc",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("instagramPostSchema", () => {
  const carousel = {
    id: "178414...",
    shortcode: "DZQFLpyG8eb",
    permalink: "https://www.instagram.com/p/DZQFLpyG8eb/",
    kind: "carousel" as const,
    coverUrl: "https://cdn.example.com/cover.jpg",
    mediaCount: 3,
    items: [
      { kind: "image" as const, url: "https://cdn.example.com/1.jpg" },
      { kind: "image" as const, url: "https://cdn.example.com/2.jpg" },
      { kind: "video" as const, url: "https://cdn.example.com/3.mp4" },
    ],
  };

  it("round-trips a carousel post", () => {
    expect(instagramPostSchema.safeParse(carousel).success).toBe(true);
  });

  it("accepts a null coverUrl", () => {
    expect(instagramPostSchema.safeParse({ ...carousel, coverUrl: null }).success).toBe(true);
  });

  it("rejects an unsupported post kind", () => {
    expect(instagramPostSchema.safeParse({ ...carousel, kind: "story" }).success).toBe(false);
  });
});

describe("instagramAccountSchema", () => {
  it("accepts nullable name and followersCount", () => {
    const parsed = instagramAccountSchema.safeParse({
      username: "nasa",
      name: null,
      followersCount: null,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("instagramTopMediaResponseSchema", () => {
  it("round-trips an account + posts response", () => {
    const parsed = instagramTopMediaResponseSchema.safeParse({
      account: { username: "nasa", name: "NASA", followersCount: 100000000 },
      posts: [
        {
          id: "1",
          shortcode: "SC1",
          permalink: "https://www.instagram.com/p/SC1/",
          kind: "reel",
          coverUrl: "https://cdn.example.com/cover.jpg",
          mediaCount: 1,
          items: [{ kind: "video", url: "https://cdn.example.com/reel.mp4" }],
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown keys (strict)", () => {
    const parsed = instagramTopMediaResponseSchema.safeParse({
      account: { username: "nasa", name: null, followersCount: null },
      posts: [],
      nextCursor: "abc",
    });
    expect(parsed.success).toBe(false);
  });
});
