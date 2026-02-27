import { expect, test } from "bun:test";

import { resolveAuthRedirect } from "@/lib/auth/redirect";

const SITE_URL = "https://app.trycontinuum.ai";

test("resolveAuthRedirect accepts relative redirects", () => {
  const value = resolveAuthRedirect({
    requestedRedirect: "/invite/callback?token=abc&brand=123",
    siteUrl: SITE_URL,
    fallbackPath: "/dashboard",
  });

  expect(value).toBe("https://app.trycontinuum.ai/invite/callback?token=abc&brand=123");
});

test("resolveAuthRedirect accepts same-origin absolute redirects", () => {
  const value = resolveAuthRedirect({
    requestedRedirect: "https://app.trycontinuum.ai/invite/callback?token=abc&brand=123",
    siteUrl: SITE_URL,
    fallbackPath: "/dashboard",
  });

  expect(value).toBe("https://app.trycontinuum.ai/invite/callback?token=abc&brand=123");
});

test("resolveAuthRedirect rejects external redirects", () => {
  const value = resolveAuthRedirect({
    requestedRedirect: "https://malicious.example.com/phish",
    siteUrl: SITE_URL,
    fallbackPath: "/dashboard",
  });

  expect(value).toBe("https://app.trycontinuum.ai/dashboard");
});

test("resolveAuthRedirect falls back when redirect is missing", () => {
  const value = resolveAuthRedirect({
    requestedRedirect: undefined,
    siteUrl: SITE_URL,
    fallbackPath: "/callback",
  });

  expect(value).toBe("https://app.trycontinuum.ai/callback");
});
