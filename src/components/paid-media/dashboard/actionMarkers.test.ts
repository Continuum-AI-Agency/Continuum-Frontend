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
    expect(markers[0]?.actionCount).toBe(2);
    expect(markers[0]?.status).toBe("FAILED");
    expect(markers[1]?.time).toBe(1738407600);
  });
});
