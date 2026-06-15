import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

const invokeMock = mock(async (..._args: unknown[]) => ({
  data: { campaigns: [{ id: "c1", name: "Camp 1", status: "ENABLED" }] },
  error: null,
}));

mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ functions: { invoke: invokeMock } }),
}));

import { fetchCampaignPerformanceRows } from "./campaign-performance-loader";

describe("fetchCampaignPerformanceRows", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    invokeMock.mockClear();
    global.fetch = mock(async () =>
      ({ ok: true, json: async () => ({ metrics: {}, comparison: {}, trends: [] }) }) as Response
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("invokes the Meta campaign function for the meta platform", async () => {
    await fetchCampaignPerformanceRows({
      brandId: "b1",
      adAccountId: "act_1",
      platform: "meta",
      range: { preset: "last_7d" },
    });

    const fnName = invokeMock.mock.calls[0][0] as string;
    expect(fnName.startsWith("paid-media-reporting/campaigns")).toBe(true);
  });

  it("invokes the Google Ads campaign function for the google-ads platform", async () => {
    await fetchCampaignPerformanceRows({
      brandId: "b1",
      adAccountId: "123-456",
      platform: "google-ads",
      range: { preset: "last_7d" },
    });

    const fnName = invokeMock.mock.calls[0][0] as string;
    expect(fnName.startsWith("fetch-google-ads-campaigns")).toBe(true);
  });
});
