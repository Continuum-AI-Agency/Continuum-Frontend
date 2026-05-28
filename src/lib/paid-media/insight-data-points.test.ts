import { describe, expect, it } from "bun:test";

import {
  buildCampaignInsightDataPoints,
  buildGeneratedCampaignInsights,
  computeInsightFingerprint,
  primaryMetricFor,
  primaryStatusFor,
} from "./insight-data-points";
import type { CampaignPerformanceRow } from "./performance-types";

const campaigns: CampaignPerformanceRow[] = [
  {
    id: "campaign-a",
    name: "A",
    status: "ACTIVE",
    metrics: {
      spend: 100,
      roas: 5,
      ctr: 2,
      cpc: 1,
      cpa: 10,
      impressions: 1000,
      clicks: 20,
    },
  },
  {
    id: "campaign-b",
    name: "B",
    status: "ACTIVE",
    metrics: {
      spend: 200,
      roas: 1,
      ctr: 0.5,
      cpc: 4,
      cpa: 60,
      impressions: 900,
      clicks: 5,
    },
  },
];

describe("campaign insight data points", () => {
  it("normalizes campaign rows into metric evidence points", () => {
    const points = buildCampaignInsightDataPoints({
      campaigns,
      evidenceWindow: "last_14d",
    });

    const strongRoas = points.find((point) => point.campaignId === "campaign-a" && point.metric === "roas");
    const riskyCpa = points.find((point) => point.campaignId === "campaign-b" && point.metric === "cpa");

    expect(strongRoas?.status).toBe("strong");
    expect(riskyCpa?.status).toBe("risk");
  });

  it("builds generated insights from deterministic evidence", () => {
    const points = buildCampaignInsightDataPoints({
      campaigns,
      evidenceWindow: "last_14d",
    });
    const insights = buildGeneratedCampaignInsights(points);

    expect(insights.length).toBeGreaterThan(0);
    expect(insights.some((insight) => insight.evidence.length > 0)).toBe(true);
  });
});

describe("computeInsightFingerprint", () => {
  it("is deterministic for the same inputs", () => {
    const a = computeInsightFingerprint({
      campaignId: "abc",
      primaryMetric: "roas",
      status: "risk",
    });
    const b = computeInsightFingerprint({
      campaignId: "abc",
      primaryMetric: "roas",
      status: "risk",
    });
    expect(a).toBe(b);
    expect(a).toBe("abc:roas:risk");
  });

  it("uses 'account' when campaignId is null", () => {
    expect(
      computeInsightFingerprint({
        campaignId: null,
        primaryMetric: "spend",
        status: "watch",
      })
    ).toBe("account:spend:watch");
  });

  it("differs when status changes", () => {
    const risky = computeInsightFingerprint({
      campaignId: "c1",
      primaryMetric: "cpa",
      status: "risk",
    });
    const watch = computeInsightFingerprint({
      campaignId: "c1",
      primaryMetric: "cpa",
      status: "watch",
    });
    expect(risky).not.toBe(watch);
  });

  it("matches the SQL generated-column formula", () => {
    // The DB computes: coalesce(campaign_id, 'account') || ':' || primary_metric || ':' || status
    // Client must match exactly so streak queries are consistent.
    const cases: Array<[string | null, string, string, string]> = [
      ["camp-1", "roas", "risk", "camp-1:roas:risk"],
      [null, "cpa", "strong", "account:cpa:strong"],
      ["x", "ctr", "unknown", "x:ctr:unknown"],
    ];
    for (const [campaignId, metric, status, expected] of cases) {
      expect(
        computeInsightFingerprint({
          campaignId,
          primaryMetric: metric as never,
          status: status as never,
        })
      ).toBe(expected);
    }
  });
});

describe("primaryMetricFor / primaryStatusFor", () => {
  const points = buildCampaignInsightDataPoints({
    campaigns,
    evidenceWindow: "last_14d",
  });
  const insights = buildGeneratedCampaignInsights(points);

  it("returns the first evidence point's metric and status", () => {
    for (const insight of insights) {
      expect(insight.evidence.length).toBeGreaterThan(0);
      expect(primaryMetricFor(insight)).toBe(insight.evidence[0].metric);
      expect(primaryStatusFor(insight)).toBe(insight.evidence[0].status);
    }
  });
});

