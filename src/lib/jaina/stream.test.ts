import { describe, expect, it } from "bun:test";
import {
  createInitialJainaStreamState,
  parseJainaStreamEvent,
  reduceJainaStreamEvent,
  type JainaStreamState,
} from "./stream";
import type { FrontendCheckpointReport } from "./schemas";

function asStructuredReport(state: JainaStreamState): FrontendCheckpointReport {
  const report = state.report;
  if (!report || ("type" in report && report.type === "direct_answer")) {
    throw new Error("Expected structured report");
  }
  return report as FrontendCheckpointReport;
}

describe("reduceJainaStreamEvent text deltas", () => {
  it("hydrates report incrementally from output_text deltas before stream completion", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_1",
        part_id: "part_1",
        delta:
          '{"summary":"Campaign summary","performance_snapshot":[{"label":"Spend","value":1200}],"key_insights":[{"title":"Efficiency Leader","description":"Top ad set","impact":"POSITIVE"}],',
      },
    } as any);

    let report = asStructuredReport(state);
    expect(report.executive_summary).toBe("Campaign summary");
    expect(report.performance_snapshot.length).toBe(1);
    expect(report.sections[0].highlights.length).toBe(1);

    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_1",
        part_id: "part_1",
        delta:
          '"action_plan":[{"type":"PAUSE_UNDERPERFORMER","priority":"HIGH","description":"Pause low ROAS ad set"}],',
      },
    } as any);

    report = asStructuredReport(state);
    expect(report.strategic_recommendations.length).toBe(1);
    expect(report.strategic_recommendations[0].title).toContain("Pause");
  });

  it("maps SoT report sections and recommendations from nested output_json payloads", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.output_json.delta",
      data: {
        delta: JSON.stringify({
          report: {
            executive_summary: "Top-level summary",
            sections: [
              {
                heading: "Analysis",
                scope: "account",
                summary: "Section summary",
                highlights: ["Revenue is lagging on iOS campaigns."],
                actions: [
                  {
                    action: "Pause iOS campaigns",
                    description: "Spend is not returning value.",
                    priority: "high",
                  },
                ],
              },
            ],
            strategic_recommendations: [
              {
                action: "Reallocate budget to Android",
                description: "Android has stronger ROAS.",
                priority: "medium",
              },
            ],
          },
        }),
      },
    } as any);

    const report = asStructuredReport(state);
    expect(report.executive_summary).toBe("Top-level summary");
    expect(report.sections[0]?.summary).toBe("Section summary");
    expect(report.sections[0]?.highlights[0]?.text).toContain("Revenue is lagging");
    expect(report.sections[0]?.actions[0]?.title).toBe("Pause iOS campaigns");
    expect(report.strategic_recommendations[0]?.title).toBe("Reallocate budget to Android");
  });

  it("parses checkpoint_report envelope emitted as raw output_text JSON", () => {
    let state = createInitialJainaStreamState();

    const rawCheckpointEnvelope = {
      type: "checkpoint_report",
      report: {
        language: "en",
        executive_summary: "Envelope summary",
        performance_snapshot: [
          { metric: "Total Spend", value: "$1,200.00", status: "neutral" },
        ],
        sections: [
          {
            heading: "Campaign Health",
            scope: "campaign",
            summary: "Campaign has stable ROAS but high frequency risk.",
            highlights: [
              {
                category: "risk",
                text: "Frequency is above target.",
                severity: "watch",
              },
            ],
            tables: [
              {
                title: "Campaign KPIs",
                columns: ["Metric", "Value"],
                rows: [{ Metric: "ROAS", Value: "2.1" }],
              },
            ],
            actions: [
              {
                title: "Refresh creatives",
                rationale: "Reduce fatigue on high-frequency audiences.",
                priority: "high",
              },
            ],
          },
        ],
        strategic_recommendations: [
          {
            title: "Scale top segment",
            rationale: "Best blended efficiency this week.",
            priority: "medium",
          },
        ],
        follow_up_questions: ["Want ad set breakdown next?"],
      },
    };

    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_1",
        part_id: "part_1",
        delta: JSON.stringify(rawCheckpointEnvelope),
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.done",
      data: {
        id: "resp_1",
        object: "realtime.response",
        status: "completed",
        status_details: null,
        output: [],
      },
    } as any);

    const report = asStructuredReport(state);
    expect(report.executive_summary).toBe("Envelope summary");
    expect(report.sections[0]?.heading).toBe("Campaign Health");
    expect(report.sections[0]?.tables[0]?.title).toBe("Campaign KPIs");
    expect(report.sections[0]?.tables[0]?.rows[0]).toEqual({
      Metric: "ROAS",
      Value: "2.1",
    });
    expect(report.strategic_recommendations[0]?.title).toBe("Scale top segment");
  });

  it("parses nested content.parts checkpoint JSON emitted as output_text", () => {
    let state = createInitialJainaStreamState();

    const nestedContentEnvelope = {
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
                    summary: "ROAS remains efficient at current spend.",
                    data: {
                      headers: ["Metric", "Value"],
                      rows: [["Total Spend", "$151,593.91"]],
                    },
                  },
                ],
              },
            }),
            thoughtSignature: "sig_1",
          },
        ],
      },
    };

    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_1",
        part_id: "part_1",
        delta: JSON.stringify(nestedContentEnvelope),
      },
    } as any);

    const report = asStructuredReport(state);
    expect(report.report_title).toBe("Weekly Campaign Performance & Budget Analysis");
    expect(report.sections[0]?.heading).toBe("Account Performance Summary");
    expect(report.sections[0]?.tables[0]?.rows[0]).toEqual([
      "Total Spend",
      "$151,593.91",
    ]);
  });

  it("parses compatibility output_json deltas that carry payload fields at the root", () => {
    let state = createInitialJainaStreamState();

    const event = parseJainaStreamEvent(
      JSON.stringify({
        type: "response.output_json.delta",
        delta: JSON.stringify({
          executive_summary:
            "Reallocate 15-20% of spend from high-CPC prospecting into efficient lookalikes.",
          strategic_recommendations: [
            {
              title: "Shift prospecting budget",
              rationale: "High-CPC broad prospecting is underperforming versus lookalikes.",
              expected_impact: "Lower blended CPC and improved ROAS",
              priority: "HIGH",
            },
          ],
        }),
      })
    );

    expect(event).not.toBeNull();
    if (event) {
      state = reduceJainaStreamEvent(state, event);
    }

    expect(state.status).not.toBe("error");
    const report = asStructuredReport(state);
    expect(report.executive_summary).toContain("Reallocate 15-20% of spend");
    expect(report.strategic_recommendations[0]?.title).toBe("Shift prospecting budget");
  });

  it("maps strategic assembly deltas (summary.narrative + metrics) into SoT report fields", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.output_json.delta",
      data: {
        delta: JSON.stringify({
          header: {
            title: "Strategic Spend Shift",
            period: "Last 30 days",
            report_tags: ["strategic"],
          },
          summary: {
            narrative:
              "Analysis shows a 15-20% reallocation opportunity from broad prospecting into high-efficiency lookalikes.",
            principal_deviation: "Prospecting CPC is elevated while lookalikes remain underfunded.",
          },
          metrics: [
            {
              label: "Prospecting CPC",
              planned: 1.1,
              actual: 3.71,
              index_percent: 237.0,
              unit: "%",
              deviation_type: "negative",
            },
          ],
          charts: [],
          insights: [],
          recommendations: [
            {
              title: "Move budget to lookalikes",
              rationale: "Lookalikes deliver materially lower CPC with stronger CTR.",
              expected_impact: "Higher ROI",
              priority: "HIGH",
            },
          ],
        }),
      },
    } as any);

    const report = asStructuredReport(state);
    expect(report.report_title).toBe("Strategic Spend Shift");
    expect(report.executive_summary).toContain("15-20% reallocation opportunity");
    expect(report.performance_snapshot.length).toBe(1);
    expect(report.performance_snapshot[0]?.metric).toBe("Prospecting CPC");
    expect(report.performance_snapshot[0]?.value).toBe(3.71);
    expect(report.strategic_recommendations[0]?.title).toBe("Move budget to lookalikes");
  });

  it("promotes section actions to strategic recommendations when top-level recommendations are missing", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.output_json.delta",
      data: {
        delta: JSON.stringify({
          report: {
            executive_summary: "Action-only recommendations",
            sections: [
              {
                heading: "What to do next",
                scope: "campaign",
                summary: "Immediate optimizations",
                actions: [
                  {
                    action: "Pause laggard set",
                    description: "Consistent low ROAS over 7 days.",
                    priority: "high",
                  },
                ],
              },
            ],
          },
        }),
      },
    } as any);

    const report = asStructuredReport(state);
    expect(report.strategic_recommendations.length).toBe(1);
    expect(report.strategic_recommendations[0]?.title).toBe("Pause laggard set");
  });

  it("maps SpecialistReport summary object and section content/table fields", () => {
    let state = createInitialJainaStreamState();

    const specialistPayload = {
      report_type: "SpecialistReport",
      summary: {
        title: "Ad Set Breakdown",
        overview: "ROAS is stable but frequency is high.",
        key_findings: ["Frequency indicates audience saturation."],
        recommendations: [
          "Refresh creatives to reduce fatigue.",
          "Test broader audiences.",
        ],
      },
      budget: {
        total_spend: 250491.65,
        currency: "USD",
      },
      kpis: [
        { name: "ROAS", value: 1.78, unit: "x", status: "critical" },
        { name: "CTR", value: 0.97, unit: "%", status: "watch" },
      ],
      sections: [
        {
          title: "Ad Set Performance Metrics",
          content: "Detailed metrics for this ad set.",
          table: {
            headers: ["Ad Set Name", "Spend", "ROAS"],
            rows: [["A+ Android", "$250,491.65", "1.78"]],
          },
        },
      ],
      graphs: [
        {
          title: "Efficiency Metrics Comparison",
          graph_type: "bar",
          data_format: "chartjs",
          frontend_parser: "chartjs_v1",
          labels: ["ROAS", "CTR (%)", "Frequency"],
          datasets: [{ label: "Metric Value", data: [1.78, 0.97, 7.34] }],
        },
      ],
    };

    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_specialist",
        part_id: "part_specialist",
        delta: `Here's my analysis\\n\\n${JSON.stringify(specialistPayload)}`,
      },
    } as any);

    const report = asStructuredReport(state);
    expect(report.report_title).toBe("Ad Set Breakdown");
    expect(report.executive_summary).toContain("frequency is high");
    expect(report.budget?.total_spend).toBe(250491.65);
    expect(report.sections[0]?.summary).toBe("Detailed metrics for this ad set.");
    expect(report.sections[0]?.highlights[0]?.text).toContain("audience saturation");
    expect(report.sections[0]?.tables.length).toBe(1);
    expect(report.strategic_recommendations.length).toBe(2);
    expect(report.performance_snapshot.some((metric) => metric.metric === "ROAS")).toBe(true);
    expect(report.performance_snapshot.some((metric) => metric.metric === "Total Spend")).toBe(true);
    expect((report.graphs[0] as Record<string, unknown>)?.title).toBe(
      "Efficiency Metrics Comparison"
    );
  });

  it("keeps plain unwrapped text responses as text content", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.content_part.added",
      data: {
        item_id: "item_text_1",
        part: {
          id: "part_text_1",
          object: "realtime.content_part",
          type: "text",
          text: "",
        },
      },
    } as any);

    const plainDelta =
      "You currently have 7 active campaigns running. Total spend over the last 7 days is $132,130.34.";
    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_text_1",
        part_id: "part_text_1",
        delta: plainDelta,
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.content_part.done",
      data: {
        item_id: "item_text_1",
        part_id: "part_text_1",
      },
    } as any);
    state = reduceJainaStreamEvent(state, {
      type: "response.output_item.done",
      data: { item_id: "item_text_1" },
    } as any);
    state = reduceJainaStreamEvent(state, {
      type: "response.done",
      data: {
        id: "resp_text_1",
        object: "realtime.response",
        status: "completed",
        status_details: null,
        output: [],
      },
    } as any);

    expect(state.status).toBe("complete");
    expect(state.finalContentKind).toBe("text");
    expect(state.report).toBeNull();
    expect(state.responseText).toContain("7 active campaigns");
  });

  it("does not append structured JSON deltas into responseText fallback", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_text_json",
        part_id: "part_text_json",
        delta: "High-level summary before structured report.",
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_text_json",
        part_id: "part_text_json",
        delta:
          '{"executive_summary":"Structured summary","performance_snapshot":[{"metric":"Spend","value":1200}]}',
      },
    } as any);

    expect(state.responseText).toBe("High-level summary before structured report.");
    expect(state.report).not.toBeNull();
  });
});

