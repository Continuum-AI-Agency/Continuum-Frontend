import { describe, expect, it } from "bun:test";

import { COMING_SOON_PROVIDER_GROUPS, isProviderComingSoon } from "./platformIcons";

describe("isProviderComingSoon", () => {
  it("treats X as coming soon", () => {
    expect(isProviderComingSoon("x")).toBe(true);
  });

  it("treats live providers as available", () => {
    expect(isProviderComingSoon("facebook")).toBe(false);
    expect(isProviderComingSoon("google")).toBe(false);
    expect(isProviderComingSoon("tiktok")).toBe(false);
  });

  it("returns false for unknown provider strings", () => {
    expect(isProviderComingSoon("instagram")).toBe(false);
    expect(isProviderComingSoon("")).toBe(false);
  });

  it("matches the coming-soon set", () => {
    expect(COMING_SOON_PROVIDER_GROUPS.has("x")).toBe(true);
    expect(COMING_SOON_PROVIDER_GROUPS.size).toBe(1);
  });
});
