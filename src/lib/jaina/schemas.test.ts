import { describe, it, expect } from "bun:test";
import {
  feedbackApprovalCommandSchema,
  jainaChatRequestSchema,
  parsePlanDecisionPayload,
  parsePlanRequestedPayload,
  planDecisionCommandSchema,
  planApprovalCommandSchema,
  jainaChatStopRequestSchema,
  jainaChatStopResponseSchema,
  responsePlanDecisionSchema,
  responsePlanRequestedSchema,
  frontendCheckpointReportSchema,
  handoffTraceEntrySchema,
  responseObjectiveUpdatedSchema,
  responseObjectivesSchema,
} from "./schemas";


describe("jainaChatRequestSchema", () => {
  it("accepts required request fields", () => {
    const result = jainaChatRequestSchema.safeParse({
      query: "Analyze my campaigns",
      context: {
        adAccountId: "act_123",
        brandId: "brand_456",
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts optional canvas fields", () => {
    const result = jainaChatRequestSchema.safeParse({
      query: "Analyze my campaigns",
      canvas: true,
      context: {
        adAccountId: "act_123",
        brandId: "brand_456",
        canvas: true,
        campaignCanvas: {
          nodes: [],
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts optional clarification id", () => {
    const result = jainaChatRequestSchema.safeParse({
      query: "Campaign-level view",
      clarification: {
        id: "clar_001",
      },
      context: {
        adAccountId: "act_123",
        brandId: "brand_456",
        sessionId: "session_abc",
      },
    });

    expect(result.success).toBe(true);
  });
});

describe("frontendCheckpointReportSchema Resilience", () => {
  it("should parse a minimal report with only executive_summary", () => {
    const minimal = { executive_summary: "Test summary" };
    const result = frontendCheckpointReportSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("en");
      expect(result.data.sections).toEqual([]);
      expect(result.data.strategic_recommendations).toEqual([]);
    }
  });

  it("should parse a report with only executive_summary", () => {
    const minimal = { executive_summary: "Test summary" };
    const result = frontendCheckpointReportSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.executive_summary).toBe("Test summary");
    }
  });

  it("should provide defaults for missing arrays", () => {
    const empty = {};
    const result = frontendCheckpointReportSchema.safeParse(empty);
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

describe("plan approval contracts", () => {
  it("accepts response.plan.requested payload", () => {
    const result = responsePlanRequestedSchema.safeParse({
      plan_id: "plan_7f3b1c",
      tool_name: "generate_performance_report",
      status: "awaiting_approval",
      summary: "Assemble full report",
      args: {
        reason: "Requested report artifact",
        plan: true,
        scopes: ["account", "creative"],
      },
      created_at: "2026-02-20T21:14:33.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("normalizes response.plan.requested camelCase payload", () => {
    const result = parsePlanRequestedPayload({
      planId: "hitl_call_1",
      toolName: "generate_performance_report",
      summary: "Assemble a full report",
      args: {
        reason: "User requested report",
        plan: true,
      },
      createdAt: "2026-02-20T21:14:33.000Z",
    });

    expect(result).not.toBeNull();
    expect(result?.plan_id).toBe("hitl_call_1");
  });

  it("accepts plan.decision command payload", () => {
    const result = planDecisionCommandSchema.safeParse({
      type: "plan.decision",
      data: {
        decision: "approve",
        planId: "hitl_call_1",
        reason: "Looks good",
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts feedback approval compatibility payload", () => {
    const result = feedbackApprovalCommandSchema.safeParse({
      type: "feedback",
      data: {
        approved: true,
        planId: "hitl_call_1",
        reason: "Proceed",
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts plan.approval command payload", () => {
    const result = planApprovalCommandSchema.safeParse({
      type: "plan.approval",
      data: {
        plan_id: "plan_7f3b1c",
        approved: true,
        note: "Proceed",
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts response.plan.decision payload", () => {
    const result = responsePlanDecisionSchema.safeParse({
      plan_id: "plan_7f3b1c",
      approved: false,
      status: "rejected",
      note: "Skip full report",
    });

    expect(result.success).toBe(true);
  });

  it("normalizes response.plan.decision variants", () => {
    const approve = parsePlanDecisionPayload({
      decision: "approve",
      planId: "hitl_call_1",
      reason: "Looks good",
    });
    const deny = parsePlanDecisionPayload({
      approved: false,
      planId: "hitl_call_1",
      reason: "Need tighter scope",
    });

    expect(approve).not.toBeNull();
    expect(approve?.status).toBe("approved");
    expect(deny).not.toBeNull();
    expect(deny?.status).toBe("rejected");
  });
  it("normalizes response.plan.decision variants", () => {
    const approve = parsePlanDecisionPayload({
      decision: "approve",
      planId: "hitl_call_1",
      reason: "Looks good",
    });
    const deny = parsePlanDecisionPayload({
      approved: false,
      planId: "hitl_call_1",
      reason: "Need tighter scope",
    });

    expect(approve).not.toBeNull();
    expect(approve?.status).toBe("approved");
    expect(deny).not.toBeNull();
    expect(deny?.status).toBe("rejected");
  });
});

describe("objective checklist stream contracts", () => {
  it("accepts response.objectives payloads", () => {
    const result = responseObjectivesSchema.safeParse({
      type: "response.objectives",
      data: {
        objectives: [
          {
            id: "objective_scope_campaigns",
            title: "Scope campaigns",
            status: "in_progress",
          },
        ],
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts unwrapped response.objectives arrays", () => {
    const result = responseObjectivesSchema.safeParse({
      type: "response.objectives",
      data: [
        {
          id: "objective_scope_campaigns",
          title: "Scope campaigns",
          status: "pending",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("accepts response.objective.updated payloads", () => {
    const result = responseObjectiveUpdatedSchema.safeParse({
      type: "response.objective.updated",
      data: {
        objective_id: "objective_scope_campaigns",
        status: "completed",
      },
    });

    expect(result.success).toBe(true);
  });
});

describe("handoffTraceEntrySchema", () => {
  it("accepts valid handoff trace entry", () => {
    const entry = {
      correlation_id: "corr_123",
      parent_correlation_id: null,
      from_scope: "router",
      to_scope: "analyst",
      objective: "Deep dive into spend",
      entity_id: "act_123",
      status: "completed",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: 1250,
      error: null,
    };
    const result = handoffTraceEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const entry = {
      correlation_id: "corr_123",
      status: "pending_approval", // not in enum
    };
    const result = handoffTraceEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });
});

describe("hasReportContent helper", () => {
  const { hasReportContent } = require("./schemas");

  it("returns true for direct_answer", () => {
    expect(hasReportContent({ type: "direct_answer", content: "hello" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(hasReportContent(null)).toBe(false);
  });

  it("returns true if executive_summary is present", () => {
    expect(hasReportContent({ executive_summary: "Summary", performance_snapshot: [], sections: [], strategic_recommendations: [], graphs: [] })).toBe(true);
  });

  it("returns false for empty report object", () => {
    expect(hasReportContent({ executive_summary: "", performance_snapshot: [], sections: [], strategic_recommendations: [], graphs: [] })).toBe(false);
  });

  it("returns true if performance_snapshot has items", () => {
    expect(hasReportContent({ executive_summary: "", performance_snapshot: [{ metric: "M", value: 1 }], sections: [], strategic_recommendations: [], graphs: [] })).toBe(true);
  });
});
