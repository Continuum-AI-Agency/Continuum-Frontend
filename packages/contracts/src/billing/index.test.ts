import { describe, expect, it } from "bun:test";

import {
  emptyEntitlements,
  entitlementsSchema,
  findUsageBucket,
  hasAddOn,
  hasProduct,
  hasProviderAccess,
  providerAddOn,
  type Entitlements,
} from "./index";

const BRAND_ID = "11111111-1111-4111-8111-111111111111";

function makeEntitlements(overrides: Partial<Entitlements> = {}): Entitlements {
  return { ...emptyEntitlements(BRAND_ID), ...overrides };
}

describe("entitlementsSchema", () => {
  it("parses a minimal payload and defaults trendsTier/buckets", () => {
    const parsed = entitlementsSchema.parse({
      brandId: BRAND_ID,
      planCode: "organic_studio",
      status: "active",
      products: ["studio", "organic_agent"],
      addons: [],
    });
    expect(parsed.trendsTier).toBeNull();
    expect(parsed.buckets).toEqual([]);
  });

  it("rejects an unknown product", () => {
    const result = entitlementsSchema.safeParse({
      brandId: BRAND_ID,
      planCode: "x",
      status: "active",
      products: ["not_a_product"],
      addons: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("hasProduct / hasAddOn", () => {
  it("is membership-based and ignores subscription status (admin override case)", () => {
    const ent = makeEntitlements({ status: "inactive", products: ["paid_media"] });
    expect(hasProduct(ent, "paid_media")).toBe(true);
    expect(hasProduct(ent, "studio")).toBe(false);
  });

  it("checks add-on membership", () => {
    const ent = makeEntitlements({ addons: ["provider_exa"] });
    expect(hasAddOn(ent, "provider_exa")).toBe(true);
    expect(hasAddOn(ent, "provider_apify")).toBe(false);
  });
});

describe("providerAddOn", () => {
  it("maps provider names to add-ons", () => {
    expect(providerAddOn("exa")).toBe("provider_exa");
    expect(providerAddOn("serpapi")).toBe("provider_serpapi");
    expect(providerAddOn("apify")).toBe("provider_apify");
    expect(providerAddOn("google_search")).toBeNull();
  });
});

describe("hasProviderAccess", () => {
  it("requires the trends product first", () => {
    const ent = makeEntitlements({ addons: ["provider_exa"] });
    expect(hasProviderAccess(ent, "exa")).toBe(false);
  });

  it("Trends Pro flips every provider on", () => {
    const ent = makeEntitlements({ products: ["trends"], trendsTier: "pro", addons: [] });
    expect(hasProviderAccess(ent, "exa")).toBe(true);
    expect(hasProviderAccess(ent, "serpapi")).toBe(true);
    expect(hasProviderAccess(ent, "apify")).toBe(true);
  });

  it("Trends base only grants individually-purchased providers", () => {
    const ent = makeEntitlements({
      products: ["trends"],
      trendsTier: "base",
      addons: ["provider_exa"],
    });
    expect(hasProviderAccess(ent, "exa")).toBe(true);
    expect(hasProviderAccess(ent, "apify")).toBe(false);
  });
});

describe("findUsageBucket", () => {
  it("returns the matching bucket or null", () => {
    const ent = makeEntitlements({
      buckets: [
        { bucket: "studio", includedUsd: 10, capUsd: null, consumedUsd: 2, overageAction: "bill" },
      ],
    });
    expect(findUsageBucket(ent, "studio")?.includedUsd).toBe(10);
    expect(findUsageBucket(ent, "agent")).toBeNull();
  });
});
