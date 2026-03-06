import { describe, expect, it } from "bun:test";
import { normalizeJainaChart } from "./JainaReportCharts";

describe("normalizeJainaChart", () => {
  it("normalizes wide bar chart rows into multiple series", () => {
    const normalized = normalizeJainaChart({
      type: "bar",
      title: "Campaign Spend vs ROAS Efficiency",
      data: [
        { label: "Selfservice", spend: 20761, roas: 0.26 },
        { label: "Influencer", spend: 35097, roas: 1.65 },
        { label: "UDF", spend: 5892, roas: 1.98 },
      ],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.series?.length).toBe(2);
    expect(normalized?.series?.[0]?.data.length).toBe(3);
    expect(normalized?.series?.[1]?.data.length).toBe(3);
  });

  it("prefers series parser when frontend_parser is series", () => {
    const normalized = normalizeJainaChart({
      title: "Daily Spend",
      frontend_parser: "series",
      series: [
        {
          name: "Spend",
          data: [
            { x: "2026-03-01", y: 42 },
            { x: "2026-03-02", y: 44 },
          ],
        },
      ],
      labels: ["ignore", "labels"],
      datasets: [{ label: "Other", data: [1, 2] }],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.frontend_parser).toBe("series");
    expect(normalized?.series?.[0]?.name).toBe("Spend");
    expect(normalized?.series?.[0]?.data[0]).toEqual({ x: "2026-03-01", y: 42 });
  });

  it("prefers chartjs parser when frontend_parser is chartjs", () => {
    const normalized = normalizeJainaChart({
      title: "Channel Mix",
      frontend_parser: "chartjs",
      labels: ["Search", "Social"],
      datasets: [{ label: "Spend", data: [120, 80] }],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.frontend_parser).toBe("chartjs");
    expect(normalized?.data).toEqual([
      { label: "Search", value: 120 },
      { label: "Social", value: 80 },
    ]);
  });

  it("accepts versioned parser hints like chartjs_v1", () => {
    const normalized = normalizeJainaChart({
      title: "Versioned Parser",
      frontend_parser: "chartjs_v1",
      labels: ["A", "B"],
      datasets: [{ label: "Spend", data: [10, 20] }],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.frontend_parser).toBe("chartjs");
    expect(normalized?.data).toEqual([
      { label: "A", value: 10 },
      { label: "B", value: 20 },
    ]);
  });
});
