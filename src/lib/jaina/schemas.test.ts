import { describe, it, expect } from "bun:test";
import {
  jainaChatRequestSchema,
  jainaChatStopRequestSchema,
  jainaChatStopResponseSchema,
  sotReportSchema,
} from "./schemas";

describe("jainaChatRequestSchema", () => {
  it("defaults plan to false when omitted", () => {
    const result = jainaChatRequestSchema.safeParse({
      query: "Analyze my campaigns",
      context: {
        adAccountId: "act_123",
        brandId: "brand_456",
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plan).toBe(false);
    }
  });

  it("accepts explicit plan=true", () => {
    const result = jainaChatRequestSchema.safeParse({
      query: "Analyze my campaigns",
      plan: true,
      context: {
        adAccountId: "act_123",
        brandId: "brand_456",
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plan).toBe(true);
    }
  });
});

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

  it("should parse a report with only executive_summary", () => {
    const minimal = { executive_summary: "Test summary" };
    const result = sotReportSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.executive_summary).toBe("Test summary");
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

describe("jainaChatStopRequestSchema", () => {
  it("accepts brand-scoped stop payload", () => {
    const result = jainaChatStopRequestSchema.safeParse({
      context: {
        adAccountId: "act_123",
        brandId: "brand_456",
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts ad-account stop payload", () => {
    const result = jainaChatStopRequestSchema.safeParse({
      ad_account_id: "act_123",
    });

    expect(result.success).toBe(true);
  });

  it("rejects payloads that do not match either contract shape", () => {
    const result = jainaChatStopRequestSchema.safeParse({
      context: {
        adAccountId: "act_123",
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("jainaChatStopResponseSchema", () => {
  it("accepts valid stop response", () => {
    const result = jainaChatStopResponseSchema.safeParse({
      status: "stopped",
      stopped_runs: 2,
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid status values", () => {
    const result = jainaChatStopResponseSchema.safeParse({
      status: "done",
      stopped_runs: 1,
    });

    expect(result.success).toBe(false);
  });
});
