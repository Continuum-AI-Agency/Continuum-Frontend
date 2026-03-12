import { describe, expect, it } from "bun:test";

import {
  createJainaReportFilename,
  formatMetricValueForPdf,
} from "./reportExport";

describe("createJainaReportFilename", () => {
  it("uses the current date segment for the export file name", () => {
    const fixedDate = new Date("2026-03-09T12:34:56.000Z");
    expect(createJainaReportFilename(fixedDate)).toBe("jaina-report-2026-03-09.pdf");
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
