import { describe, expect, it } from "vitest";

import { formatOrganicToolName } from "./organicToolLabels";

describe("formatOrganicToolName", () => {
  it("uses stable labels for dashboard pack and analytics tools", () => {
    expect(formatOrganicToolName("summarizeOrganicDashboardData")).toBe("Dashboard data pack");
    expect(formatOrganicToolName("getFacebookOrganicAnalytics")).toBe("Facebook analytics");
  });

  it("falls back to readable labels for unknown tool names", () => {
    expect(formatOrganicToolName("unknown_tool-name")).toBe("Unknown Tool Name");
    expect(formatOrganicToolName("customOrganicTool")).toBe("Custom Organic Tool");
  });
});
