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
});

describe("reduceJainaStreamEvent canonical report events", () => {
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
});

describe("parseJainaStreamEvent compatibility guards", () => {
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
});