describe("reduceJainaStreamEvent canonical report events", () => {
  it("stores run metadata from response.run.created events", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.run.created",
      data: {
        run_id: "run_123",
        session_id: "sess_abc",
      },
    } as any);

    expect(state.status).not.toBe("error");
    expect(state.runId).toBe("run_123");
    expect(state.runSessionId).toBe("sess_abc");
  });

  it("ignores duplicate response.created for the same response id", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.created",
      data: {
        id: "resp_dupe",
        object: "realtime.response",
        status: "in_progress",
        status_details: null,
        output: [],
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_dupe",
        part_id: "part_dupe",
        delta: "intermediate delta",
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.created",
      data: {
        id: "resp_dupe",
        object: "realtime.response",
        status: "in_progress",
      },
    } as any);

    expect(state.responseId).toBe("resp_dupe");
    expect(state.responseText).toContain("intermediate delta");
  });

  it("ignores foreign response.created while another response is in-flight", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.created",
      data: {
        id: "resp_current",
        object: "realtime.response",
        status: "in_progress",
        status_details: null,
        output: [],
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_current",
        part_id: "part_current",
        delta: "still streaming current response",
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.created",
      data: {
        id: "resp_other",
        object: "realtime.response",
        status: "in_progress",
      },
    } as any);

    expect(state.responseId).toBe("resp_current");
    expect(state.responseText).toContain("still streaming current response");
    expect(state.status).toBe("streaming");
  });

  it("does not clear accumulated content when a foreign response.created arrives after an error", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.created",
      data: {
        id: "resp_primary",
        object: "realtime.response",
        status: "in_progress",
        status_details: null,
        output: [],
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_primary",
        part_id: "part_primary",
        delta: "Recovered analysis content that should stay visible.",
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.done",
      data: {
        id: "resp_primary",
        object: "realtime.response",
        status: "failed",
        status_details: {
          message: "One tool failed after content was generated",
        },
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.created",
      data: {
        id: "resp_secondary",
        object: "realtime.response",
        status: "in_progress",
        status_details: null,
        output: [],
      },
    } as any);

    expect(state.responseId).toBe("resp_primary");
    expect(state.responseText).toContain("Recovered analysis content");
    expect(state.status).toBe("error");
  });

  it("ignores response.done events for a different response id", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.created",
      data: {
        id: "resp_current",
        object: "realtime.response",
        status: "in_progress",
        status_details: null,
        output: [],
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.done",
      data: {
        id: "resp_other",
        object: "realtime.response",
        status: "completed",
      },
    } as any);

    expect(state.status).toBe("streaming");
    expect(state.responseId).toBe("resp_current");
  });

  it("hydrates state from response.checkpoint_report", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.checkpoint_report",
      data: {
        item_id: "item_1",
        part_id: "part_1",
        report: {
          language: "en",
          executive_summary: "Campaign summary",
          performance_snapshot: [{ metric: "Spend", value: 1200, status: "neutral" }],
          sections: [],
          strategic_recommendations: [],
          follow_up_questions: [],
          handoff_trace: [],
          cached_sources: [],
          graphs: [],
        },
      },
    } as any);

    const report = asStructuredReport(state);
    expect(report.executive_summary).toBe("Campaign summary");
    expect(state.itemId).toBe("item_1");
  });

  it("keeps the hydrated report when response.done arrives with failed status", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.checkpoint_report",
      data: {
        item_id: "item_failed_done",
        part_id: "part_failed_done",
        report: {
          language: "en",
          executive_summary: "Checkpoint already generated before failure.",
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
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.done",
      data: {
        id: "resp_failed_1",
        object: "realtime.response",
        status: "failed",
        status_details: {
          message: "Upstream tool timeout",
        },
        output: [],
      },
    } as any);

    const report = asStructuredReport(state);
    expect(state.status).toBe("error");
    expect(state.error).toBe("Upstream tool timeout");
    expect(report.executive_summary).toBe(
      "Checkpoint already generated before failure."
    );
    expect(state.finalContentKind).toBe("report");
  });

  it("recovers report content from reportJson when response.done fails before completion", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_failed_text",
        part_id: "part_failed_text",
        delta: JSON.stringify({
          checkpoint_report: {
            report_metadata: { title: "Recovered On Failed Done" },
            blocks: [
              {
                scope: "account",
                title: "Summary",
                summary: "Recovered from buffered output_text delta.",
              },
            ],
          },
        }),
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.done",
      data: {
        id: "resp_failed_2",
        object: "realtime.response",
        status: "failed",
        status_details: {
          message: "Model stream failed late",
        },
      },
    } as any);

    const report = asStructuredReport(state);
    expect(state.status).toBe("error");
    expect(state.error).toBe("Model stream failed late");
    expect(report.report_title).toBe("Recovered On Failed Done");
    expect(report.sections[0]?.summary).toContain("Recovered from buffered");
    expect(state.finalContentKind).toBe("report");
  });

  it("hydrates synthesis blocks from response.checkpoint_report.data.report.blocks", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.checkpoint_report",
      data: {
        item_id: "item_blocks",
        part_id: "part_blocks",
        report: {
          executive_summary: "Synthesis complete.",
          blocks: [
            {
              block_id: "summary_1",
              category: "summary_breakdown",
              scope: "account",
              title: "Account Summary",
              summary: "Highlights and actions.",
              cached_sources: ["cache://summary"],
              highlights: [
                {
                  category: "performance",
                  text: "ROAS improved week-over-week.",
                  impact: "positive",
                  severity: "positive",
                  confidence: null,
                  evidence: [],
                },
              ],
              actions: [],
              tables: [],
            },
            {
              block_id: "insights_1",
              category: "insight_recommendation",
              scope: "account",
              title: "Decision Layer",
              summary: "Recommendations and questions.",
              cached_sources: [],
              items: [
                {
                  item_type: "recommendation",
                  title: "Reallocate Budget",
                  summary: "Shift 20% toward top performers.",
                  payload: { priority: "HIGH" },
                },
                {
                  item_type: "question",
                  title: "Approval",
                  summary: "Can we reallocate this week?",
                  payload: {},
                },
              ],
            },
          ],
        },
      },
    } as any);

    expect(state.status).not.toBe("error");
    const report = asStructuredReport(state);
    expect(report.blocks.length).toBe(2);
    expect(report.sections.length).toBeGreaterThan(0);
    expect(report.strategic_recommendations[0]?.title).toBe("Reallocate Budget");
    expect(report.follow_up_questions).toContain("Can we reallocate this week?");
  });

  it("orders and dedupes progressive response.block.delta events by sequence", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.block.delta",
      data: {
        sequence: 2,
        source: "thought",
        agent: "synthesis_agent",
        block: {
          block_id: "block_2",
          category: "insight_recommendation",
          scope: "account",
          title: "Recommendations",
          summary: "Actions to take.",
          cached_sources: [],
          items: [
            {
              item_type: "recommendation",
              title: "Shift Budget",
              summary: "Move budget to stronger campaigns.",
              payload: {},
            },
          ],
        },
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.block.delta",
      data: {
        sequence: 1,
        source: "thought",
        agent: "synthesis_agent",
        block: {
          block_id: "block_1",
          category: "summary_breakdown",
          scope: "account",
          title: "Summary",
          summary: "Top findings.",
          cached_sources: [],
          highlights: [],
          actions: [],
          tables: [],
        },
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.block.delta",
      data: {
        sequence: 1,
        source: "thought",
        agent: "synthesis_agent",
        block: {
          block_id: "block_1",
          category: "summary_breakdown",
          scope: "account",
          title: "Updated Summary",
          summary: "Top findings updated.",
          cached_sources: [],
          highlights: [],
          actions: [],
          tables: [],
        },
      },
    } as any);

    const report = asStructuredReport(state);
    expect(state.blockDeltas.map((entry) => entry.sequence)).toEqual([1, 2]);
    expect(report.blocks.length).toBe(2);
    expect(report.blocks[0]?.title).toBe("Summary");
    expect(report.blocks[1]?.title).toBe("Recommendations");
  });

  it("reconciles progressive blocks with final response.checkpoint_report", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.block.delta",
      data: {
        sequence: 1,
        source: "thought",
        agent: "synthesis_agent",
        block: {
          block_id: "progressive_1",
          category: "summary_breakdown",
          scope: "account",
          title: "Progressive",
          summary: "Interim summary.",
          cached_sources: [],
          highlights: [],
          actions: [],
          tables: [],
        },
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.checkpoint_report",
      data: {
        item_id: "final_item",
        part_id: "final_part",
        report: {
          executive_summary: "Final report.",
          blocks: [
            {
              block_id: "final_1",
              category: "summary_breakdown",
              scope: "account",
              title: "Final Summary",
              summary: "Authoritative summary.",
              cached_sources: [],
              highlights: [],
              actions: [],
              tables: [],
            },
          ],
        },
      },
    } as any);

    const report = asStructuredReport(state);
    expect(state.hasCanonicalCheckpointReport).toBe(true);
    expect(state.blockDeltas).toEqual([]);
    expect(report.blocks.length).toBe(1);
    expect(report.blocks[0]?.title).toBe("Final Summary");
    expect(state.itemId).toBe("final_item");
  });

  it("ignores progressive blocks after canonical checkpoint report arrives", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.checkpoint_report",
      data: {
        item_id: "final_item",
        part_id: "final_part",
        report: {
          executive_summary: "Final report.",
          blocks: [
            {
              block_id: "final_1",
              category: "summary_breakdown",
              scope: "account",
              title: "Final Summary",
              summary: "Authoritative summary.",
              cached_sources: [],
              highlights: [],
              actions: [],
              tables: [],
            },
          ],
        },
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.block.delta",
      data: {
        sequence: 1,
        source: "thought",
        agent: "synthesis_agent",
        block: {
          block_id: "late_preview",
          category: "summary_breakdown",
          scope: "account",
          title: "Late Preview",
          summary: "Should not override final report.",
          cached_sources: [],
          highlights: [],
          actions: [],
          tables: [],
        },
      },
    } as any);

    const report = asStructuredReport(state);
    expect(state.blockDeltas).toEqual([]);
    expect(report.blocks.length).toBe(1);
    expect(report.blocks[0]?.title).toBe("Final Summary");
  });

  it("does not let output_json deltas overwrite canonical checkpoint report", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.checkpoint_report",
      data: {
        item_id: "item_final",
        part_id: "part_final",
        report: {
          executive_summary: "Canonical summary.",
          blocks: [
            {
              block_id: "final_1",
              category: "summary_breakdown",
              scope: "account",
              title: "Canonical Block",
              summary: "Final payload block.",
              cached_sources: [],
              highlights: [],
              actions: [],
              tables: [],
            },
          ],
        },
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.output_json.delta",
      data: {
        item_id: "item_final",
        part_id: "part_final",
        delta: JSON.stringify({
          blocks: [
            {
              block_id: "preview_override",
              category: "summary_breakdown",
              scope: "account",
              title: "Preview Override",
              summary: "Should be ignored after final checkpoint.",
              cached_sources: [],
              highlights: [],
              actions: [],
              tables: [],
            },
          ],
        }),
      },
    } as any);

    const report = asStructuredReport(state);
    expect(report.blocks.length).toBe(1);
    expect(report.blocks[0]?.title).toBe("Canonical Block");

    state = reduceJainaStreamEvent(state, {
      type: "response.done",
      data: {
        id: "resp_1",
        object: "realtime.response",
        status: "completed",
        status_details: null,
        output: [],
      },
    } as any);

    const completedReport = asStructuredReport(state);
    expect(state.status).toBe("complete");
    expect(completedReport.blocks[0]?.title).toBe("Canonical Block");
  });

  it("accepts SoT table rows as objects with headers", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.checkpoint_report",
      data: {
        item_id: "item_table_rows",
        part_id: "part_table_rows",
        report: {
          language: "en",
          executive_summary: "Campaign matrix",
          performance_snapshot: [{ metric: "L7 ROAS", value: 0.97, status: "neutral" }],
          sections: [
            {
              heading: "Campaign Efficiency Matrix",
              scope: "campaign",
              summary: "Performance by campaign",
              highlights: [],
              tables: [
                {
                  title: "Campaign KPIs",
                  headers: ["Campaign Name", "Spend", "ROAS"],
                  rows: [
                    {
                      "Campaign Name": "ANDROID | FEED - UDF",
                      Spend: "$5,892.38",
                      ROAS: 1.98,
                    },
                  ],
                },
              ],
              actions: [],
              confidence: null,
              cached_sources: [],
              graphs: [],
            },
          ],
          strategic_recommendations: [],
          follow_up_questions: [],
          handoff_trace: [],
          cached_sources: [],
          graphs: [],
        },
      },
    } as any);

    expect(state.status).not.toBe("error");
    const report = asStructuredReport(state);
    expect(report.sections[0]?.tables.length).toBe(1);
    expect((report.sections[0]?.tables[0] as any)?.title).toBe("Campaign KPIs");
  });

  it("normalizes backend SoT payload shape with metric labels and chart labels", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.checkpoint_report",
      data: {
        item_id: "item_backend_shape",
        part_id: "part_backend_shape",
        report: {
          language: "en",
          executive_summary: "Backend report summary",
          performance_snapshot: [
            {
              label: "Account ROAS",
              value: 0.97,
              trend: "warning",
              format: "decimal",
            },
          ],
          sections: [
            {
              heading: "Top-Performing Campaigns",
              scope: "campaign",
              summary: "Strong performers",
              highlights: [
                {
                  category: "Top Winner",
                  text: "Highest ROAS at 1.98.",
                  impact: null,
                  severity: "neutral",
                  confidence: null,
                  evidence: [],
                },
              ],
              tables: [
                {
                  title: "Winning Campaign Breakdown",
                  headers: ["Campaign Name", "Spend", "ROAS"],
                  rows: [
                    {
                      "Campaign Name": "AdvantagePlus - UDF",
                      Spend: 5892.39,
                      ROAS: 1.98,
                    },
                  ],
                },
              ],
              actions: [],
              confidence: null,
              cached_sources: [],
              graphs: [],
            },
            {
              heading: "Critical Risks",
              scope: "campaign",
              summary: "Budget leakage",
              highlights: [],
              tables: [],
              actions: [
                {
                  title: "Pause iOS Self-Service",
                  rationale: "Low return",
                  expected_impact: null,
                  priority: "now",
                },
              ],
              confidence: null,
              cached_sources: [],
              graphs: [],
            },
          ],
          strategic_recommendations: [
            {
              title: "Aggressive Budget Reallocation",
              rationale: "Move spend to winners",
              expected_impact: "high",
              priority: "now",
            },
          ],
          follow_up_questions: ["Should we pause Self-Service now?"],
          handoff_trace: [],
          cached_sources: [],
          graphs: [
            {
              type: "bar",
              label: "ROAS Comparison by Strategy",
              data: [
                { x: "Adv+ UDF", y: 1.98 },
                { x: "Self-Service", y: 0.26 },
              ],
            },
          ],
        },
      },
    } as any);

    expect(state.status).not.toBe("error");
    const report = asStructuredReport(state);
    expect(report.performance_snapshot[0]?.metric).toBe("Account ROAS");
    expect(report.performance_snapshot[0]?.status).toBe("warning");
    expect(report.sections.length).toBe(2);
    expect((report.sections[0]?.tables[0] as any)?.title).toBe("Winning Campaign Breakdown");
    expect((report.graphs[0] as any)?.title).toBe("ROAS Comparison by Strategy");
  });

  it("maps insights/recommendation aliases and typo variants", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.checkpoint_report",
      data: {
        item_id: "item_aliases",
        part_id: "part_aliases",
        report: {
          language: "en",
          executive_summary: "Alias test",
          performance_snapshot: [{ label: "ROAS", value: 1.2 }],
          sections: [
            {
              heading: "Alias Section",
              scope: "campaign",
              summary: "Alias mappings",
              insights: [
                {
                  category: "Efficiency Gap",
                  text: "Insight from alias field.",
                  severity: "neutral",
                },
              ],
              recommendations: [
                {
                  title: "Section recommendation",
                  rationale: "From recommendations alias",
                  priority: "high",
                },
              ],
              tables: [],
              confidence: null,
              cached_sources: [],
              graphs: [],
            },
          ],
          reccomendations: [
            {
              title: "Top-level typo recommendation",
              rationale: "From reccomendations typo",
              priority: "now",
            },
          ],
          follow_up_questions: [],
          handoff_trace: [],
          cached_sources: [],
          graphs: [],
        },
      },
    } as any);

    expect(state.status).not.toBe("error");
    const report = asStructuredReport(state);
    expect(report.sections[0]?.highlights.length).toBe(1);
    expect(report.sections[0]?.highlights[0]?.title).toBe("Efficiency Gap");
    expect(report.sections[0]?.actions.length).toBe(1);
    expect(report.strategic_recommendations.length).toBe(1);
    expect(report.strategic_recommendations[0]?.title).toBe("Top-level typo recommendation");
  });

  it("stores report assembly payload and normalizes it for report rendering", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.report_assembly",
      data: {
        item_id: "item_assembly",
        part_id: "part_assembly",
        html_preview: "<article>Preview</article>",
        report: {
          header: {
            title: "Q1 Performance",
            period: "Q1",
            report_tags: ["quarterly"],
          },
          summary: {
            narrative: "Strong gains overall.",
          },
          metrics: [
            {
              label: "ROAS",
              planned: 2.1,
              actual: 2.4,
              index_percent: 14.3,
              unit: "%",
              deviation_type: "positive",
            },
          ],
          charts: [
            {
              title: "ROAS Trend",
              chart_type: "line",
              labels: ["Jan", "Feb"],
              datasets: [{ label: "ROAS", data: [2.1, 2.4] }],
            },
          ],
          insights: [
            {
              category: "performance",
              text: "Efficiency improved.",
              impact: "high",
              severity: "positive",
              confidence: "high",
              evidence: [],
            },
          ],
          recommendations: [
            {
              title: "Scale winner",
              rationale: "Best return",
              expected_impact: "Higher ROAS",
              priority: "HIGH",
            },
          ],
        },
      },
    } as any);

    expect(state.reportAssembly?.header.title).toBe("Q1 Performance");
    expect(state.reportAssemblyHtml).toContain("Preview");
    const report = asStructuredReport(state);
    expect(report.executive_summary).toBe("Strong gains overall.");
    expect(report.strategic_recommendations.length).toBe(1);
  });

  it("hydrates canvas actions from canvas.actions.proposed events", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "canvas.actions.proposed",
      data: {
        kind: "campaign_canvas_actions",
        brandId: "brand_123",
        userId: "user_123",
        actions: [
          {
            type: "CREATE_NODE",
            payload: {
              type: "campaign",
              id: "campaign_new_1",
              data: {
                name: "New Sales Campaign",
                status: "PAUSED",
              },
            },
          },
          {
            type: "CONNECT_NODES",
            payload: {
              source_id: "campaign_new_1",
              target_id: "adset_new_1",
            },
          },
        ],
      },
    } as any);

    expect(state.canvasActions.length).toBe(1);
    expect(state.canvasActions[0].actions.length).toBe(2);
    expect(state.canvasActions[0].actions[0].type).toBe("CREATE_NODE");
  });

  it("hydrates pending clarification requests", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.clarification_request",
      data: {
        id: "clar_001",
        question: "Do you want this broken down by campaign or ad set?",
      },
    } as any);

    expect(state.status).not.toBe("error");
    expect(state.pendingClarification?.id).toBe("clar_001");
    expect(state.pendingClarification?.question).toContain("broken down");
    expect(state.finalContentKind).toBe("text");
  });

  it("hydrates objective checklist events and incremental status updates", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.objectives",
      data: {
        objectives: [
          {
            id: "objective_scope_campaigns",
            title: "Scope active campaigns",
            description: "Collect active campaign set before deeper analysis.",
            status: "in_progress",
          },
          {
            id: "objective_analyze_efficiency",
            title: "Analyze efficiency metrics",
            status: "pending",
          },
        ],
      },
    } as any);

    expect(state.objectives.length).toBe(2);
    expect(state.objectives[0]?.status).toBe("in_progress");
    expect(state.objectives[1]?.status).toBe("pending");

    state = reduceJainaStreamEvent(state, {
      type: "response.objective.updated",
      data: {
        objective_id: "objective_scope_campaigns",
        status: "completed",
      },
    } as any);

    expect(
      state.objectives.find((objective) => objective.id === "objective-scope-campaigns")
        ?.status
    ).toBe("completed");

    state = reduceJainaStreamEvent(state, {
      type: "response.objective.updated",
      data: {
        objective: {
          id: "objective_analyze_efficiency",
          title: "Analyze efficiency metrics",
          status: "in_progress",
        },
      },
    } as any);

    expect(
      state.objectives.find((objective) => objective.id === "objective-analyze-efficiency")
        ?.status
    ).toBe("in_progress");

    state = reduceJainaStreamEvent(state, {
      type: "response.objectives",
      data: [
        {
          id: "objective_finalize",
          title: "Finalize response",
          status: "pending",
        },
      ],
    } as any);

    expect(state.objectives.length).toBe(3);
    expect(
      state.objectives.find((objective) => objective.id === "objective-finalize")
        ?.status
    ).toBe("pending");
  });

  it("keeps completed objectives crossed off across stale snapshots", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.objectives",
      data: {
        objectives: [
          {
            id: "collect_metrics",
            title: "Collect metrics",
            status: "in_progress",
          },
        ],
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.objective.updated",
      data: {
        objective_id: "collect_metrics",
        status: "completed",
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.objectives",
      data: {
        objectives: [
          {
            id: "collect_metrics",
            title: "Collect metrics",
            status: "pending",
          },
        ],
      },
    } as any);

    expect(state.objectives[0]?.status).toBe("completed");
  });

  it("allows failed objectives to recover through explicit updates", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.objectives",
      data: {
        objectives: [
          {
            id: "inspect_creatives",
            title: "Inspect creatives",
            status: "failed",
          },
        ],
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.objective.updated",
      data: {
        objective_id: "inspect_creatives",
        status: "completed",
      },
    } as any);

    expect(state.objectives[0]?.status).toBe("completed");
  });
});

