import { describe, expect, it } from "bun:test";

import {
  parsePersistedReportV2Value,
  parsePersistedReportValue,
} from "./persistedReport";

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

  it("preserves settled V2 checkpoint report blocks without legacy stripping", () => {
    const content = JSON.stringify({
      type: "response.checkpoint_report",
      data: {
        item_id: "item_v2",
        part_id: "part_v2",
        report: {
          language: "en",
          executive_summary: "Pilot comparison summary",
          blocks: [
            {
              block_id: "narrative_summary",
              category: "narrative",
              scope: "account",
              title: "Pilot Performance & Tracking Analysis",
              priority: "primary",
              body: "The exposed group had stronger engagement but no revenue tracking.",
              highlights: [],
            },
            {
              block_id: "metric_grid_groups",
              category: "metric_grid",
              scope: "account",
              title: "Group Executive Summary",
              priority: "primary",
              metrics: [
                {
                  label: "Exposed Spend",
                  value: 388997.51,
                  format: "currency",
                  severity: "neutral",
                },
              ],
            },
            {
              block_id: "incrementality_analysis",
              category: "comparison",
              scope: "account",
              title: "Incrementality Analysis",
              priority: "primary",
              before_label: "Control",
              after_label: "Exposed",
              pairs: [
                {
                  label: "Total Revenue",
                  before: 978843.28,
                  after: 0,
                  change: -978843.28,
                  format: "currency",
                  severity: "risk",
                },
              ],
            },
            {
              block_id: "campaign_comparison_table",
              category: "data_table",
              scope: "campaign",
              title: "Campaign Performance Comparison",
              priority: "secondary",
              columns: [
                { key: "name", label: "Campaign Name", format: "text" },
                { key: "spend", label: "Spend", format: "currency" },
              ],
              rows: [{ name: "Continuum - Generales", spend: 168906.8 }],
              notes: null,
            },
            {
              block_id: "revenue_trend_chart",
              category: "chart",
              scope: "account",
              title: "Daily Revenue Comparison",
              priority: "secondary",
              chart_type: "line",
              category_key: "date",
              value_key: null,
              value_format: "number",
              data: [{ date: "2026-05-01", control: 33900, exposed: 0 }],
              chart_config: {
                control: { color: "#4B7BFF", label: "Control Revenue" },
                exposed: { color: "#FF4B4B", label: "Exposed Revenue" },
              },
            },
          ],
          follow_up_questions: ["Should I verify custom conversion events?"],
          media_map: {},
          _meta: {
            schema_version: "2",
            block_count: 5,
            has_charts: true,
            has_media: false,
            has_citations: false,
            primary_scope: "account",
          },
        },
      },
    });

    const parsed = parsePersistedReportV2Value({
      report: undefined,
      content,
    });

    expect(parsed?.blocks).toHaveLength(5);
    expect(parsed?.blocks[0]?.category).toBe("narrative");
    expect(parsed?.blocks[0]?.body).toContain("stronger engagement");
    expect(parsed?.blocks[1]?.category).toBe("metric_grid");
    expect(parsed?.blocks[1]?.metrics[0]?.label).toBe("Exposed Spend");
    expect(parsed?.blocks[3]?.category).toBe("data_table");
    expect(parsed?.blocks[3]?.rows[0]?.name).toBe("Continuum - Generales");
    expect(parsed?.blocks[4]?.category).toBe("chart");
    expect(parsed?.blocks[4]?.chart_config.control.label).toBe("Control Revenue");
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

  it("parses report payload nested under result_payload wrappers", () => {
    const parsed = parsePersistedReportValue({
      report: {
        result_payload: {
          checkpoint_report: {
            executive_summary: "Hydrated from run payload wrapper",
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
      },
      content: "ignored",
    });

    expect(parsed?.executive_summary).toBe("Hydrated from run payload wrapper");
  });
});
