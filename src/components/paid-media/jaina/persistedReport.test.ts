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

// ---------------------------------------------------------------------------
// Full payload fixture — taken verbatim from a real jaina_conversation_runs
// result_payload. Tests here assert every field the renderer reads.
// ---------------------------------------------------------------------------
describe("parsePersistedReportV2Value — full payload coverage (real Supabase fixture)", () => {
  // Exact payload from brand_profiles.jaina_conversation_runs result_payload.
  // Outer envelope fields (handoff_trace, reasoning_trace, execution_objectives,
  // cached_sources) are stripped by Zod; the schema keeps only the fields below.
  const FULL_PAYLOAD = {
    type: "checkpoint_report",
    report: {
      _meta: {
        has_media: false,
        has_charts: true,
        block_count: 5,
        has_citations: false, // stripped — not in checkpointReportV2MetaSchema
        primary_scope: "account",
        schema_version: "2",
      },
      language: "en",
      executive_summary:
        "I strongly recommend reallocating budget from the 'Todos los idiomas' campaign to the 'público inglés 3x1' ad set. The targeted ad set delivers leads at less than half the cost ($32.69 vs. $63.76 per connection) and maintains a far superior engagement rate (4.46% CTR). The broad campaign is currently an inefficient use of capital compared to the high-resonance video creative in the English segment.",
      follow_up_questions: [
        "Should we test the winning English video creative in other specific language segments?",
        "Would you like to see a breakdown of the specific ads within 'público inglés 3x1' to identify the top creative?",
        "Do you want to evaluate if the 'Todos los idiomas' campaign should be completely paused or just restricted to lower-cost placements?",
      ],
      media_map: {},
      handoff_trace: [{ correlation_id: "handoff_x", status: "completed" }], // stripped
      cached_sources: [], // stripped
      reasoning_trace: "The analysis compared ...", // stripped
      execution_objectives: [{ id: "objective_1", status: "completed" }], // stripped
      blocks: [
        {
          block_id: "efficiency_comparison_narrative",
          category: "narrative",
          scope: "account",
          title: "Efficiency Audit: Campaign vs. Ad Set",
          priority: "primary",
          citations: [], // stripped — not in narrativeBlockV2Schema
          highlights: [],
          body: "A side-by-side audit of the last 30 days confirms a stark performance gap. The 'Todos los idiomas' campaign is struggling with high costs and low engagement, likely due to its overly broad targeting which fails to resonate with a specific audience. In contrast, 'público inglés 3x1' is currently the account's strongest performer in terms of audience resonance and lead generation efficiency. Moving funds to the English segment will maximize your lead volume without increasing overall spend.",
        },
        {
          block_id: "kpi_comparison_grid",
          category: "comparison",
          scope: "account",
          title: "Performance Side-by-Side (Last 30 Days)",
          priority: "primary",
          citations: [], // stripped
          before_label: "Todos los idiomas (Campaign)",
          after_label: "público inglés 3x1 (Ad Set)",
          pairs: [
            { unit: null, after: 4.46, label: "CTR", before: 0.9, change: 395.5, format: "percent", cite_ids: [], severity: "positive", change_direction: "up" },
            { unit: null, after: 2.54, label: "CPC", before: 7.2, change: -64.7, format: "currency", cite_ids: [], severity: "positive", change_direction: "down" },
            { unit: null, after: 448, label: "Messaging Connections", before: 216, change: 107.4, format: "number", cite_ids: [], severity: "positive", change_direction: "up" },
          ],
        },
        {
          block_id: "reallocation_recommendations",
          category: "insight_list",
          scope: "account",
          title: "Strategic Recommendations",
          priority: "primary",
          citations: [], // stripped
          items: [
            {
              title: "Immediate Budget Reallocation",
              impact: "Expect a significant increase in lead volume while maintaining current spend levels.",
              summary: "Transfer 50-100% of the daily budget from 'Todos los idiomas' to 'público inglés 3x1'.",
              cite_ids: [], // stripped
              priority: "high",
              severity: "positive",
              item_type: "action",
              rationale: "The English-targeted ad set is 2.5x more efficient at generating leads (messaging connections) for the same spend.",
            },
            {
              title: "Scale High-Resonance Creative",
              impact: "Diversifies lead sources and protects against audience fatigue in the primary ad set.",
              summary: "Identify the top 2 videos in the 'público inglés 3x1' set and test them against new audiences.",
              cite_ids: [],
              priority: "medium",
              severity: "positive",
              item_type: "recommendation",
              rationale: "The 4.46% CTR suggests the '3x1' video format is highly effective; scaling this creative concept to similar segments is low-risk.",
            },
            {
              title: "Broad Targeting Inefficiency",
              impact: "Continuing spend here represents a high opportunity cost for the account.",
              summary: "The 'Todos los idiomas' approach is currently failing to reach a relevant audience at a competitive price.",
              cite_ids: [],
              priority: "high",
              severity: "risk",
              item_type: "insight",
              rationale: "A CPC of $7.20 is unsustainably high for this account's average, indicating the algorithm is struggling to find buyers in that broad pool.",
            },
          ],
        },
        {
          block_id: "ctr_comparison_chart",
          category: "chart",
          scope: "account",
          title: "Engagement Rate Variance",
          priority: "secondary",
          value_key: null,
          annotation: null, // stripped
          chart_type: "bar",
          description: null, // stripped
          category_key: "Entity",
          chart_config: { CTR: { color: "#3B82F6", label: "CTR (%)" } },
          value_format: "percent",
          x_axis_label: null, // stripped
          y_axis_label: "CTR (%)", // stripped
          data: [
            { CTR: 0.9, Entity: "Todos los idiomas" },
            { CTR: 4.46, Entity: "público inglés 3x1" },
          ],
        },
        {
          block_id: "detailed_metrics_table",
          category: "data_table",
          scope: "account",
          title: "Detailed Performance Comparison",
          priority: "secondary",
          notes: null,
          columns: [
            { key: "name", align: "left", label: "Entity Name", format: "text" },
            { key: "spend", align: "left", label: "Spend", format: "currency" },
            { key: "impressions", align: "left", label: "Impressions", format: "number" },
            { key: "clicks", align: "left", label: "Clicks", format: "number" },
            { key: "ctr", align: "left", label: "CTR", format: "percent" },
            { key: "cpc", align: "left", label: "CPC", format: "currency" },
            { key: "leads", align: "left", label: "Connections", format: "number" },
          ],
          rows: [
            { cpc: 2.54, ctr: 4.46, name: "público inglés 3x1", leads: 448, spend: 14644.18, clicks: 5758, impressions: 129117 },
            { cpc: 7.2, ctr: 0.9, name: "Todos los idiomas", leads: 216, spend: 13772.4, clicks: 1913, impressions: 213183 },
          ],
        },
      ],
    },
  };

  it("parses successfully and returns a defined result", () => {
    const parsed = parsePersistedReportV2Value({ report: undefined, content: JSON.stringify(FULL_PAYLOAD) });
    expect(parsed).toBeDefined();
  });

  it("parses top-level report fields", () => {
    const parsed = parsePersistedReportV2Value({ report: undefined, content: JSON.stringify(FULL_PAYLOAD) });
    expect(parsed?.language).toBe("en");
    expect(parsed?.executive_summary).toContain("reallocating budget");
    expect(parsed?.follow_up_questions).toHaveLength(3);
    expect(parsed?.follow_up_questions[0]).toContain("winning English video creative");
    expect(parsed?.media_map).toEqual({});
  });

  it("parses _meta and coerces schema_version to string '2'", () => {
    const parsed = parsePersistedReportV2Value({ report: undefined, content: JSON.stringify(FULL_PAYLOAD) });
    expect(parsed?._meta.schema_version).toBe("2");
    expect(parsed?._meta.block_count).toBe(5);
    expect(parsed?._meta.has_charts).toBe(true);
    expect(parsed?._meta.has_media).toBe(false);
    expect(parsed?._meta.primary_scope).toBe("account");
  });

  it("parses all 5 blocks and maps 'primary'/'secondary' priority to numeric rank", () => {
    const parsed = parsePersistedReportV2Value({ report: undefined, content: JSON.stringify(FULL_PAYLOAD) });
    expect(parsed?.blocks).toHaveLength(5);
    // "primary" → rank 0, "secondary" → rank 1
    const primaryBlocks = (parsed?.blocks ?? []).filter((b) => b.priority === 0);
    const secondaryBlocks = (parsed?.blocks ?? []).filter((b) => b.priority === 1);
    expect(primaryBlocks).toHaveLength(3);
    expect(secondaryBlocks).toHaveLength(2);
  });

  it("narrative block — preserves body, highlights, block_id, scope, title", () => {
    const parsed = parsePersistedReportV2Value({ report: undefined, content: JSON.stringify(FULL_PAYLOAD) });
    const block = (parsed?.blocks ?? []).find((b) => b.block_id === "efficiency_comparison_narrative");
    expect(block?.category).toBe("narrative");
    expect(block?.scope).toBe("account");
    expect(block?.title).toBe("Efficiency Audit: Campaign vs. Ad Set");
    if (block?.category === "narrative") {
      expect(block.body).toContain("stark performance gap");
      expect(block.highlights).toHaveLength(0);
    }
  });

  it("comparison block — before/after labels and all 3 pairs with full field coverage", () => {
    const parsed = parsePersistedReportV2Value({ report: undefined, content: JSON.stringify(FULL_PAYLOAD) });
    const block = (parsed?.blocks ?? []).find((b) => b.block_id === "kpi_comparison_grid");
    expect(block?.category).toBe("comparison");
    if (block?.category !== "comparison") return;

    expect(block.before_label).toBe("Todos los idiomas (Campaign)");
    expect(block.after_label).toBe("público inglés 3x1 (Ad Set)");
    expect(block.pairs).toHaveLength(3);

    const [ctr, cpc, connections] = block.pairs;
    expect(ctr.label).toBe("CTR");
    expect(ctr.before).toBe(0.9);
    expect(ctr.after).toBe(4.46);
    expect(ctr.change).toBe(395.5);
    expect(ctr.format).toBe("percent");
    expect(ctr.severity).toBe("positive");
    expect(ctr.change_direction).toBe("up");

    expect(cpc.label).toBe("CPC");
    expect(cpc.before).toBe(7.2);
    expect(cpc.after).toBe(2.54);
    expect(cpc.change).toBe(-64.7);
    expect(cpc.format).toBe("currency");
    expect(cpc.change_direction).toBe("down");

    expect(connections.label).toBe("Messaging Connections");
    expect(connections.before).toBe(216);
    expect(connections.after).toBe(448);
    expect(connections.format).toBe("number");
  });

  it("insight_list block — all 3 items with priority 'high'/'medium', item_type, severity, rationale, impact", () => {
    const parsed = parsePersistedReportV2Value({ report: undefined, content: JSON.stringify(FULL_PAYLOAD) });
    const block = (parsed?.blocks ?? []).find((b) => b.block_id === "reallocation_recommendations");
    expect(block?.category).toBe("insight_list");
    if (block?.category !== "insight_list") return;

    expect(block.items).toHaveLength(3);
    const [action, recommendation, insight] = block.items;

    expect(action.item_type).toBe("action");
    expect(action.title).toBe("Immediate Budget Reallocation");
    expect(action.summary).toContain("50-100%");
    expect(action.priority).toBe("high");
    expect(action.severity).toBe("positive");
    expect(action.rationale).toContain("2.5x more efficient");
    expect(action.impact).toContain("increase in lead volume");

    expect(recommendation.item_type).toBe("recommendation");
    expect(recommendation.priority).toBe("medium");
    expect(recommendation.severity).toBe("positive");

    expect(insight.item_type).toBe("insight");
    expect(insight.priority).toBe("high");
    expect(insight.severity).toBe("risk");
    expect(insight.rationale).toContain("$7.20");
  });

  it("chart block — chart_type, category_key, value_format, data rows, chart_config entry", () => {
    const parsed = parsePersistedReportV2Value({ report: undefined, content: JSON.stringify(FULL_PAYLOAD) });
    const block = (parsed?.blocks ?? []).find((b) => b.block_id === "ctr_comparison_chart");
    expect(block?.category).toBe("chart");
    if (block?.category !== "chart") return;

    expect(block.chart_type).toBe("bar");
    expect(block.category_key).toBe("Entity");
    expect(block.value_key).toBeNull();
    expect(block.value_format).toBe("percent");
    expect(block.data).toHaveLength(2);
    expect(block.data[0]).toMatchObject({ CTR: 0.9, Entity: "Todos los idiomas" });
    expect(block.data[1]).toMatchObject({ CTR: 4.46, Entity: "público inglés 3x1" });
    expect(block.chart_config["CTR"]?.color).toBe("#3B82F6");
    expect(block.chart_config["CTR"]?.label).toBe("CTR (%)");
  });

  it("data_table block — all 7 columns with key/label/format/align and both data rows", () => {
    const parsed = parsePersistedReportV2Value({ report: undefined, content: JSON.stringify(FULL_PAYLOAD) });
    const block = (parsed?.blocks ?? []).find((b) => b.block_id === "detailed_metrics_table");
    expect(block?.category).toBe("data_table");
    if (block?.category !== "data_table") return;

    expect(block.columns).toHaveLength(7);
    expect(block.columns[0]).toMatchObject({ key: "name", label: "Entity Name", format: "text", align: "left" });
    expect(block.columns[1]).toMatchObject({ key: "spend", label: "Spend", format: "currency", align: "left" });
    expect(block.columns[4]).toMatchObject({ key: "ctr", label: "CTR", format: "percent", align: "left" });
    expect(block.columns[6]).toMatchObject({ key: "leads", label: "Connections", format: "number", align: "left" });

    expect(block.rows).toHaveLength(2);
    expect(block.rows[0]).toMatchObject({ name: "público inglés 3x1", spend: 14644.18, cpc: 2.54, ctr: 4.46, leads: 448 });
    expect(block.rows[1]).toMatchObject({ name: "Todos los idiomas", spend: 13772.4, cpc: 7.2, ctr: 0.9, leads: 216 });
    expect(block.notes).toBeNull();
  });

  it("strips extra envelope fields that are not in the schema", () => {
    const parsed = parsePersistedReportV2Value({ report: undefined, content: JSON.stringify(FULL_PAYLOAD) });
    // handoff_trace, reasoning_trace, execution_objectives, cached_sources must not leak through
    expect((parsed as Record<string, unknown>)?.["handoff_trace"]).toBeUndefined();
    expect((parsed as Record<string, unknown>)?.["reasoning_trace"]).toBeUndefined();
    expect((parsed as Record<string, unknown>)?.["execution_objectives"]).toBeUndefined();
    expect((parsed as Record<string, unknown>)?.["cached_sources"]).toBeUndefined();
  });

  it("blocks sorted by priority produce primary blocks before secondary blocks", () => {
    const parsed = parsePersistedReportV2Value({ report: undefined, content: JSON.stringify(FULL_PAYLOAD) });
    const sorted = [...(parsed?.blocks ?? [])].sort((a, b) => a.priority - b.priority);
    expect(sorted[0].block_id).toBe("efficiency_comparison_narrative");
    expect(sorted[4].priority).toBe(1); // both chart and data_table are secondary
  });
});

