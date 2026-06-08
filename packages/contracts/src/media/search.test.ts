import { describe, expect, it } from "bun:test";

import { mediaSearchFiltersSchema, mediaSearchRequestSchema } from "./search";

describe("mediaSearchFiltersSchema", () => {
  it("accepts a source filter", () => {
    const parsed = mediaSearchFiltersSchema.safeParse({ source: "ai_generated" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.source).toBe("ai_generated");
  });

  it("accepts source + kind together", () => {
    const parsed = mediaSearchFiltersSchema.safeParse({ source: "upload", kind: "video" });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown source value", () => {
    const parsed = mediaSearchFiltersSchema.safeParse({ source: "scraped" });
    expect(parsed.success).toBe(false);
  });

  it("allows empty filters", () => {
    expect(mediaSearchFiltersSchema.safeParse({}).success).toBe(true);
  });
});

describe("mediaSearchRequestSchema with source filter", () => {
  it("threads source through a text search request", () => {
    const parsed = mediaSearchRequestSchema.safeParse({
      brandId: "brand-1",
      mode: "text",
      query: "sunset",
      filters: { source: "ai_generated", kind: "image" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.filters?.source).toBe("ai_generated");
      expect(parsed.data.filters?.kind).toBe("image");
    }
  });
});
