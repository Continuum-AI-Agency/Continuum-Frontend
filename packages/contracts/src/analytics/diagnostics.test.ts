import { describe, expect, it } from "bun:test";

import {
  DIAGNOSTICS_RESULT_SCHEMAS,
  creativeInsightsResultSchema,
  crossPlatformSpendResultSchema,
  jobErrorResultSchema,
  pacingResultSchema,
} from "./diagnostics";

const meta = {
  source: "live" as const,
  cached_at: "2026-06-29T00:00:00.000Z",
  cache_age_seconds: 0,
  stale: false,
};

describe("crossPlatformSpendResultSchema", () => {
  it("accepts the handler's success output", () => {
    const result = crossPlatformSpendResultSchema.safeParse({
      data: {
        rows: [
          {
            date: "2026-06-01",
            platform: "meta_ads",
            spend: 100,
            currency: "USD",
            impressions: 1000,
            clicks: 50,
            conversions: 5,
            cpa: 20,
            roas: 3.2,
          },
        ],
        totals: { spend: 100, impressions: 1000, clicks: 50, conversions: 5 },
        unsupported: [
          { platform: "google_ads", status: "not_implemented", hint: "not wired" },
        ],
      },
      meta,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a null-date / null-cpa/roas row (breakdown=platform)", () => {
    const result = crossPlatformSpendResultSchema.safeParse({
      data: {
        rows: [
          {
            date: null,
            platform: "meta_ads",
            spend: 0,
            currency: "USD",
            impressions: 0,
            clicks: 0,
            conversions: 0,
            cpa: null,
            roas: null,
          },
        ],
        totals: { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
        unsupported: [],
        truncated: true,
        total_rows: 250,
      },
      meta,
    });
    expect(result.success).toBe(true);
  });

  it("accepts the error envelope (non-meta / upstream)", () => {
    const result = crossPlatformSpendResultSchema.safeParse({
      ok: false,
      code: "UPSTREAM_ERROR",
      message: "boom",
      details: { tool: "analytics_cross_platform_spend" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a row missing required numeric fields", () => {
    const result = crossPlatformSpendResultSchema.safeParse({
      data: {
        rows: [{ date: "2026-06-01", platform: "meta_ads", spend: 100, currency: "USD" }],
        totals: { spend: 100, impressions: 0, clicks: 0, conversions: 0 },
        unsupported: [],
      },
      meta,
    });
    expect(result.success).toBe(false);
  });
});

describe("pacingResultSchema", () => {
  it("accepts the handler's success output", () => {
    const result = pacingResultSchema.safeParse({
      data: {
        campaigns: [
          {
            campaign_id: "c1",
            name: "Summer",
            budget_type: "lifetime",
            budget: 1000,
            spent: 400,
            days_elapsed: 5,
            days_total: 10,
            pace_ratio: 0.8,
            frequency: 2.1,
            anomalies: ["under_pacing"],
            health_score: 80,
          },
        ],
      },
      meta,
    });
    expect(result.success).toBe(true);
  });

  it("accepts the NOT_IMPLEMENTED error envelope", () => {
    const result = pacingResultSchema.safeParse({
      ok: false,
      code: "NOT_IMPLEMENTED",
      message: "Pacing diagnostic not implemented for google_ads",
      details: { platform: "google_ads" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a campaign missing health_score", () => {
    const result = pacingResultSchema.safeParse({
      data: {
        campaigns: [
          {
            campaign_id: "c1",
            name: null,
            budget_type: "daily",
            budget: 100,
            spent: 50,
            days_elapsed: 1,
            days_total: 1,
            pace_ratio: null,
            frequency: null,
            anomalies: [],
          },
        ],
      },
      meta,
    });
    expect(result.success).toBe(false);
  });
});

describe("creativeInsightsResultSchema", () => {
  it("accepts the handler's success output", () => {
    const result = creativeInsightsResultSchema.safeParse({
      data: {
        creatives: [
          {
            ad_id: "a1",
            ad_name: "Hook A",
            campaign_id: "c1",
            impressions: 1000,
            spend: 50,
            three_second_views: 300,
            video_p25: 200,
            video_p50: 120,
            hook_rate: 0.3,
            hold_rate: 0.4,
          },
        ],
      },
      meta,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an enriched row with level, hierarchy, path_label and parsed_name", () => {
    const result = creativeInsightsResultSchema.safeParse({
      data: {
        creatives: [
          {
            ad_id: "a1",
            ad_name: "PROSP|Video|LAL1%",
            campaign_id: "c1",
            level: "ad",
            hierarchy: {
              campaign: { id: "c1", name: "Spring Sale" },
              adset: { id: "s1", name: "LAL 1%" },
              ad: { id: "a1", name: "PROSP|Video|LAL1%" },
            },
            path_label: "Spring Sale › LAL 1% › PROSP|Video|LAL1%",
            parsed_name: {
              schema_id: "11111111-1111-4111-8111-111111111111",
              schema_version: 1,
              delimiter: "|",
              matched: true,
              segments: ["PROSP", "Video", "LAL1%"],
              fields: { funnel: "PROSP", format: "Video", audience: "LAL1%" },
            },
            impressions: 1000,
            spend: 50,
            three_second_views: 300,
            video_p25: 200,
            video_p50: 120,
            hook_rate: 0.3,
            hold_rate: 0.4,
          },
        ],
      },
      meta,
    });
    expect(result.success).toBe(true);
  });

  it("accepts null ad_name / campaign_id / rates", () => {
    const result = creativeInsightsResultSchema.safeParse({
      data: {
        creatives: [
          {
            ad_id: "a1",
            ad_name: null,
            campaign_id: null,
            impressions: 0,
            spend: 0,
            three_second_views: 0,
            video_p25: 0,
            video_p50: 0,
            hook_rate: null,
            hold_rate: null,
          },
        ],
      },
      meta,
    });
    expect(result.success).toBe(true);
  });
});

describe("jobErrorResultSchema", () => {
  it("requires ok:false literal", () => {
    expect(jobErrorResultSchema.safeParse({ ok: true, code: "x", message: "y" }).success).toBe(
      false,
    );
  });
});

describe("DIAGNOSTICS_RESULT_SCHEMAS registry", () => {
  it("maps each diagnostics job name to its schema", () => {
    expect(Object.keys(DIAGNOSTICS_RESULT_SCHEMAS).sort()).toEqual([
      "analytics_creative_insights",
      "analytics_cross_platform_spend",
      "analytics_pacing_diagnostic",
    ]);
  });
});
