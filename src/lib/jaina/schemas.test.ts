import { describe, it, expect } from "bun:test";
import { sotReportSchema } from "./schemas";

describe("sotReportSchema Resilience", () => {
  it("should parse a minimal report with only executive_summary", () => {
    const minimal = { executive_summary: "Test summary" };
    const result = sotReportSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("en");
      expect(result.data.sections).toEqual([]);
      expect(result.data.strategic_recommendations).toEqual([]);
    }
  });

  it("should parse a report with only summary (agent fallback)", () => {
    const minimal = { summary: "Test summary" };
    const result = sotReportSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBe("Test summary");
    }
  });

  it("should parse a report with reasoning_trace", () => {
    const data = { 
      executive_summary: "Summary",
      reasoning_trace: "Trace detail"
    };
    const result = sotReportSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reasoning_trace).toBe("Trace detail");
    }
  });

  it("should provide defaults for missing arrays", () => {
    const empty = {};
    const result = sotReportSchema.safeParse(empty);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sections).toBeDefined();
      expect(Array.isArray(result.data.sections)).toBe(true);
      expect(result.data.sections.length).toBe(0);
      expect(result.data.performance_snapshot).toEqual([]);
    }
  });
});
