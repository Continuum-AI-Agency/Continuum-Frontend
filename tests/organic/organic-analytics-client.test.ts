import assert from "node:assert/strict";
import test from "node:test";

import { fetchOrganicAnalytics } from "../../src/lib/api/organicAnalytics.client";

test("fetchOrganicAnalytics calls new organic analytics route and parses payload", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    return new Response(
      JSON.stringify({
        platform: "instagram",
        accountId: "ig-1",
        brandId: "brand-1",
        integrationAccountId: "integration-1",
        range: {
          preset: "last_7d",
          since: "2026-02-01",
          until: "2026-02-07",
        },
        metrics: {
          reach: 120,
          views: 230,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }) as typeof fetch;

  try {
    const result = await fetchOrganicAnalytics({
      brandId: "brand-1",
      integrationAccountId: "integration-1",
      platform: "instagram",
      range: { preset: "last_7d" },
      scope: "posts",
    });

    assert.match(capturedUrl, /\/api\/organic-analytics\/instagram$/);
    assert.equal(capturedBody?.brandId, "brand-1");
    assert.equal(capturedBody?.integrationAccountId, "integration-1");
    assert.equal(capturedBody?.scope, "posts");
    assert.equal(result.platform, "instagram");
    assert.equal(result.metrics.reach, 120);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchOrganicAnalytics returns backend message when request fails", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Analytics unavailable" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        fetchOrganicAnalytics({
          brandId: "brand-1",
          integrationAccountId: "integration-1",
          platform: "facebook",
          range: { preset: "last_7d" },
        }),
      /Analytics unavailable/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
