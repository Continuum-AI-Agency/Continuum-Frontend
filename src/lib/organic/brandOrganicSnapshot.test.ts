import { describe, expect, it } from "bun:test";
import type { OrganicAnalyticsRequest } from "@/lib/api/organicAnalytics.client";
import type { OrganicMetricsResponse } from "@/lib/schemas/organicMetrics";
import {
  flattenAccountsByPlatform,
  loadBrandOrganicSnapshot,
  metricValueForAccount,
  summableRollups,
  type SnapshotAccountResult,
} from "./brandOrganicSnapshot";

function fakeResponse(
  platform: "instagram" | "facebook" | "tiktok" | "youtube" | "linkedin",
  accountId: string,
  metrics: Record<string, number>,
): OrganicMetricsResponse {
  return {
    platform: platform === "linkedin" ? "linkedin" : platform,
    accountId,
    range: { preset: "last_7d", since: "2026-07-01", until: "2026-07-08" },
    metrics,
    comparison: {
      views: { current: metrics.views ?? 0, previous: 50, percentageChange: 10 },
    },
    trends: [
      { date: "2026-07-01", views: 40 },
      { date: "2026-07-02", views: 60 },
    ],
  } as OrganicMetricsResponse;
}

describe("flattenAccountsByPlatform", () => {
  it("flattens all platforms in stable order", () => {
    const flat = flattenAccountsByPlatform({
      instagram: [{ integrationAccountId: "ig1", name: "IG" }],
      facebook: [],
      tiktok: [{ integrationAccountId: "tt1", name: "TT" }],
      youtube: [],
      linkedin: [{ integrationAccountId: "li1", name: "LI" }],
    });
    expect(flat.map((a) => a.platform)).toEqual(["instagram", "tiktok", "linkedin"]);
  });
});

describe("loadBrandOrganicSnapshot", () => {
  it("fans out over the same fetch path and separates ok vs missing", async () => {
    const calls: OrganicAnalyticsRequest[] = [];
    const snapshot = await loadBrandOrganicSnapshot({
      brandId: "brand-1",
      rangePreset: "last_7d",
      accounts: [
        { platform: "instagram", integrationAccountId: "ig1", name: "IG" },
        { platform: "linkedin", integrationAccountId: "li1", name: "LI" },
        { platform: "tiktok", integrationAccountId: "tt1", name: "TT" },
      ],
      fetchAccount: async (request) => {
        calls.push(request);
        if (request.platform === "tiktok") {
          throw new Error("TikTok token expired");
        }
        return fakeResponse(request.platform, request.integrationAccountId, {
          views: request.platform === "instagram" ? 100 : 0,
          impressions: request.platform === "linkedin" ? 200 : 0,
          reach: request.platform === "instagram" ? 80 : 0,
        });
      },
    });

    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.scope === "kpis")).toBe(true);
    expect(snapshot.accounts).toHaveLength(2);
    expect(snapshot.missing).toHaveLength(1);
    expect(snapshot.missing[0]?.message).toContain("TikTok");
  });
});

describe("summableRollups", () => {
  const accounts: SnapshotAccountResult[] = [
    {
      status: "ok",
      platform: "instagram",
      integrationAccountId: "ig1",
      name: "IG",
      metrics: { views: 100, reach: 80, hookRate: 40 },
      comparison: null,
      trends: [],
      range: { preset: "last_7d", since: "a", until: "b" },
    },
    {
      status: "ok",
      platform: "tiktok",
      integrationAccountId: "tt1",
      name: "TT",
      metrics: { views: 50, subscribers: 1000 },
      comparison: null,
      trends: [],
      range: { preset: "last_7d", since: "a", until: "b" },
    },
  ];

  it("sums summable flow metrics across accounts that expose them", () => {
    const rollups = summableRollups(accounts, ["views", "subscribers"]);
    const views = rollups.find((r) => r.metricId === "views");
    const subs = rollups.find((r) => r.metricId === "subscribers");
    expect(views?.value).toBe(150);
    expect(views?.isSum).toBe(true);
    // subscribers is stock — not summable
    expect(subs?.isSum).toBe(false);
    expect(subs?.value).toBeNull();
  });

  it("metricValueForAccount respects platform availability", () => {
    expect(metricValueForAccount(accounts[0]!, "impressions")).toBeUndefined();
    expect(metricValueForAccount(accounts[0]!, "views")).toBe(100);
  });
});
