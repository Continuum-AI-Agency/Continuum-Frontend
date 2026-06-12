import { describe, expect, it } from "bun:test";

import {
  buildJainaReportHtml,
  createJainaReportFilename,
  createJainaReportHtmlFilename,
  formatMetricValueForPdf,
} from "./reportExport";

describe("createJainaReportFilename", () => {
  it("uses the current date segment for the export file name", () => {
    const fixedDate = new Date("2026-03-09T12:34:56.000Z");
    expect(createJainaReportFilename(fixedDate)).toBe("jaina-report-2026-03-09.pdf");
  });

  it("creates html file names", () => {
    const fixedDate = new Date("2026-03-09T12:34:56.000Z");
    expect(createJainaReportHtmlFilename(fixedDate)).toBe("jaina-report-2026-03-09.html");
  });
});

describe("formatMetricValueForPdf", () => {
  it("formats currency metrics", () => {
    expect(
      formatMetricValueForPdf({
        metric: "Spend",
        value: 1234.5,
        format: "currency",
      })
    ).toBe("$1,234.50");
  });

  it("formats percentage metrics", () => {
    expect(
      formatMetricValueForPdf({
        metric: "CTR",
        value: 4.2,
        format: "percentage",
      })
    ).toBe("4.2%");
  });

  it("applies custom prefix and suffix for numeric values", () => {
    expect(
      formatMetricValueForPdf({
        metric: "Impressions",
        value: 12345,
        prefix: "~",
        suffix: " units",
      })
    ).toBe("~12,345 units");
  });
});

describe("buildJainaReportHtml", () => {
  it("renders core legacy report sections and escapes unsafe content", () => {
    const html = buildJainaReportHtml({
      report: {
        language: "en",
        report_title: "<Paid Report>",
        executive_summary: "Summary <script>",
        budget: null,
        performance_snapshot: [
          { metric: "Spend", value: 123, format: "currency" },
        ],
        blocks: [],
        sections: [
          {
            heading: "Campaigns",
            scope: "account",
            summary: "Campaign summary",
            highlights: [],
            tables: [],
            actions: [],
            confidence: null,
            cached_sources: [],
            graphs: [],
          },
        ],
        strategic_recommendations: [
          {
            title: "Shift budget",
            rationale: "Move spend to winners",
            expected_impact: "Higher ROAS",
            priority: "now",
          },
        ],
        follow_up_questions: ["What changed?"],
        handoff_trace: [],
        execution_objectives: [],
        cached_sources: [],
        graphs: [
          {
            title: "Spend trend",
            graph_type: "line",
            labels: ["Mon"],
            datasets: [{ label: "Spend", data: [123] }],
          },
        ],
      },
      fallbackTables: [{ headers: ["Campaign", "Spend"], rows: [["A", "$123"]] }],
    });

    expect(html).toContain("&lt;Paid Report&gt;");
    expect(html).toContain("Performance Snapshot");
    expect(html).toContain("Spend trend");
    expect(html).toContain("data-jaina-chart");
    expect(html).toContain("chart-payload");
    expect(html).toContain("Chart type");
    expect(html).toContain("Data Table 1");
    expect(html).toContain("Shift budget");
    expect(html).toContain("Summary &lt;script&gt;");
    expect(html).not.toContain("Summary <script>");
  });
});
