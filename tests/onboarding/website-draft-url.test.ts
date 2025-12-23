import { expect, test } from "bun:test";

import { resolveWebsiteDraftUrl } from "@/lib/onboarding/websiteDraft";

test("resolveWebsiteDraftUrl returns null for short or invalid input", () => {
  expect(resolveWebsiteDraftUrl("")).toBeNull();
  expect(resolveWebsiteDraftUrl("ab")).toBeNull();
  expect(resolveWebsiteDraftUrl("not a url")).toBeNull();
  expect(resolveWebsiteDraftUrl("ftp://example.com")).toBeNull();
});

test("resolveWebsiteDraftUrl normalizes bare domains", () => {
  expect(resolveWebsiteDraftUrl("example.com")).toBe("https://example.com/");
});

test("resolveWebsiteDraftUrl preserves valid http(s) urls", () => {
  expect(resolveWebsiteDraftUrl("https://example.com")).toBe("https://example.com/");
  expect(resolveWebsiteDraftUrl("http://example.com/path")).toBe("http://example.com/path");
});
