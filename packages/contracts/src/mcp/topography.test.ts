import { describe, expect, it } from "bun:test";

import {
  brandTopographySchema,
  topographyAccountSchema,
  topographyAdAccountSchema,
} from "./topography";

describe("topographyAccountSchema", () => {
  it("accepts optional per-account capabilities", () => {
    const parsed = topographyAccountSchema.parse({
      account_id: "a1",
      platform: "instagram",
      capabilities: ["publish", "insights"],
    });
    expect(parsed.capabilities).toEqual(["publish", "insights"]);
  });

  it("omits capabilities when absent", () => {
    const parsed = topographyAccountSchema.parse({ account_id: "a1", platform: "instagram" });
    expect(parsed.capabilities).toBeUndefined();
  });
});

describe("topographyAdAccountSchema", () => {
  it("requires a paid platform + external account id", () => {
    const parsed = topographyAdAccountSchema.parse({
      platform: "meta_ads",
      account_id: "act_123",
      name: "Acme Ads",
      status: "ACTIVE",
      currency: "USD",
    });
    expect(parsed.platform).toBe("meta_ads");
    expect(parsed.account_id).toBe("act_123");
  });

  it("rejects an organic platform", () => {
    expect(() =>
      topographyAdAccountSchema.parse({ platform: "instagram", account_id: "act_1" }),
    ).toThrow();
  });
});

describe("brandTopographySchema", () => {
  it("accepts a read-only paid ad_accounts block", () => {
    const parsed = brandTopographySchema.parse({
      brand_id: "b1",
      depth: "accounts",
      platforms: [{ platform: "instagram", linked: true, account_count: 1 }],
      ad_accounts: [{ platform: "meta_ads", account_id: "act_123", name: "Acme" }],
    });
    expect(parsed.ad_accounts).toHaveLength(1);
    expect(parsed.ad_accounts?.[0].account_id).toBe("act_123");
  });

  it("treats ad_accounts as optional (platforms-only depth)", () => {
    const parsed = brandTopographySchema.parse({
      brand_id: "b1",
      depth: "platforms",
      platforms: [],
    });
    expect(parsed.ad_accounts).toBeUndefined();
  });
});
