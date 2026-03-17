import { beforeEach, describe, expect, it, mock } from "bun:test";

const requestMock = mock(() => Promise.resolve({}));

mock.module("@/lib/api/http", () => ({
  http: {
    request: requestMock,
  },
}));

import {
  listProductCatalogLinks,
  removeCatalogProduct,
  renameCatalogProduct,
  upsertProductCatalogLink,
} from "@/lib/api/productCatalogLinks.client";

describe("productCatalogLinks.client", () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it("lists product/ad activity links for a catalog", async () => {
    requestMock.mockResolvedValue({
      links: [
        {
          activity: {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            brandId: "11111111-1111-4111-8111-111111111111",
            catalogId: "22222222-2222-4222-8222-222222222222",
            productId: "33333333-3333-4333-8333-333333333333",
            adObjectId: "44444444-4444-4444-8444-444444444444",
            isActive: true,
            firstSeenAt: "2026-03-14T10:00:00.000Z",
            lastSeenAt: "2026-03-14T10:30:00.000Z",
            activeFrom: "2026-03-14T10:00:00.000Z",
            activeTo: null,
            source: "sync",
            syncJobId: null,
            createdAt: "2026-03-14T10:00:00.000Z",
            updatedAt: "2026-03-14T10:30:00.000Z",
          },
          product: {
            id: "33333333-3333-4333-8333-333333333333",
            brandId: "11111111-1111-4111-8111-111111111111",
            catalogId: "22222222-2222-4222-8222-222222222222",
            externalProductId: "sku_123",
            title: "Weekend Hoodie",
            availability: "in_stock",
            imageUrl: null,
            productUrl: null,
            currency: null,
            createdAt: "2026-03-14T10:00:00.000Z",
            updatedAt: "2026-03-14T10:30:00.000Z",
          },
          adObject: {
            id: "44444444-4444-4444-8444-444444444444",
            brandId: "11111111-1111-4111-8111-111111111111",
            platform: "meta",
            objectType: "adset",
            externalObjectId: "adset_999",
            name: "Retargeting Ad Set",
            status: "ACTIVE",
            createdAt: "2026-03-14T10:00:00.000Z",
            updatedAt: "2026-03-14T10:30:00.000Z",
          },
        },
      ],
    });

    const result = await listProductCatalogLinks(
      "22222222-2222-4222-8222-222222222222",
      "11111111-1111-4111-8111-111111111111",
      { activeOnly: false }
    );

    expect(result).toHaveLength(1);
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/paid-media/product-catalogs/22222222-2222-4222-8222-222222222222/links?brandId=11111111-1111-4111-8111-111111111111&activeOnly=false",
        method: "GET",
      })
    );
  });

  it("upserts a product/ad activity link", async () => {
    requestMock.mockResolvedValue({
      link: {
        activity: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          brandId: "11111111-1111-4111-8111-111111111111",
          catalogId: "22222222-2222-4222-8222-222222222222",
          productId: "33333333-3333-4333-8333-333333333333",
          adObjectId: "44444444-4444-4444-8444-444444444444",
          isActive: true,
          firstSeenAt: "2026-03-14T10:00:00.000Z",
          lastSeenAt: "2026-03-14T10:30:00.000Z",
          activeFrom: "2026-03-14T10:00:00.000Z",
          activeTo: null,
          source: "sync",
          syncJobId: null,
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:30:00.000Z",
        },
        product: {
          id: "33333333-3333-4333-8333-333333333333",
          brandId: "11111111-1111-4111-8111-111111111111",
          catalogId: "22222222-2222-4222-8222-222222222222",
          externalProductId: "sku_123",
          title: "Weekend Hoodie",
          availability: "in_stock",
          imageUrl: null,
          productUrl: null,
          currency: "USD",
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:30:00.000Z",
        },
        adObject: {
          id: "44444444-4444-4444-8444-444444444444",
          brandId: "11111111-1111-4111-8111-111111111111",
          platform: "meta",
          objectType: "ad",
          externalObjectId: "ad_123",
          name: "Carousel Dynamic Ad",
          status: "ACTIVE",
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:30:00.000Z",
        },
      },
    });

    await upsertProductCatalogLink("22222222-2222-4222-8222-222222222222", {
      brandId: "11111111-1111-4111-8111-111111111111",
      product: {
        externalProductId: "sku_123",
        title: "Weekend Hoodie",
        availability: "in_stock",
        imageUrl: "",
        productUrl: "",
        currency: "usd",
      },
      adObject: {
        platform: "meta",
        objectType: "ad",
        externalObjectId: "ad_123",
        name: "Carousel Dynamic Ad",
        status: "ACTIVE",
      },
      activity: {
        isActive: true,
        source: "manual",
      },
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/paid-media/product-catalogs/22222222-2222-4222-8222-222222222222/links",
        method: "POST",
      })
    );
  });

  it("renames a catalog product", async () => {
    requestMock.mockResolvedValue({ success: true });

    await renameCatalogProduct("22222222-2222-4222-8222-222222222222", {
      brandId: "11111111-1111-4111-8111-111111111111",
      externalProductId: "sku_123",
      title: "Renamed Hoodie",
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/paid-media/product-catalogs/22222222-2222-4222-8222-222222222222/links",
        method: "PATCH",
      })
    );
  });

  it("removes a catalog product", async () => {
    requestMock.mockResolvedValue({ success: true });

    await removeCatalogProduct("22222222-2222-4222-8222-222222222222", {
      brandId: "11111111-1111-4111-8111-111111111111",
      externalProductId: "sku_123",
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/paid-media/product-catalogs/22222222-2222-4222-8222-222222222222/links",
        method: "DELETE",
      })
    );
  });
});
