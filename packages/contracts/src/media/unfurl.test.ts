import { describe, expect, it } from "bun:test";

import {
  unfurlMediaItemSchema,
  unfurlMediaRequestSchema,
  unfurlMediaResponseSchema,
} from "./unfurl";

describe("unfurlMediaRequestSchema", () => {
  it("accepts a valid http(s) url", () => {
    const parsed = unfurlMediaRequestSchema.safeParse({
      url: "https://www.linkedin.com/posts/example_activity-123",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing url", () => {
    expect(unfurlMediaRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a non-url string", () => {
    expect(unfurlMediaRequestSchema.safeParse({ url: "not a url" }).success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const parsed = unfurlMediaRequestSchema.safeParse({
      url: "https://example.com",
      follow: true,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("unfurlMediaItemSchema", () => {
  it("accepts an image item with optional dimensions and alt", () => {
    const parsed = unfurlMediaItemSchema.safeParse({
      kind: "image",
      url: "https://cdn.example.com/a.jpg",
      width: 1200,
      height: 630,
      alt: "a post image",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a minimal video item", () => {
    const parsed = unfurlMediaItemSchema.safeParse({
      kind: "video",
      url: "https://cdn.example.com/clip.mp4",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unsupported kind", () => {
    const parsed = unfurlMediaItemSchema.safeParse({
      kind: "audio",
      url: "https://cdn.example.com/a.mp3",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("unfurlMediaResponseSchema", () => {
  const valid = {
    source: {
      requestedUrl: "https://www.linkedin.com/posts/example",
      resolvedUrl: "https://www.linkedin.com/posts/example",
      title: "A post",
      ogType: "article",
      via: "direct" as const,
      provider: "linkedin",
    },
    items: [
      { kind: "image" as const, url: "https://cdn.example.com/a.jpg" },
    ],
    partial: true,
    notice: "Only one image could be extracted from this link.",
  };

  it("round-trips a fully-populated response", () => {
    const parsed = unfurlMediaResponseSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("requires the partial flag", () => {
    const { partial, ...withoutPartial } = valid;
    expect(unfurlMediaResponseSchema.safeParse(withoutPartial).success).toBe(false);
  });

  it("rejects an invalid via value", () => {
    const parsed = unfurlMediaResponseSchema.safeParse({
      ...valid,
      source: { ...valid.source, via: "puppeteer" },
    });
    expect(parsed.success).toBe(false);
  });
});
