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
});
