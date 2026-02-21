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
});
