import { describe, expect, it } from "bun:test";

import { getProviderConnectionSummary, hasProviderConnections } from "./providerConnections";
import type { UserIntegrationAccount, UserIntegrationSummary } from "./userIntegrations";

function account(overrides: Partial<UserIntegrationAccount>): UserIntegrationAccount {
  return {
    id: "acct-1",
    name: "Account",
    status: "active",
    externalAccountId: "ext-1",
    provider: "google",
    platformKey: "youtube",
    createdAt: null,
    ...overrides,
  };
}

function summaryOf(groups: Record<string, UserIntegrationAccount[]>): UserIntegrationSummary {
  const withAccountsWrapper = Object.fromEntries(
    Object.entries(groups).map(([key, accounts]) => [key, { accounts }])
  );
  return withAccountsWrapper as unknown as UserIntegrationSummary;
}

describe("getProviderConnectionSummary / hasProviderConnections", () => {
  it("reports not connected and no account names when nothing is linked", () => {
    const summary = summaryOf({ youtube: [], googleAds: [] });

    const result = getProviderConnectionSummary(summary, "google");

    expect(result.connected).toBe(false);
    expect(result.accountNames).toEqual([]);
    expect(hasProviderConnections(summary, "google")).toBe(false);
  });

  it("collects distinct account names across groups for the same provider", () => {
    const summary = summaryOf({
      youtube: [account({ id: "a1", name: "Acme Channel", provider: "google", platformKey: "youtube" })],
      googleAds: [account({ id: "a2", name: "Acme Ads", provider: "google", platformKey: "googleAds" })],
    });

    const result = getProviderConnectionSummary(summary, "google");

    expect(result.connected).toBe(true);
    expect(result.accountNames.sort()).toEqual(["Acme Ads", "Acme Channel"]);
  });

  it("dedupes repeated account names for the same identity", () => {
    const summary = summaryOf({
      youtube: [account({ id: "a1", name: "duane@continuumai.agency", provider: "google" })],
      googleAds: [account({ id: "a2", name: "duane@continuumai.agency", provider: "google" })],
    });

    const result = getProviderConnectionSummary(summary, "google");

    expect(result.accountNames).toEqual(["duane@continuumai.agency"]);
  });

  it("treats meta and facebook as the same provider identity", () => {
    const summary = summaryOf({
      facebook: [account({ id: "a1", name: "Acme Page", provider: "meta", platformKey: "facebook" })],
    });

    expect(hasProviderConnections(summary, "facebook")).toBe(true);
    expect(getProviderConnectionSummary(summary, "facebook").accountNames).toEqual(["Acme Page"]);
  });

  it("does not cross-contaminate providers", () => {
    const summary = summaryOf({
      tiktok: [account({ id: "a1", name: "Acme TikTok", provider: "tiktok", platformKey: "tiktok" })],
    });

    expect(hasProviderConnections(summary, "google")).toBe(false);
    expect(getProviderConnectionSummary(summary, "x").accountNames).toEqual([]);
  });

  it("detects LinkedIn provider connections", () => {
    const summary = summaryOf({
      linkedin: [account({ id: "a1", name: "Acme LinkedIn", provider: "linkedin", platformKey: "linkedin" })],
    });

    expect(hasProviderConnections(summary, "linkedin")).toBe(true);
    expect(getProviderConnectionSummary(summary, "linkedin").accountNames).toEqual(["Acme LinkedIn"]);
  });
});
