import { describe, expect, it } from "bun:test";

import { parsePersistedReportValue } from "./persistedReport";

describe("parsePersistedReportValue", () => {
  it("parses report payload from persisted report column", () => {
    const parsed = parsePersistedReportValue({
      report: {
        executive_summary: "Persisted summary",
        sections: [],
        performance_snapshot: [],
        strategic_recommendations: [],
        follow_up_questions: [],
        handoff_trace: [],
        execution_objectives: [],
        cached_sources: [],
        graphs: [],
      },
      content: "ignored",
    });

    expect(parsed?.executive_summary).toBe("Persisted summary");
  });

  it("parses checkpoint_report envelope from raw content JSON", () => {
    const content = JSON.stringify({
      type: "checkpoint_report",
      report: {
        executive_summary: "Envelope summary",
        sections: [],
        performance_snapshot: [],
        strategic_recommendations: [],
        follow_up_questions: [],
        handoff_trace: [],
        execution_objectives: [],
        cached_sources: [],
        graphs: [],
      },
    });

    const parsed = parsePersistedReportValue({
      report: undefined,
      content,
    });

    expect(parsed?.executive_summary).toBe("Envelope summary");
  });

  it("parses response.checkpoint_report envelope with nested data.report payload", () => {
    const content = JSON.stringify({
      type: "response.checkpoint_report",
      data: {
        item_id: "item_1",
        part_id: "part_1",
        report: {
          executive_summary: "Nested response checkpoint summary",
          sections: [],
          performance_snapshot: [],
          strategic_recommendations: [],
          follow_up_questions: [],
          handoff_trace: [],
          execution_objectives: [],
          cached_sources: [],
          graphs: [],
        },
      },
    });

    const parsed = parsePersistedReportValue({
      report: undefined,
      content,
    });

    expect(parsed?.executive_summary).toBe("Nested response checkpoint summary");
  });

  it("parses block-based checkpoint report nested under response.checkpoint_report.data.report.blocks", () => {
    const content = JSON.stringify({
      type: "response.checkpoint_report",
      data: {
        report: {
          blocks: [
            {
              block_id: "blk_narrative_1",
              category: "narrative",
              scope: "account",
              title: "Executive Narrative",
              body: "Account performance remained stable this week.",
            },
          ],
          executive_summary: "Stable week with improving efficiency",
          _meta: {
            schema_version: "2",
            block_count: 1,
            has_charts: false,
            has_media: false,
            has_citations: false,
            primary_scope: "account",
          },
        },
      },
    });

    const parsed = parsePersistedReportValue({
      report: undefined,
      content,
    });

    expect(parsed?.executive_summary).toBe("Stable week with improving efficiency");
    expect(parsed?.sections[0]?.heading).toBe("Executive Narrative");
    expect(parsed?.blocks.length).toBeGreaterThan(0);
  });

  it("parses near-json checkpoint content that contains raw newlines in strings", () => {
    const content =
      '{"type":"checkpoint_report","report":{"executive_summary":"Line 1\nLine 2","sections":[],"performance_snapshot":[],"strategic_recommendations":[],"follow_up_questions":[],"handoff_trace":[],"execution_objectives":[],"cached_sources":[],"graphs":[]}}';

    const parsed = parsePersistedReportValue({
      report: undefined,
      content,
    });

    expect(parsed?.executive_summary).toContain("Line 1");
    expect(parsed?.executive_summary).toContain("Line 2");
  });

  it("parses checkpoint report nested inside content.parts text envelopes", () => {
    const content = JSON.stringify({
      content: {
        role: "model",
        parts: [
          {
            text: JSON.stringify({
              checkpoint_report: {
                report_metadata: {
                  title: "Weekly Campaign Performance & Budget Analysis",
                },
                blocks: [
                  {
                    scope: "account",
                    title: "Account Performance Summary",
                    summary: "ROAS is healthy for the period.",
                  },
                ],
              },
            }),
            thoughtSignature: "sig_1",
          },
        ],
      },
    });

    const parsed = parsePersistedReportValue({
      report: undefined,
      content,
    });

    expect(parsed?.report_title).toBe("Weekly Campaign Performance & Budget Analysis");
    expect(parsed?.sections[0]?.heading).toBe("Account Performance Summary");
  });

  it("parses checkpoint report from persisted reasoning traces when report column is empty", () => {
    const parsed = parsePersistedReportValue({
      report: undefined,
      content: "Synthesis summary unavailable.",
      reasoning: [
        {
          stage: "thinking",
          detail: JSON.stringify({
            type: "checkpoint_report",
            report: {
              executive_summary: "Recovered from reasoning payload",
              sections: [],
              performance_snapshot: [],
              strategic_recommendations: [],
              follow_up_questions: [],
              handoff_trace: [],
              execution_objectives: [],
              cached_sources: [],
              graphs: [],
            },
          }),
        },
      ],
    });

    expect(parsed?.executive_summary).toBe("Recovered from reasoning payload");
  });

  it("parses report JSON embedded after error text and non-report JSON fragments", () => {
    const content = [
      "Tool execution warning: partial timeout",
      '{"error":"timeout","scope":"tool"}',
      "Recovered checkpoint payload follows:",
      JSON.stringify({
        type: "checkpoint_report",
        report: {
          executive_summary: "Recovered after tool timeout",
          sections: [],
          performance_snapshot: [],
          strategic_recommendations: [],
          follow_up_questions: [],
          handoff_trace: [],
          execution_objectives: [],
          cached_sources: [],
          graphs: [],
        },
      }),
    ].join("\n");

    const parsed = parsePersistedReportValue({
      report: undefined,
      content,
    });

    expect(parsed?.executive_summary).toBe("Recovered after tool timeout");
  });

  it("does not treat isolated response.block.delta envelopes as full reports", () => {
    const content = JSON.stringify({
      type: "response.block.delta",
      data: {
        sequence: 1,
        block: {
          block_id: "blk_1",
          category: "narrative",
          scope: "account",
          title: "Narrative",
          body: "Delta fragment only",
        },
      },
    });

    const parsed = parsePersistedReportValue({
      report: undefined,
      content,
    });

    expect(parsed).toBeUndefined();
  });
});