describe("reduceJainaStreamEvent plan + hitl events", () => {
  it("tracks hitl pause and parses incremental plan delta payload", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "hitl.paused",
      data: {
        prompt: "Approve this plan?",
      },
    } as any);

    expect(state.pendingPlan?.status).toBe("awaiting_approval");
    expect(state.pendingPlan?.prompt).toBe("Approve this plan?");

    state = reduceJainaStreamEvent(state, {
      type: "response.plan.delta",
      data: {
        item_id: "item_plan",
        part_id: "part_plan",
        delta:
          '{"id":"plan_123","title":"Execution Plan","description":"Assemble final report","status":"pending","steps":[{"title":"Collect metrics","status":"completed"}]}',
      },
    } as any);

    expect(state.plan?.id).toBe("plan_123");
    expect(state.plan?.steps.length).toBe(1);
  });

  it("uses chat_title and objective task list from plan delta payload", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.plan.delta",
      data: {
        item_id: "item_plan",
        part_id: "part_plan",
        delta: JSON.stringify({
          plan_id: "plan_9f2c1e",
          chat_title: "Android Campaign Performance Audit",
          objectives: [
            {
              objective_id: "obj_campaign_1",
              task: "Identify active campaigns and pull spend, installs, and ROAS for last_7d.",
              success_criteria: "Return ranked campaign performance with evidence rows.",
            },
            {
              objective_id: "obj_adset_2",
              task: "Drill into underperforming campaigns at adset level to isolate CPI/CTR bottlenecks.",
              success_criteria: "Return top issues and recommended budget/actions per adset.",
            },
          ],
        }),
      },
    } as any);

    expect(state.plan?.id).toBe("plan_9f2c1e");
    expect(state.plan?.title).toBe("Android Campaign Performance Audit");
    expect(state.plan?.steps.length).toBe(2);
    expect(state.plan?.steps[0]?.title).toContain("Identify active campaigns");
    expect(state.plan?.steps[1]?.title).toContain("Drill into underperforming campaigns");
  });

  it("keeps plan state through response.done after a plan_ready-only exchange", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.created",
      data: { id: "resp_plan_only" },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.plan_ready",
      data: {
        item_id: "item_plan_only",
        part_id: "part_plan_only",
        plan: {
          plan_id: "fallback_uqc00d",
          chat_title: "Recommend Budget Reallocations For This Week BY Campaign",
          objectives: [
            {
              objective_id: "objective_campaign_1",
              task: "Analyze campaign performance and rank winners.",
            },
          ],
        },
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.content_part.done",
      data: {
        item_id: "item_plan_only",
        part_id: "part_plan_only",
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.output_item.done",
      data: { item_id: "item_plan_only" },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.done",
      data: {
        id: "resp_plan_only",
        object: "realtime.response",
        status: "completed",
        output: [],
      },
    } as any);

    expect(state.status).toBe("complete");
    expect(state.plan?.id).toBe("fallback_uqc00d");
    expect(state.plan?.title).toBe("Recommend Budget Reallocations For This Week BY Campaign");
    expect(state.plan?.steps[0]?.title).toContain("Analyze campaign performance");
  });
});

