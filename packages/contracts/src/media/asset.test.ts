import { describe, expect, it } from "bun:test";

import {
  adCreativeAnalysisSchema,
  boundingBoxSchema,
  detectedObjectSchema,
  mediaAnalysisResultSchema,
  mediaAssetSchema,
  mediaCollectionSchema,
  mediaSourceSchema,
} from "./asset";
import {
  mediaSearchRequestSchema,
  mediaSearchResponseSchema,
} from "./search";
import {
  ingestMediaInputSchema,
  mediaSearchResultsFrameSchema,
  searchMediaLibraryInputSchema,
  searchMediaLibraryOutputSchema,
} from "../streaming/media";

describe("boundingBoxSchema", () => {
  it("accepts a normalized 0..1 box", () => {
    expect(boundingBoxSchema.parse({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
    });
  });

  it("rejects out-of-range coordinates", () => {
    expect(boundingBoxSchema.safeParse({ x: 1.5, y: 0, width: 0.1, height: 0.1 }).success).toBe(
      false,
    );
  });
});

describe("detectedObjectSchema", () => {
  it("allows label-only objects", () => {
    expect(detectedObjectSchema.parse({ label: "person" })).toEqual({ label: "person" });
  });

  it("rejects empty labels", () => {
    expect(detectedObjectSchema.safeParse({ label: "" }).success).toBe(false);
  });
});

describe("adCreativeAnalysisSchema", () => {
  it("defaults array fields and isAd", () => {
    const parsed = adCreativeAnalysisSchema.parse({});
    expect(parsed.isAd).toBe(false);
    expect(parsed.valueProps).toEqual([]);
    expect(parsed.brandElements).toEqual([]);
  });
});

describe("mediaAnalysisResultSchema", () => {
  it("parses a full Gemini vision result", () => {
    const parsed = mediaAnalysisResultSchema.parse({
      title: "Wedding party on lawn",
      description: "A joyful group of people on a lush green lawn.",
      tags: ["wedding", "outdoor", "group"],
      detectedObjects: [{ label: "person", box: { x: 0.1, y: 0.1, width: 0.2, height: 0.5 } }],
      adCreativeAnalysis: { isAd: false },
    });
    expect(parsed.tags).toHaveLength(3);
    expect(parsed.detectedObjects[0].label).toBe("person");
  });

  it("defaults optional collections when omitted", () => {
    const parsed = mediaAnalysisResultSchema.parse({
      title: "x",
      description: "y",
    });
    expect(parsed.tags).toEqual([]);
    expect(parsed.detectedObjects).toEqual([]);
  });

  it("rejects missing description", () => {
    expect(mediaAnalysisResultSchema.safeParse({ title: "x" }).success).toBe(false);
  });
});

describe("mediaAssetSchema", () => {
  const base = {
    id: "a1",
    brandId: "b1",
    kind: "image",
    bucket: "media-library",
    storagePath: "b1/a1/photo.jpg",
    fileName: "photo.jpg",
    mimeType: "image/jpeg",
    source: "upload",
    status: "ready",
    createdAt: "2026-05-31T00:00:00Z",
    updatedAt: "2026-05-31T00:00:00Z",
  };

  it("parses a minimal asset with defaults", () => {
    const parsed = mediaAssetSchema.parse(base);
    expect(parsed.tags).toEqual([]);
    expect(parsed.detectedObjects).toEqual([]);
    expect(parsed.hasImageEmbedding).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(mediaAssetSchema.safeParse({ ...base, kind: "audio" }).success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(mediaAssetSchema.safeParse({ ...base, status: "queued" }).success).toBe(false);
  });
});

describe("mediaSourceSchema", () => {
  it("accepts the original sources plus the composited orphan-bucket sources", () => {
    expect(mediaSourceSchema.options).toEqual([
      "upload",
      "ai_generated",
      "backfill",
      "canvas",
      "inspiration",
      "hyperframe",
      "chat_upload",
      "clip",
    ]);
  });

  it("accepts a media asset registered from a competitor/inspiration bucket", () => {
    const parsed = mediaAssetSchema.safeParse({
      id: "a1",
      brandId: "b1",
      kind: "image",
      bucket: "competitor-ad-creatives",
      storagePath: "b1/snap/creative.jpg",
      fileName: "creative.jpg",
      mimeType: "image/jpeg",
      source: "inspiration",
      status: "ready",
      createdAt: "2026-06-14T00:00:00Z",
      updatedAt: "2026-06-14T00:00:00Z",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("mediaCollectionSchema", () => {
  it("defaults itemCount", () => {
    const parsed = mediaCollectionSchema.parse({
      id: "c1",
      brandId: "b1",
      name: "Wedding",
      kind: "manual",
      createdAt: "2026-05-31T00:00:00Z",
      updatedAt: "2026-05-31T00:00:00Z",
    });
    expect(parsed.itemCount).toBe(0);
  });
});

describe("mediaSearchRequestSchema", () => {
  it("requires query in text mode", () => {
    expect(
      mediaSearchRequestSchema.safeParse({ brandId: "b1", mode: "text" }).success,
    ).toBe(false);
  });

  it("accepts text mode with a query and applies defaults", () => {
    const parsed = mediaSearchRequestSchema.parse({
      brandId: "b1",
      mode: "text",
      query: "navy suits",
    });
    expect(parsed.limit).toBe(24);
    expect(parsed.threshold).toBeCloseTo(0.2);
  });

  it("requires similarToAssetId in similar mode", () => {
    expect(
      mediaSearchRequestSchema.safeParse({ brandId: "b1", mode: "similar" }).success,
    ).toBe(false);
    expect(
      mediaSearchRequestSchema.safeParse({
        brandId: "b1",
        mode: "similar",
        similarToAssetId: "a1",
      }).success,
    ).toBe(true);
  });
});

describe("mediaSearchResponseSchema", () => {
  it("parses results with similarity scores", () => {
    const parsed = mediaSearchResponseSchema.parse({
      mode: "text",
      items: [
        {
          asset: {
            id: "a1",
            brandId: "b1",
            kind: "image",
            bucket: "media-library",
            storagePath: "b1/a1/photo.jpg",
            fileName: "photo.jpg",
            mimeType: "image/jpeg",
            source: "upload",
            status: "ready",
            createdAt: "2026-05-31T00:00:00Z",
            updatedAt: "2026-05-31T00:00:00Z",
          },
          similarity: 0.82,
        },
      ],
    });
    expect(parsed.items[0].similarity).toBeCloseTo(0.82);
  });
});

describe("agent tool I/O", () => {
  it("defaults search limit", () => {
    expect(searchMediaLibraryInputSchema.parse({ query: "navy suits" }).limit).toBe(8);
  });

  it("parses search output items", () => {
    const parsed = searchMediaLibraryOutputSchema.parse({
      items: [{ assetId: "a1", tags: ["suit"], similarity: 0.7 }],
    });
    expect(parsed.items[0].assetId).toBe("a1");
  });

  it("defaults ingest role to reference", () => {
    expect(ingestMediaInputSchema.parse({ assetId: "a1" }).role).toBe("reference");
  });

  it("validates the media.search_results frame", () => {
    const frame = mediaSearchResultsFrameSchema.parse({
      type: "media.search_results",
      data: { query: "navy suits", mode: "text", items: [] },
    });
    expect(frame.type).toBe("media.search_results");
  });
});
