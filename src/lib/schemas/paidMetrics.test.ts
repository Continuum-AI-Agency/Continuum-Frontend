import { describe, expect, it } from "bun:test";

import { PaidMetricsResponseSchema } from "./paidMetrics";

const basePayload = {
  metrics: {
    spend: 100,
    roas: 1.5,
    impressions: 1000,
    clicks: 100,
    ctr: 10,
    cpc: 1,
    cpa: 10,
  },
  trends: [
    {
      date: "2026-02-28",
      spend: 100,
      roas: 1.5,
      impressions: 1000,
      clicks: 100,
      ctr: 10,
      cpc: 1,
      cpa: 10,
    },
  ],
  range: {
    since: "2026-02-22",
    until: "2026-02-28",
    preset: "last_7d",
  },
};

describe("PaidMetricsResponseSchema", () => {
  it("keeps valid comparison entries and drops null previous-window comparisons", () => {
    const parsed = PaidMetricsResponseSchema.parse({
      ...basePayload,
      comparison: {
        spend: {
          current: 100,
          previous: 80,
          percentageChange: 25,
        },
        roas: {
          current: 1.5,
          previous: null,
          percentageChange: null,
        },
      },
    });

    expect(parsed.comparison).toEqual({
      spend: {
        current: 100,
        previous: 80,
        percentageChange: 25,
      },
    });
  });

  it("returns undefined comparison when all metrics have null previous-window values", () => {
    const parsed = PaidMetricsResponseSchema.parse({
      ...basePayload,
      comparison: {
        spend: {
          current: 100,
          previous: null,
          percentageChange: null,
        },
      },
    });

    expect(parsed.comparison).toBeUndefined();
  });

  it("accepts previous_range and insights from meta handler payload", () => {
    const parsed = PaidMetricsResponseSchema.parse({
      ...basePayload,
      comparison: {
        spend: {
          current: 100,
          previous: 90,
          percentageChange: 11.11,
        },
      },
      previous_range: {
        since: "2026-02-15",
        until: "2026-02-21",
      },
      insights: [
        {
          date_start: "2026-02-28",
          date_stop: "2026-02-28",
          spend: 100,
          roas: 1.5,
          cpa: 10,
          purchases: 10,
          purchase_value: 150,
          actions: [],
          action_values: [],
          cost_per_action_type: [],
        },
      ],
    });

    expect(parsed.previous_range).toEqual({
      since: "2026-02-15",
      until: "2026-02-21",
    });
    expect(parsed.insights?.[0]?.purchase_value).toBe(150);
    expect(parsed.insights?.[0]?.cpa).toBe(10);
    expect(parsed.insights?.[0]?.purchases).toBe(10);
  });

  it("defaults cpa to 0 when omitted for backward-compatible cached payloads", () => {
    const parsed = PaidMetricsResponseSchema.parse({
      ...basePayload,
      metrics: {
        spend: 100,
        roas: 1.5,
        impressions: 1000,
        clicks: 100,
        ctr: 10,
        cpc: 1,
      },
    });

    expect(parsed.metrics.cpa).toBe(0);
  });

  it("parses gaSessions/gaConversions when present on metrics and trends", () => {
    const parsed = PaidMetricsResponseSchema.parse({
      ...basePayload,
      metrics: {
        ...basePayload.metrics,
        gaSessions: 420,
        gaConversions: 12,
      },
      trends: [
        {
          ...basePayload.trends[0],
          gaSessions: 60,
          gaConversions: 3,
        },
      ],
    });

    expect(parsed.metrics.gaSessions).toBe(420);
    expect(parsed.metrics.gaConversions).toBe(12);
    expect(parsed.trends[0].gaSessions).toBe(60);
    expect(parsed.trends[0].gaConversions).toBe(3);
  });

  it("defaults gaSessions/gaConversions to 0 for brands without GA4 (existing payloads still validate)", () => {
    const parsed = PaidMetricsResponseSchema.parse(basePayload);

    expect(parsed.metrics.gaSessions).toBe(0);
    expect(parsed.metrics.gaConversions).toBe(0);
    expect(parsed.trends[0].gaSessions).toBe(0);
    expect(parsed.trends[0].gaConversions).toBe(0);
  });
});