describe("reduceJainaStreamEvent tool hydration compatibility", () => {
  it("hydrates tool calls/results from tool.batch payloads", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "tool.batch",
      data: {
        calls: [
          {
            id: "tool_batch_1",
            name: "fetch_metrics",
            args: { account_id: "act_123" },
            metadata: { source: "batch" },
            correlation_id: "corr_1",
            parent_correlation_id: null,
          },
        ],
        results: [
          {
            id: "tool_batch_1",
            name: "fetch_metrics",
            ok: true,
            cached: false,
            output: { rows: 3 },
            correlation_id: "corr_1",
            parent_correlation_id: null,
          },
        ],
      },
    } as any);

    expect(state.toolCalls.length).toBe(1);
    expect(state.toolResults.length).toBe(1);
    expect(state.toolCalls[0].correlation_id).toBe("corr_1");
    expect(state.progress.some((entry) => entry.stage === "tool_start")).toBe(true);
    expect(state.progress.some((entry) => entry.stage === "tool_complete")).toBe(true);
  });

  it("hydrates tool calls/results from canonical response.progress stages", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.progress",
      data: {
        stage: "tool_start",
        tool_name: "fetch_metrics",
        tool_call_id: "tool_1",
        args: { account_id: "act_123" },
      },
    } as any);

    expect(state.toolCalls.length).toBe(1);
    expect(state.toolCalls[0].id).toBe("tool_1");
    expect(state.progress.some((entry) => entry.stage === "tool_start")).toBe(true);

    state = reduceJainaStreamEvent(state, {
      type: "response.progress",
      data: {
        stage: "tool_complete",
        tool_name: "fetch_metrics",
        tool_call_id: "tool_1",
        output: { rows: 12 },
      },
    } as any);

    expect(state.toolResults.length).toBe(1);
    expect(state.toolResults[0].id).toBe("tool_1");
    expect(state.toolResults[0].ok).toBe(true);
    expect(state.progress.some((entry) => entry.stage === "tool_complete")).toBe(true);
  });

  it("hydrates tool calls/results from adk.event compatibility payload", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "adk.event",
      data: {
        author: "specialist",
        content: {
          role: "assistant",
          parts: [
            {
              functionCall: {
                name: "fetch_metrics",
                args: { account_id: "act_123" },
                id: "tool_2",
              },
            },
            {
              functionResponse: {
                name: "fetch_metrics",
                id: "tool_2",
                response: {
                  rows: 7,
                },
              },
            },
          ],
        },
      },
    } as any);

    expect(state.toolCalls.length).toBe(1);
    expect(state.toolResults.length).toBe(1);
    expect(state.toolCalls[0].id).toBe("tool_2");
    expect(state.toolResults[0].id).toBe("tool_2");
  });

  it("hydrates plan title from adk.event text payloads containing chat_title", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "adk.event",
      data: {
        author: "router",
        content: {
          role: "assistant",
          parts: [
            {
              text: JSON.stringify({
                plan_id: "active_campaign_lookup_2024",
                chat_title: "Active Meta Campaigns Overview",
                objectives: [
                  {
                    objective_id: "fetch_active_campaigns",
                    task: "Identify and list all campaigns with ACTIVE status.",
                    success_criteria: "Campaigns include spend and ROAS.",
                  },
                ],
              }),
            },
          ],
        },
      },
    } as any);

    expect(state.plan?.id).toBe("active_campaign_lookup_2024");
    expect(state.plan?.title).toBe("Active Meta Campaigns Overview");
    expect(state.plan?.steps.length).toBe(1);
  });

  it("never promotes thought events carrying checkpoint_report JSON into state.report", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "thought",
      data: {
        text: JSON.stringify({
          checkpoint_report: {
            report_metadata: { title: "From Thought" },
            blocks: [{ scope: "account", title: "Block", summary: "Hidden" }],
          },
        }),
      },
    } as any);

    expect(state.report).toBeNull();
    expect(state.reportJson).toBe("");
    expect(state.progress.length).toBe(1);
    expect(state.progress[0]?.stage).toBe("thinking");
  });

  it("never promotes adk.event text parts carrying checkpoint_report JSON into state.report", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "adk.event",
      data: {
        author: "core",
        content: {
          role: "model",
          parts: [
            {
              text: JSON.stringify({
                checkpoint_report: {
                  report_metadata: { title: "From adk" },
                  blocks: [{ scope: "account", title: "Block", summary: "Hidden" }],
                },
              }),
              thoughtSignature: "sig_1",
            },
          ],
        },
      },
    } as any);

    expect(state.report).toBeNull();
    expect(state.reportJson).toBe("");
    expect(state.progress.length).toBeGreaterThan(0);
  });

  it("keeps arbitrary thought JSON visible in reasoning when it is not report-like", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "thought",
      data: {
        text: JSON.stringify({
          phase: "routing",
          candidate_tools: ["get_action_insights", "get_key_metrics"],
          score: 0.92,
        }),
      },
    } as any);

    expect(state.progress.length).toBe(1);
    expect(state.progress[0]?.stage).toBe("thinking");
    expect(state.progress[0]?.detail).toContain("\"phase\": \"routing\"");
    expect(state.report).toBeNull();
  });

});

