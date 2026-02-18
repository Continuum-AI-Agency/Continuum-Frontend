import { describe, expect, it } from "bun:test";
import {
  createInitialJainaStreamState,
  reduceJainaStreamEvent,
  type JainaStreamState,
} from "./stream";
import type { SoTReport } from "./schemas";

function asStructuredReport(state: JainaStreamState): SoTReport {
  const report = state.report;
  if (!report || ("type" in report && report.type === "direct_answer")) {
    throw new Error("Expected structured report");
  }
  return report as SoTReport;
}

describe("reduceJainaStreamEvent partial report hydration", () => {
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
    expect(report.strategic_recommendations[0].action).toBe(
      "Pause Underperformer"
    );

    state = reduceJainaStreamEvent(state, {
      type: "response.output_text.delta",
      data: {
        item_id: "item_1",
        part_id: "part_1",
        delta: '"charts":[{"title":"Ad Set Efficiency","type":"BAR","data":[{"name":"A","CPA":21.1}]',
      },
    } as any);

    report = asStructuredReport(state);
    expect(report.strategic_recommendations.length).toBe(1);
    expect(report.sections[0].highlights.length).toBe(1);
  });
});
