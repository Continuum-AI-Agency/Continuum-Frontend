import { describe, expect, it } from "bun:test";

import type { ActionLog } from "@/lib/types/dco";
import {
  calculateImmediateKpiShiftPct,
  mapActionLogsToTimelineMarkers,
} from "./actionMarkers";

describe("calculateImmediateKpiShiftPct", () => {
  it("computes next-bucket percentage shift for daily buckets", () => {
    const rows = [
      { timestamp: "2026-02-01T00:00:00.000Z", value: 100 },
      { timestamp: "2026-02-02T00:00:00.000Z", value: 112 },
      { timestamp: "2026-02-03T00:00:00.000Z", value: 98 },
    ];

    const shift = calculateImmediateKpiShiftPct(rows, "daily", "2026-02-02");
    expect(shift).toBeCloseTo(-12.5, 6);
  });

  it("returns null when marker bucket is missing or terminal", () => {
    const rows = [
      { timestamp: "2026-02-01T00:00:00.000Z", value: 100 },
      { timestamp: "2026-02-02T00:00:00.000Z", value: 112 },
    ];

    expect(calculateImmediateKpiShiftPct(rows, "daily", "2026-02-10")).toBeNull();
    expect(calculateImmediateKpiShiftPct(rows, "daily", "2026-02-02")).toBeNull();
  });

  it("supports hourly buckets", () => {
    const rows = [
      { timestamp: "2026-02-01T10:15:00.000Z", value: 40 },
      { timestamp: "2026-02-01T11:05:00.000Z", value: 50 },
    ];

    const shift = calculateImmediateKpiShiftPct(rows, "hourly", "2026-02-01T10:00:00.000Z");
    expect(shift).toBeCloseTo(25, 6);
  });
});