describe("parseJainaStreamEvent compatibility guards", () => {
  it("accepts canonical response.block.delta events", () => {
    const event = parseJainaStreamEvent(
      JSON.stringify({
        type: "response.block.delta",
        data: {
          sequence: 1,
          source: "thought",
          agent: "synthesis_agent",
          block: {
            block_id: "block_1",
            category: "summary_breakdown",
            scope: "account",
            title: "Summary",
            summary: "Summary text.",
            cached_sources: [],
            highlights: [],
            actions: [],
            tables: [],
          },
        },
      })
    );

    expect(event).not.toBeNull();
    expect(event?.type).toBe("response.block.delta");
  });

  it("accepts canonical tool.batch events", () => {
    const event = parseJainaStreamEvent(
      JSON.stringify({
        type: "tool.batch",
        data: {
          calls: [],
          results: [],
        },
      })
    );

    expect(event).not.toBeNull();
    expect(event?.type).toBe("tool.batch");
  });

  it("accepts objective checklist stream events", () => {
    const initEvent = parseJainaStreamEvent(
      JSON.stringify({
        type: "response.objectives",
        data: {
          objectives: [
            {
              id: "objective_1",
              title: "Compile KPI snapshot",
              status: "pending",
            },
          ],
        },
      })
    );
    const updateEvent = parseJainaStreamEvent(
      JSON.stringify({
        type: "response.objective.updated",
        data: {
          objective_id: "objective_1",
          status: "completed",
        },
      })
    );

    expect(initEvent).not.toBeNull();
    expect(initEvent?.type).toBe("response.objectives");
    expect(updateEvent).not.toBeNull();
    expect(updateEvent?.type).toBe("response.objective.updated");
  });

  it("accepts known compatibility event types", () => {
    const event = parseJainaStreamEvent(
      JSON.stringify({
        type: "thought",
        data: { text: "Thinking..." },
      })
    );

    expect(event).not.toBeNull();
    expect(event?.type).toBe("thought");
  });

  it("rejects unknown event envelopes", () => {
    const event = parseJainaStreamEvent(
      JSON.stringify({
        type: "unknown.event",
        data: { foo: "bar" },
      })
    );

    expect(event).toBeNull();
  });
});

