import { describe, it, expect } from "bun:test";
import { mapIntegrationTypeToPlatformKey } from "./platform";

describe("mapIntegrationTypeToPlatformKey", () => {
  it("maps the backend ads_customer write-side type to googleAds", () => {
    // The OAuth enrichment persists Google Ads accounts as `ads_customer`; the
    // brand-side reader must bucket that under googleAds, not drop it.
    expect(mapIntegrationTypeToPlatformKey("ads_customer")).toBe("googleAds");
  });

  it("still maps the google_ad_account family to googleAds", () => {
    expect(mapIntegrationTypeToPlatformKey("google_ad_account")).toBe("googleAds");
    expect(mapIntegrationTypeToPlatformKey("google_ads_customer")).toBe("googleAds");
  });

  it("is case/whitespace tolerant", () => {
    expect(mapIntegrationTypeToPlatformKey("  ADS_CUSTOMER ")).toBe("googleAds");
  });

  it("returns null for unknown or empty types", () => {
    expect(mapIntegrationTypeToPlatformKey("not_a_type")).toBeNull();
    expect(mapIntegrationTypeToPlatformKey(null)).toBeNull();
    expect(mapIntegrationTypeToPlatformKey(undefined)).toBeNull();
  });
});
