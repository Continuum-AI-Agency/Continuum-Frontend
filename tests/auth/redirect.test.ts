import { expect, test } from "bun:test";

import { buildAuthCallbackUrl, resolveAuthRedirect, resolveAuthRedirectPath } from "@/lib/auth/redirect";

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

test("resolveAuthRedirect accepts chat-link redirects", () => {
  const value = resolveAuthRedirectPath({
    requestedRedirect: "/link/slack?token=signed",
    siteUrl: SITE_URL,
    fallbackPath: "/dashboard",
  });

  expect(value).toBe("/link/slack?token=signed");
});

test("resolveAuthRedirect rejects external redirects", () => {
  const value = resolveAuthRedirect({
    requestedRedirect: "https://malicious.example.com/phish",
    siteUrl: SITE_URL,
    fallbackPath: "/dashboard",
  });

  expect(value).toBe("https://app.trycontinuum.ai/dashboard");
});

test("resolveAuthRedirect rejects protocol-relative redirects", () => {
  const value = resolveAuthRedirect({
    requestedRedirect: "//malicious.example.com/phish",
    siteUrl: SITE_URL,
    fallbackPath: "/dashboard",
  });

  expect(value).toBe("https://app.trycontinuum.ai/dashboard");
});

test("resolveAuthRedirect rejects unallowlisted internal paths", () => {
  const value = resolveAuthRedirectPath({
    requestedRedirect: "/api/private",
    siteUrl: SITE_URL,
    fallbackPath: "/dashboard",
  });

  expect(value).toBe("/dashboard");
});

test("resolveAuthRedirect falls back when redirect is missing", () => {
  const value = resolveAuthRedirect({
    requestedRedirect: undefined,
    siteUrl: SITE_URL,
    fallbackPath: "/callback",
  });

  expect(value).toBe("https://app.trycontinuum.ai/callback");
});

test("buildAuthCallbackUrl preserves safe next paths", () => {
  const value = buildAuthCallbackUrl({
    siteUrl: SITE_URL,
    next: "/invite/callback?token=abc&brand=123",
    provider: "google",
    context: "login",
  });

  expect(value).toBe(
    "https://app.trycontinuum.ai/auth/callback?next=%2Finvite%2Fcallback%3Ftoken%3Dabc%26brand%3D123&context=login&provider=google",
  );
});