describe("reduceJainaStreamEvent state.delta tool hydration", () => {
  it("hydrates tool calls and results from state.delta payloads", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "state.delta",
      data: {
        source: "router",
        delta: {
          tool_call: {
            id: "tool_delta_1",
            name: "fetch_metrics",
            args: { account_id: "act_123" },
            metadata: { trace: "delta" },
          },
          tool_result: {
            id: "tool_delta_1",
            name: "fetch_metrics",
            ok: true,
            cached: false,
            output: { rows: 4 },
          },
        },
      },
    } as any);

    expect(state.toolCalls.length).toBe(1);
    expect(state.toolResults.length).toBe(1);
    expect(state.toolCalls[0].id).toBe("tool_delta_1");
    expect(state.toolResults[0].id).toBe("tool_delta_1");
    expect(state.progress.some((entry) => entry.stage === "tool_start")).toBe(true);
    expect(state.progress.some((entry) => entry.stage === "tool_complete")).toBe(true);
  });

  it("hydrates checkpoint summary signal from checkpoint_summary state deltas", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "state.delta",
      data: {
        source: "checkpoint_summary",
        delta: {
          latest_checkpoint_summary:
            "Shift 15-20% from high-CPC prospecting into lookalikes.",
          summary_source: "synthesis",
        },
      },
    } as any);

    expect(state.status).not.toBe("error");
    expect(state.latestCheckpointSummary).toContain("15-20%");
    expect(state.checkpointSummarySource).toBe("synthesis");
  });
});

