import { describe, expect, it } from "bun:test";
import type { SoTReport } from "@/lib/jaina/schemas";
import {
  buildJitSnapshotFallbackTables,
  hasTimelineCharts,
} from "./reportTableUtils";

function createBaseReport(overrides: Partial<SoTReport> = {}): SoTReport {
  return {
    language: "en",
    reasoning_trace: "",
    executive_summary: "Summary",
    performance_snapshot: [],
    sections: [],
    strategic_recommendations: [],
    follow_up_questions: [],
    handoff_trace: [],
    cached_sources: [],
    graphs: [],
    ...overrides,
  };
}

describe("reportTableUtils", () => {
  it("builds fallback tables for snapshot/jit payloads without timeline charts", () => {
    const report = createBaseReport({
      performance_snapshot: [
        { metric: "Top ROAS", value: "1.92", context: "Campaign A" },
      ],
      graphs: [
        {
          type: "bar",
          title: "ROAS Snapshot",
          data: [
            { label: "Campaign A", value: 1.92 },
            { label: "Campaign B", value: 1.71 },
          ],
        },
      ],
    });

    expect(hasTimelineCharts(report)).toBe(false);

    const tables = buildJitSnapshotFallbackTables(report);
    expect(tables.length).toBeGreaterThan(0);
    expect(tables[0].headers).toContain("Metric");
    expect(tables[0].rows[0]).toContain("Top ROAS");
    expect(tables.some((table) => table.headers.includes("Chart"))).toBe(true);
  });

  it("skips fallback tables when timeline charts are present", () => {
    const report = createBaseReport({
      graphs: [
        {
          type: "line",
          title: "Daily ROAS",
          data: [
            { label: "2026-02-10", value: 1.2 },
            { label: "2026-02-11", value: 1.4 },
          ],
        },
      ],
      performance_snapshot: [
        { metric: "Top ROAS", value: "1.92", context: "Campaign A" },
      ],
    });

    expect(hasTimelineCharts(report)).toBe(true);
    expect(buildJitSnapshotFallbackTables(report)).toEqual([]);
  });
});