describe("mapActionLogsToTimelineMarkers", () => {
  it("groups logs by bucket and scope and maps to nearest chart points", () => {
    const points = [
      { time: 1738400400, value: 10 }, // 2025-02-01T09:00:00.000Z
      { time: 1738404000, value: 12 }, // 2025-02-01T10:00:00.000Z
      { time: 1738407600, value: 11 }, // 2025-02-01T11:00:00.000Z
    ] as const;

    const baseLog: Omit<ActionLog, "id" | "occurredAt" | "actionType" | "status" | "scopeType"> = {
      brandId: "brand-1",
      metaAccountId: "act_123",
      metaCampaignId: "cmp_1",
      metaAdsetId: null,
      metaAdId: null,
      scopeId: "cmp_1",
      actionPayload: {},
      paramsChanged: {},
      result: {},
      decisionNote: null,
      error: null,
    };

    const logs: ActionLog[] = [
      {
        ...baseLog,
        id: "l1",
        occurredAt: "2025-02-01T10:10:00.000Z",
        actionType: "PAUSE_CAMPAIGN",
        status: "FAILED",
        scopeType: "CAMPAIGN",
      },
      {
        ...baseLog,
        id: "l2",
        occurredAt: "2025-02-01T10:25:00.000Z",
        actionType: "ADJUST_BUDGET",
        status: "SUCCESS",
        scopeType: "CAMPAIGN",
      },
      {
        ...baseLog,
        id: "l3",
        occurredAt: "2025-02-01T11:05:00.000Z",
        actionType: "SCALE_BUDGET",
        status: "PENDING",
        scopeType: "CAMPAIGN",
      },
    ];

    const markers = mapActionLogsToTimelineMarkers(logs, [...points], "hourly");

    expect(markers).toHaveLength(2);
    expect(markers[0]?.label).toContain("2 actions");
    expect(markers[0]?.label).toContain("FAILED");
    expect(markers[0]?.shape).toBe("square");
    expect(markers[0]?.scopeType).toBe("CAMPAIGN");
    expect(markers[0]?.campaignId).toBe("cmp_1");
    expect(markers[0]?.adSetId).toBeNull();
    expect(markers[0]?.adId).toBeNull();
    expect(markers[0]?.actionCount).toBe(2);
    expect(markers[0]?.status).toBe("FAILED");
    expect(markers[1]?.time).toBe(1738407600);
  });

  it("maps markers to nearest point within the same bucket when multiple points exist", () => {
    const points = [
      { time: 1738404000, value: 10 }, // 2025-02-01T10:00:00.000Z
      { time: 1738406700, value: 11 }, // 2025-02-01T10:45:00.000Z
    ] as const;

    const logs: ActionLog[] = [
      {
        id: "nearest-1",
        brandId: "brand-1",
        metaAccountId: "act_123",
        metaCampaignId: "cmp_1",
        metaAdsetId: null,
        metaAdId: null,
        actionType: "ADJUST_BUDGET",
        status: "SUCCESS",
        scopeType: "CAMPAIGN",
        scopeId: "cmp_1",
        occurredAt: "2025-02-01T10:40:00.000Z",
        actionPayload: {},
        paramsChanged: {},
        result: {},
        decisionNote: null,
        error: null,
      },
    ];

    const markers = mapActionLogsToTimelineMarkers(logs, [...points], "daily");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.time).toBe(1738406700);
  });

  it("demotes non-matching scopes to bottom markers for the current view layer", () => {
    const points = [
      { time: 1738404000, value: 10 }, // 2025-02-01T10:00:00.000Z
      { time: 1738407600, value: 11 }, // 2025-02-01T11:00:00.000Z
    ] as const;

    const logs: ActionLog[] = [
      {
        id: "campaign-1",
        brandId: "brand-1",
        metaAccountId: "act_123",
        metaCampaignId: "cmp_1",
        metaAdsetId: "adset_1",
        metaAdId: null,
        actionType: "PAUSE_CAMPAIGN",
        status: "SUCCESS",
        scopeType: "CAMPAIGN",
        scopeId: "cmp_1",
        occurredAt: "2025-02-01T10:10:00.000Z",
        actionPayload: {},
        paramsChanged: {},
        result: {},
        decisionNote: null,
        error: null,
      },
      {
        id: "ad-1",
        brandId: "brand-1",
        metaAccountId: "act_123",
        metaCampaignId: "cmp_1",
        metaAdsetId: "adset_1",
        metaAdId: "ad_1",
        actionType: "SWITCH_CREATIVE",
        status: "PENDING",
        scopeType: "AD",
        scopeId: "ad_1",
        occurredAt: "2025-02-01T10:20:00.000Z",
        actionPayload: {},
        paramsChanged: {},
        result: {},
        decisionNote: null,
        error: null,
      },
    ];

    const markers = mapActionLogsToTimelineMarkers(logs, [...points], "hourly", { viewLayer: "campaign" });
    expect(markers).toHaveLength(2);

    const campaignMarker = markers.find((marker) => marker.scopeType === "CAMPAIGN");
    const adMarker = markers.find((marker) => marker.scopeType === "AD");
    expect(campaignMarker?.position).toBe("aboveBar");
    expect(adMarker?.position).toBe("belowBar");
    expect(campaignMarker?.campaignId).toBe("cmp_1");
    expect(adMarker?.adSetId).toBe("adset_1");
    expect(adMarker?.adId).toBe("ad_1");
  });

  it("promotes ad-scope markers when ad layer is active", () => {
    const points = [
      { time: 1738404000, value: 10 }, // 2025-02-01T10:00:00.000Z
      { time: 1738407600, value: 11 }, // 2025-02-01T11:00:00.000Z
    ] as const;

    const logs: ActionLog[] = [
      {
        id: "campaign-2",
        brandId: "brand-1",
        metaAccountId: "act_123",
        metaCampaignId: "cmp_2",
        metaAdsetId: "adset_2",
        metaAdId: null,
        actionType: "PAUSE_CAMPAIGN",
        status: "SUCCESS",
        scopeType: "CAMPAIGN",
        scopeId: "cmp_2",
        occurredAt: "2025-02-01T10:10:00.000Z",
        actionPayload: {},
        paramsChanged: {},
        result: {},
        decisionNote: null,
        error: null,
      },
      {
        id: "ad-2",
        brandId: "brand-1",
        metaAccountId: "act_123",
        metaCampaignId: "cmp_2",
        metaAdsetId: "adset_2",
        metaAdId: "ad_2",
        actionType: "SWITCH_CREATIVE",
        status: "PENDING",
        scopeType: "AD",
        scopeId: "ad_2",
        occurredAt: "2025-02-01T10:20:00.000Z",
        actionPayload: {},
        paramsChanged: {},
        result: {},
        decisionNote: null,
        error: null,
      },
    ];

    const markers = mapActionLogsToTimelineMarkers(logs, [...points], "hourly", { viewLayer: "ad" });
    expect(markers).toHaveLength(2);

    const campaignMarker = markers.find((marker) => marker.scopeType === "CAMPAIGN");
    const adMarker = markers.find((marker) => marker.scopeType === "AD");
    expect(campaignMarker?.position).toBe("belowBar");
    expect(adMarker?.position).toBe("aboveBar");
  });
});
