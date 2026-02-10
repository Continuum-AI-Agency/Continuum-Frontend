import { describe, expect, test } from "bun:test";

import {
  formatStageLabel,
  formatToolLabel,
  getFinalThought,
  getReportSummary,
  resolveReportSignal,
} from "@/components/paid-media/jaina/jainaUtils";

const makeProgressEntry = (stage: string, detail: string | undefined, data: Record<string, unknown> = {}) => ({
  stage,
  at: "2024-01-01T00:00:00.000Z",
  detail,
  data,
});

describe("jaina utils", () => {
  test("getFinalThought returns the last non-empty thinking detail", () => {
    const progress = [
      makeProgressEntry("thinking", "First thought"),
      makeProgressEntry("tool_start", "Running"),
      makeProgressEntry("thinking", "  Final thought  "),
    ];

    expect(getFinalThought(progress)).toBe("Final thought");
  });

  test("resolveReportSignal finds report intent in progress and deltas", () => {
    const progress = [
      makeProgressEntry("thinking", "", { renderAsReport: true }),
    ];
    const deltas = [{ delta: { render_as: "report" } }];

    expect(resolveReportSignal(progress, [])).toBe(true);
    expect(resolveReportSignal([], deltas)).toBe(true);
  });

  test("resolveReportSignal returns false when no signal is present", () => {
    const progress = [makeProgressEntry("thinking", "No signal")];

    expect(resolveReportSignal(progress, [])).toBe(false);
  });

  test("getReportSummary prefers direct answers and executive summary", () => {
    expect(getReportSummary({ type: "direct_answer", content: "Hello" })).toBe("Hello");
    expect(getReportSummary({ executive_summary: "Summary" } as any)).toBe("Summary");
    expect(getReportSummary({ summary: "Fallback" } as any)).toBe("Fallback");
  });

  test("formats stage and tool labels", () => {
    expect(formatStageLabel("router")).toBe("Consulting the Council");
    expect(formatStageLabel("routing")).toBe("Consulting the Council");
    expect(formatStageLabel("thinking")).toBe("Thinking");
    expect(formatStageLabel("tool_start")).toBe("tool start");

    expect(formatToolLabel("router")).toBe("Consulting the Council");
    expect(formatToolLabel("get_key_metrics")).toBe("get key metrics");
  });
});