describe("reduceJainaStreamEvent handoff tracking", () => {
  it("tracks handoff lifecycle events", () => {
    let state = createInitialJainaStreamState();

    // Handoff Start
    state = reduceJainaStreamEvent(state, {
      type: "handoff.start",
      data: {
        correlation_id: "handoff_1",
        from_scope: "router",
        to_scope: "analyst",
        objective: "Analyze spend",
        entity_id: "act_1",
      },
    } as any);

    expect(state.progress.some((p) => p.stage === "handoff_start")).toBe(true);
    const entry = state.progress.find((p) => p.stage === "handoff_start");
    expect(entry?.detail).toContain("router");
    expect(entry?.detail).toContain("analyst");

    // Handoff Complete
    state = reduceJainaStreamEvent(state, {
      type: "handoff.complete",
      data: {
        correlation_id: "handoff_1",
        status: "completed",
        duration_ms: 500,
        from_scope: "router",
        to_scope: "analyst",
        objective: "Analyze spend",
        entity_id: "act_1",
        error: null,
      },
    } as any);

    expect(state.progress.some((p) => p.stage === "handoff_complete")).toBe(true);
  });
});

describe("normalizeCheckpointReportPayload strictness", () => {
  it("gracefully handles missing or malformed fields in raw payload", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.checkpoint_report",
      data: {
        item_id: "item_bad",
        part_id: "part_bad",
        report: {
          // missing required fields for the schema, but normalizer should handle it
          executive_summary: "Partial report",
        },
      },
    } as any);

    expect(state.status).not.toBe("error");
    const report = asStructuredReport(state);
    expect(report.executive_summary).toBe("Partial report");
    expect(report.sections).toEqual([]);
    expect(report.strategic_recommendations).toEqual([]);
  });

  it("unwraps nested report envelopes in checkpoint_report payloads", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.checkpoint_report",
      data: {
        item_id: "item_nested",
        part_id: "part_nested",
        report: {
          report: {
            executive_summary: "Nested report envelope",
            sections: [
              {
                heading: "Nested section",
                scope: "account",
                summary: "Nested summary",
                highlights: ["Nested highlight"],
                actions: [],
              },
            ],
          },
        },
      },
    } as any);

    expect(state.status).not.toBe("error");
    const report = asStructuredReport(state);
    expect(report.executive_summary).toBe("Nested report envelope");
    expect(report.sections[0]?.summary).toBe("Nested summary");
    expect(report.sections[0]?.highlights[0]?.text).toBe("Nested highlight");
  });
});