describe("parsePersistedReportV2Value — numeric schema_version", () => {
  const v2NarrativeBlock = {
    block_id: "blk_1",
    category: "narrative",
    scope: "account",
    title: "Budget Reallocation Analysis",
    priority: 0,
    body: "Reallocate budget from low-performing campaigns.",
    highlights: [],
  };

  const v2Meta = (version: number | string) => ({
    schema_version: version,
    block_count: 1,
    has_charts: false,
    has_media: false,
    primary_scope: "account",
  });

  it("returns defined when schema_version is number 2", () => {
    const parsed = parsePersistedReportV2Value({
      report: {
        _meta: v2Meta(2),
        executive_summary: "Budget analysis",
        blocks: [v2NarrativeBlock],
        follow_up_questions: [],
        media_map: {},
      },
      content: "",
    });

    expect(parsed).toBeDefined();
    expect(parsed?.blocks).toHaveLength(1);
    expect(parsed?.blocks[0].title).toBe("Budget Reallocation Analysis");
  });

  it("returns defined when schema_version is string '2'", () => {
    const parsed = parsePersistedReportV2Value({
      report: {
        _meta: v2Meta("2"),
        executive_summary: "Budget analysis",
        blocks: [v2NarrativeBlock],
        follow_up_questions: [],
        media_map: {},
      },
      content: "",
    });

    expect(parsed).toBeDefined();
    expect(parsed?.blocks).toHaveLength(1);
  });

  it("parses insight_list block with priority values 'high' and 'medium'", () => {
    const parsed = parsePersistedReportV2Value({
      report: {
        _meta: v2Meta("2"),
        executive_summary: "Budget reallocation analysis",
        blocks: [
          v2NarrativeBlock,
          {
            block_id: "reallocation_recommendations",
            category: "insight_list",
            scope: "account",
            title: "Strategic Recommendations",
            priority: "primary",
            citations: [],
            items: [
              {
                title: "Immediate Budget Reallocation",
                summary: "Transfer budget to the high-performing ad set.",
                item_type: "action",
                priority: "high",
                severity: "positive",
              },
              {
                title: "Scale High-Resonance Creative",
                summary: "Identify top videos and test against new audiences.",
                item_type: "recommendation",
                priority: "medium",
                severity: "positive",
              },
            ],
          },
        ],
        follow_up_questions: [],
        media_map: {},
      },
      content: "",
    });

    expect(parsed).toBeDefined();
    expect(parsed?.blocks).toHaveLength(2);
    const insightBlock = parsed?.blocks[1] as { items: { priority: string }[] };
    expect(insightBlock?.items[0]?.priority).toBe("high");
    expect(insightBlock?.items[1]?.priority).toBe("medium");
  });

  it("parses V2 payload nested under checkpoint_report envelope with numeric schema_version", () => {
    const parsed = parsePersistedReportV2Value({
      report: {
        checkpoint_report: {
          _meta: v2Meta(2),
          executive_summary: "Nested budget analysis",
          blocks: [v2NarrativeBlock],
          follow_up_questions: [],
          media_map: {},
        },
      },
      content: "",
    });

    expect(parsed).toBeDefined();
    expect(parsed?.executive_summary).toBe("Nested budget analysis");
  });
});
