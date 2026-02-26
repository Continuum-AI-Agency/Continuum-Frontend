import { describe, expect, it } from "bun:test";

import { calculateImmediateKpiShiftPct } from "./actionMarkers";

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
