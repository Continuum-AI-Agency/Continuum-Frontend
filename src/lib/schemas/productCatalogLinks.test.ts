import { describe, expect, it } from "bun:test";

import { productCatalogLinkRecordSchema, toNullableText, upsertProductCatalogLinkSchema } from "@/lib/schemas/productCatalogLinks";

describe("upsertProductCatalogLinkSchema", () => {
  it("accepts valid product/ad object activity payload", () => {
    const parsed = upsertProductCatalogLinkSchema.parse({
      brandId: "11111111-1111-4111-8111-111111111111",
      product: {
        externalProductId: "sku_123",
        title: "Weekend Hoodie",
        availability: "in_stock",
      },
      adObject: {
        objectType: "adset",
        externalObjectId: "adset_999",
      },
      activity: {
        isActive: true,
        seenAt: "2026-03-14T12:30:00.000Z",
      },
    });

    expect(parsed.adObject.platform).toBe("meta");
    expect(parsed.activity.source).toBe("sync");
  });

  it("rejects invalid ad object type", () => {
    const result = upsertProductCatalogLinkSchema.safeParse({
      brandId: "11111111-1111-4111-8111-111111111111",
      product: {
        externalProductId: "sku_123",
      },
      adObject: {
        objectType: "creative",
        externalObjectId: "bad",
      },
      activity: {
        isActive: true,
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("productCatalogLinkRecordSchema", () => {
  it("parses a normalized link record", () => {
    const parsed = productCatalogLinkRecordSchema.parse({
      activity: {
        id: "22222222-2222-4222-8222-222222222222",
        brandId: "11111111-1111-4111-8111-111111111111",
        catalogId: "33333333-3333-4333-8333-333333333333",
        productId: "44444444-4444-4444-8444-444444444444",
        adObjectId: "55555555-5555-4555-8555-555555555555",
        isActive: true,
        firstSeenAt: "2026-03-14T12:00:00.000Z",
        lastSeenAt: "2026-03-14T12:30:00.000Z",
        activeFrom: "2026-03-14T12:00:00.000Z",
        activeTo: null,
        source: "sync",
        syncJobId: null,
        createdAt: "2026-03-14T12:00:00.000Z",
        updatedAt: "2026-03-14T12:30:00.000Z",
      },
      product: {
        id: "44444444-4444-4444-8444-444444444444",
        brandId: "11111111-1111-4111-8111-111111111111",
        catalogId: "33333333-3333-4333-8333-333333333333",
        externalProductId: "sku_123",
        title: "Weekend Hoodie",
        availability: "in_stock",
        imageUrl: null,
        productUrl: null,
        currency: "USD",
        createdAt: "2026-03-14T12:00:00.000Z",
        updatedAt: "2026-03-14T12:30:00.000Z",
      },
      adObject: {
        id: "55555555-5555-4555-8555-555555555555",
        brandId: "11111111-1111-4111-8111-111111111111",
        platform: "meta",
        objectType: "adset",
        externalObjectId: "adset_999",
        name: "Retargeting Set",
        status: "ACTIVE",
        createdAt: "2026-03-14T12:00:00.000Z",
        updatedAt: "2026-03-14T12:30:00.000Z",
      },
    });

    expect(parsed.activity.isActive).toBe(true);
  });
});

describe("toNullableText", () => {
  it("normalizes empty strings to null", () => {
    expect(toNullableText("   ")).toBeNull();
    expect(toNullableText("ready")).toBe("ready");
  });
});
