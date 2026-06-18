import { describe, expect, it } from "bun:test";
import type { PaidRankedEntity } from "@continuum/contracts";

import { buildPaidLeaderboardRows, formatKpiValue } from "./paid-leaderboard-rows";

function campaign(id: string, name: string, roas: number, spend: number): PaidRankedEntity {
  return {
    id,
    name,
    metrics: { spend, roas },
    rank: 1,
    kpi: "roas",
    kpi_value: roas,
    kpi_unit: "multiplier",
  };
}

function adset(id: string, name: string, campaignName: string, roas: number): PaidRankedEntity {
  return {
    id,
    name,
    labels: { campaign: campaignName },
    metrics: { roas },
    rank: 1,
    kpi: "roas",
    kpi_value: roas,
    kpi_unit: "multiplier",
  };
}

describe("formatKpiValue", () => {
  it("formats a multiplier KPI", () => {
    expect(formatKpiValue(3.123, "multiplier")).toBe("3.12x");
  });

  it("formats a percent KPI", () => {
    expect(formatKpiValue(1.671, "percent")).toBe("1.7%");
  });
});

describe("buildPaidLeaderboardRows", () => {
  it("joins a campaign insight by campaign id and shows spend", () => {
    const rows = buildPaidLeaderboardRows({
      scope: "top_campaigns",
      entities: [campaign("c1", "Summer Sale", 3.1, 1200)],
      insights: [{ campaignId: "c1", campaignName: "Summer Sale", title: "ROAS climbing 18% WoW" }],
    });
    expect(rows[0]?.insightLine).toBe("ROAS climbing 18% WoW");
    expect(rows[0]?.metricValue).toBe("3.10x");
    expect(rows[0]?.subLabel).toContain("spend");
  });

  it("rolls up the parent campaign insight onto an ad set by campaign name", () => {
    const rows = buildPaidLeaderboardRows({
      scope: "top_adsets",
      entities: [adset("a1", "Lookalike 1%", "Summer Sale", 4.0)],
      insights: [{ campaignId: "c1", campaignName: "Summer Sale", title: "ROAS climbing 18% WoW" }],
    });
    expect(rows[0]?.insightLine).toBe("ROAS climbing 18% WoW");
    expect(rows[0]?.subLabel).toBe("Summer Sale");
  });

  it("omits the insight line when no persisted insight matches", () => {
    const rows = buildPaidLeaderboardRows({
      scope: "top_campaigns",
      entities: [campaign("c2", "Retargeting", 2.4, 300)],
      insights: [],
    });
    expect(rows[0]?.insightLine).toBeUndefined();
  });
});
