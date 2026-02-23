import assert from "node:assert/strict";
import test from "node:test";

import { fetchBrandInsights } from "../../src/lib/api/brandInsights.server.ts";
import { BRAND_TRENDS_SCHEMA } from "../../src/lib/schemas/brandInsights.ts";

function createInsightsResponse() {
  return new Response(
    JSON.stringify({
      status: "success",
      data: {
        status: "success",
        brand_id: "brand-123",
        generation_id: "gen-1",
        anchor_ts: "2026-02-23T00:00:00.000Z",
        windows_days: [7, 30],
        windows: [
          {
            days: 7,
            window_start: "2026-02-16T00:00:00.000Z",
            window_end: "2026-02-23T00:00:00.000Z",
            counts: {
              trends: 0,
              events: 0,
              questions: 0,
              generations: 1,
            },
            trends: [],
            events: [],
            questions: [],
            generations: [{ generation_id: "gen-1" }],
          },
        ],
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

test("fetchBrandInsights includes brand_trends schema header", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedMethod = "";
  let capturedBody: Record<string, unknown> | null = null;
  let capturedHeaders = new Headers();

  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedMethod = String(init?.method ?? "GET");
    capturedBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    capturedHeaders = new Headers(init?.headers as HeadersInit | undefined);
    return createInsightsResponse();
  }) as typeof fetch;

  try {
    const result = await fetchBrandInsights("brand-123");
    assert.equal(result.status, "success");
    assert.equal(result.data.generationId, "gen-1");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(capturedUrl, /\/api\/trends\/read$/);
  assert.equal(capturedMethod, "POST");
  assert.equal(capturedBody?.brand_id, "brand-123");
  assert.equal(capturedHeaders.get("x-supabase-schema"), BRAND_TRENDS_SCHEMA);
});

test("fetchBrandInsights falls back to legacy GET route when read endpoint returns 404", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  const methods: string[] = [];

  globalThis.fetch = (async (input, init) => {
    urls.push(String(input));
    methods.push(String(init?.method ?? "GET"));

    if (urls.length === 1) {
      return new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return createInsightsResponse();
  }) as typeof fetch;

  try {
    const result = await fetchBrandInsights("brand-123");
    assert.equal(result.data.generationId, "gen-1");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(urls[0] ?? "", /\/api\/trends\/read$/);
  assert.equal(methods[0], "POST");
  assert.match(urls[1] ?? "", /\/api\/trends\/brand-123$/);
  assert.equal(methods[1], "GET");
});
