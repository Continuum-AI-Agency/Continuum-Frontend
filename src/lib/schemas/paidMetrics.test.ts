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
  });
});
