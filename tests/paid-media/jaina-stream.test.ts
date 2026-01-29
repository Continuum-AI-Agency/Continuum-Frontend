import test from "node:test";
import assert from "node:assert/strict";

import { createInitialJainaStreamState, reduceJainaStreamEvent } from "../../src/lib/jaina/stream";
import type { SoTReport } from "../../src/lib/jaina/schemas";

const sampleReport: SoTReport = {
  language: "en",
  executive_summary: "Creative A improved ROAS after the budget shift.",
  performance_snapshot: [
    {
      title: "Topline",
      subtitle: null,
      rows: [
        {
          label: "Spend",
          value: "$12,340",
          comparison: "+8%",
          status: "up",
          source: null,
          cached: false,
        },
      ],
      notes: null,
    },
  ],
  sections: [
    {
      heading: "Creative",
      scope: "Ads",
      summary: "Short-form video outperformed static.",
      highlights: [
        {
          category: "CTR",
          text: "Video CTR +1.4pp",
          impact: "Higher intent",
          severity: "positive",
          confidence: "high",
          evidence: ["meta_ads"],
        },
      ],
      tables: [],
      actions: [
        {
          title: "Scale video creative",
          rationale: "Sustains CTR gains",
          expected_impact: "Lower CPA",
          priority: "now",
        },
      ],
      confidence: "high",
      cached_sources: [],
      graphs: [],
    },
  ],
  strategic_recommendations: [
    {
      title: "Shift budget to winners",
      rationale: "Concentrate spend on high ROAS",
      expected_impact: "Maintain efficiency",
      priority: "next",
    },
  ],
  follow_up_questions: ["Which ad sets need new creative tests?"],
  handoff_trace: [],
  cached_sources: [],
  graphs: [],
};

test("accumulates JSON deltas into a SoTReport on response.done", () => {
  const json = JSON.stringify(sampleReport);
  const first = json.slice(0, 40);
  const second = json.slice(40);

  const events = [
    { type: "response.created", data: { id: "resp_1" } },
    { type: "response.output_json.delta", data: { delta: first } },
    { type: "response.output_json.delta", data: { delta: second } },
    { type: "response.done", data: { id: "resp_1" } },
  ];

  const finalState = events.reduce(reduceJainaStreamEvent, createInitialJainaStreamState());

  assert.equal(finalState.status, "complete");
  assert.equal(finalState.report?.executive_summary, sampleReport.executive_summary);
});

test("records progress details and tool results", () => {
  const state = reduceJainaStreamEvent(createInitialJainaStreamState(), {
    type: "response.progress",
    data: { stage: "handoff_start", to: "Jaina_campaign_specialist" },
  });

  assert.equal(state.progress.length, 1);
  assert.equal(state.progress[0]?.detail, "Delegating to Jaina_campaign_specialist");
});

test("sets error state on error event", () => {
  const state = reduceJainaStreamEvent(createInitialJainaStreamState(), {
    type: "error",
    data: { message: "boom" },
  });

  assert.equal(state.status, "error");
  assert.equal(state.error, "boom");
});
