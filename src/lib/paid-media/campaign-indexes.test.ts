import { describe, expect, it } from "vitest";

import { buildCampaignIndexAggregate } from "./campaign-indexes";

describe("buildCampaignIndexAggregate", () => {
  it("averages metrics and comparison across campaigns", () => {
    const aggregate = buildCampaignIndexAggregate([
      {
        id: "c1",
        metrics: {
          spend: 100,
          roas: 1.2,
          ctr: 2,
          cpc: 3,
          cpa: 12,
          impressions: 1000,
          clicks: 50,
        },
        comparison: {
          spend: { current: 100, previous: 80, percentageChange: 25 },
          roas: { current: 1.2, previous: 1.0, percentageChange: 20 },
          cpa: { current: 12, previous: 10, percentageChange: 20 },
        },
      },
      {
        id: "c2",
        metrics: {
          spend: 200,
          roas: 0.8,
          ctr: 4,
          cpc: 5,
          cpa: 20,
          impressions: 3000,
          clicks: 150,
        },
        comparison: {
          spend: { current: 200, previous: 250, percentageChange: -20 },
          roas: { current: 0.8, previous: 1.0, percentageChange: -20 },
          cpa: { current: 20, previous: 25, percentageChange: -20 },
        },
      },
    ]);

    expect(aggregate.metrics.spend).toBe(150);
    expect(aggregate.metrics.roas).toBe(1);
    expect(aggregate.metrics.ctr).toBe(3);
    expect(aggregate.metrics.cpc).toBe(4);
    expect(aggregate.metrics.cpa).toBe(16);
    expect(aggregate.metrics.impressions).toBe(2000);
    expect(aggregate.metrics.clicks).toBe(100);

    expect(aggregate.comparison.spend.current).toBe(150);
    expect(aggregate.comparison.spend.previous).toBe(165);
    expect(aggregate.comparison.spend.percentageChange).toBe(2.5);

    expect(aggregate.comparison.roas.current).toBe(1);
    expect(aggregate.comparison.roas.previous).toBe(1);
    expect(aggregate.comparison.roas.percentageChange).toBe(0);
    expect(aggregate.comparison.cpa.current).toBe(16);
    expect(aggregate.comparison.cpa.previous).toBe(17.5);
    expect(aggregate.comparison.cpa.percentageChange).toBe(0);
  });

  it("averages trends by matching date", () => {
    const aggregate = buildCampaignIndexAggregate([
      {
        id: "c1",
        trends: [
          { date: "2026-02-20T00:00:00.000Z", spend: 100, roas: 1, ctr_pct: 2, cpa: 9 },
          { date: "2026-02-21T00:00:00.000Z", spend: 80, roas: 2, ctr_pct: 3, cpa: 7 },
        ],
      },
      {
        id: "c2",
        trends: [
          { date: "2026-02-20T00:00:00.000Z", spend: 200, roas: 3, ctr_pct: 4, cpa: 11 },
          { date: "2026-02-22T00:00:00.000Z", spend: 60, roas: 5, ctr_pct: 6, cpa: 6 },
        ],
      },
    ]);

    expect(aggregate.trends).toHaveLength(3);
    expect(aggregate.trends[0]?.spend).toBe(150);
    expect(aggregate.trends[0]?.roas).toBe(2);
    expect(aggregate.trends[0]?.ctr_pct).toBe(3);
    expect(aggregate.trends[0]?.cpa).toBe(10);
    expect(aggregate.trends[1]?.spend).toBe(80);
    expect(aggregate.trends[2]?.spend).toBe(60);
  });
});