describe("reduceJainaStreamEvent plan capture from heartbeat state.delta", () => {
  it("captures objective_plan from a state.delta with no source field", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "state.delta",
      data: {
        delta: {
          objective_plan: {
            plan_id: "fallback_zhj63a",
            intent: "analysis",
            chat_title: "Which Creatives Are Winning",
            objectives: [
              { task: "Analyze ad-level performance", scope: "ad" },
              { task: "Summarize findings", scope: "account" },
            ],
          },
        },
      },
    } as any);

    expect(state.status).not.toBe("error");
    expect(state.plan).not.toBeNull();
    expect(state.plan?.id).toBe("fallback_zhj63a");
    expect(state.plan?.title).toBe("Which Creatives Are Winning");
    expect(state.plan?.steps.length).toBeGreaterThan(0);
  });

  it("captures objective_plan from a state.delta with arbitrary source", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "state.delta",
      data: {
        source: "some_arbitrary_label",
        delta: {
          objective_plan: {
            plan_id: "plan_xyz",
            chat_title: "Arbitrary Source Plan",
            objectives: [{ task: "Do something" }],
          },
        },
      },
    } as any);

    expect(state.plan?.id).toBe("plan_xyz");
    expect(state.plan?.title).toBe("Arbitrary Source Plan");
  });

  it("builds a minimal plan from a key=value response.plan.delta string", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.plan.delta",
      data: {
        delta:
          "plan_id=fallback_abc123; intent=analysis; objectives=2; date_preset=last_7d",
      },
    } as any);

    expect(state.status).not.toBe("error");
    expect(state.plan).not.toBeNull();
    expect(state.plan?.id).toBe("fallback_abc123");
    expect(state.plan?.title).toMatch(/analysis/i);
  });

  it("preserves plan captured by state.delta when response.plan.delta fails JSON parse", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "state.delta",
      data: {
        delta: {
          objective_plan: {
            plan_id: "captured_first",
            chat_title: "Captured First",
            objectives: [{ task: "Task A" }],
          },
        },
      },
    } as any);

    expect(state.plan?.id).toBe("captured_first");

    state = reduceJainaStreamEvent(state, {
      type: "response.plan.delta",
      data: {
        delta: "plan_id=captured_first; intent=analysis",
      },
    } as any);

    expect(state.plan?.id).toBe("captured_first");
    expect(state.plan?.title).toBe("Captured First");
  });
});

describe("reduceJainaStreamEvent text delta routing", () => {
  it("appends text-kind deltas to responseText even when finalContentKind is report", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.content_part.added",
      data: {
        item_id: "item_1",
        part: { id: "part_text", type: "text" },
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.checkpoint_report",
      data: {
        item_id: "item_1",
        part_id: "part_json",
        report: {
          executive_summary: "Header summary",
        },
      },
    } as any);

    expect(state.finalContentKind).toBe("report");

    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_1",
        part_id: "part_text",
        delta: "Hello from text part.",
      },
    } as any);

    expect(state.responseText).toContain("Hello from text part.");
  });

  it("routes json-part deltas into reportJson and not into responseText", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.content_part.added",
      data: {
        item_id: "item_2",
        part: { id: "part_json_1", type: "json" },
      },
    } as any);

    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_2",
        part_id: "part_json_1",
        delta: '{"executive_summary":"partial",',
      },
    } as any);

    expect(state.reportJson).toContain("executive_summary");
    expect(state.responseText).toBe("");
  });

  it("preserves explicit chat_title when later key=value plan delta carries only intent", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "state.delta",
      data: {
        source: "objectives_init",
        delta: {
          objective_plan: {
            plan_id: "fallback_foo",
            intent: "analysis",
            chat_title: "Give ME A 7-day Campaign Health Brief With",
            objectives: [{ objective_id: "o1", task: "do thing" }],
          },
        },
      },
    } as any);

    expect(state.plan?.title).toBe("Give ME A 7-day Campaign Health Brief With");

    state = reduceJainaStreamEvent(state, {
      type: "response.plan.delta",
      data: {
        delta: "plan_id=fallback_foo; intent=analysis; objectives=1; date_preset=last_7d",
      },
    } as any);

    expect(state.plan?.id).toBe("fallback_foo");
    expect(state.plan?.title).toBe("Give ME A 7-day Campaign Health Brief With");
  });

  it("uses derived intent title only when no previous plan exists", () => {
    let state = createInitialJainaStreamState();

    state = reduceJainaStreamEvent(state, {
      type: "response.plan.delta",
      data: {
        delta: "plan_id=fresh_bar; intent=analysis; objectives=1",
      },
    } as any);

    expect(state.plan?.id).toBe("fresh_bar");
    expect(state.plan?.title).toBe("Analysis plan");
  });
});
