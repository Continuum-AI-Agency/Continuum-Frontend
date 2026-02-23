import assert from "node:assert/strict";
import test from "node:test";

import {
  generateBrandInsights,
  isTerminalBrandInsightsStatus,
  resolveBrandInsightsEventsUrl,
} from "../../src/lib/api/brandInsights.client.ts";
import { BRAND_TRENDS_SCHEMA } from "../../src/lib/schemas/brandInsights.ts";

function createProcessingResponse() {
  return new Response(
    JSON.stringify({
      status: "processing",
      data: {
        generation_id: "gen-1",
        job_id: "job-1",
        status: "running",
        brand_id: "brand-123",
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

test("generateBrandInsights sends required window fields when caller omits them", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody: Record<string, unknown> | null = null;
  let capturedHeaders = new Headers();

  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    capturedHeaders = new Headers(init?.headers as HeadersInit | undefined);
    return createProcessingResponse();
  }) as typeof fetch;

  try {
    await generateBrandInsights({ brandId: "brand-123" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(capturedUrl, /\/api\/trends\/jobs\/start$/);
  assert.ok(capturedBody);
  assert.equal(typeof capturedBody.week_start_date, "string");
  assert.equal(typeof capturedBody.window_start, "string");
  assert.equal(typeof capturedBody.window_end, "string");
  assert.match(String(capturedBody.week_start_date), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(String(capturedBody.window_start), /^\d{4}-\d{2}-\d{2}T.*Z$/);
  assert.match(String(capturedBody.window_end), /^\d{4}-\d{2}-\d{2}T.*Z$/);
  assert.equal(String(capturedBody.window_start).slice(0, 10), String(capturedBody.week_start_date));

  const rangeMs =
    new Date(String(capturedBody.window_end)).getTime() - new Date(String(capturedBody.window_start)).getTime();
  assert.equal(rangeMs, 7 * 24 * 60 * 60 * 1000);
  assert.equal(capturedHeaders.get("x-supabase-schema"), BRAND_TRENDS_SCHEMA);
});

test("generateBrandInsights derives ISO window bounds from weekStartDate", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return createProcessingResponse();
  }) as typeof fetch;

  try {
    await generateBrandInsights({
      brandId: "brand-123",
      weekStartDate: "2026-02-16",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(capturedBody);
  assert.equal(capturedBody.week_start_date, "2026-02-16");
  assert.equal(capturedBody.window_start, "2026-02-16T00:00:00.000Z");
  assert.equal(capturedBody.window_end, "2026-02-23T00:00:00.000Z");
});

test("resolveBrandInsightsEventsUrl appends after query parameter", () => {
  const url = resolveBrandInsightsEventsUrl("/api/trends/jobs/gen-1/events", 42);
  assert.match(url, /\/api\/trends\/jobs\/gen-1\/events/);
  assert.match(url, /after=42/);
});

test("isTerminalBrandInsightsStatus identifies terminal job states", () => {
  assert.equal(isTerminalBrandInsightsStatus("completed"), true);
  assert.equal(isTerminalBrandInsightsStatus("failed"), true);
  assert.equal(isTerminalBrandInsightsStatus("running"), false);
});
