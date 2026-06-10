import { describe, expect, it } from "bun:test";

import { deriveLiveStatusLabel, humanizeStage } from "./thinkingUtils";

function entry(stage: string, data: Record<string, unknown> = {}) {
  return { stage, at: "2026-06-10T00:00:00.000Z", data };
}

describe("humanizeStage", () => {
  it("turns a snake_case stage into a readable label", () => {
    expect(humanizeStage("report_ready")).toBe("Report ready");
  });

  it("falls back to Working for an empty stage", () => {
    expect(humanizeStage("")).toBe("Working");
  });
});

describe("deriveLiveStatusLabel", () => {
  it("returns null when there is no progress", () => {
    expect(deriveLiveStatusLabel([])).toBeNull();
  });

  it("surfaces the latest meaningful stage label", () => {
    const reasoning = [entry("thinking"), entry("synthesis_start")];
    expect(deriveLiveStatusLabel(reasoning)).toBe("Writing report");
  });

  it("names the tool being pulled from the latest tool_start entry", () => {
    const reasoning = [
      entry("thinking"),
      entry("tool_start", { tool_name: "get_campaigns" }),
    ];
    expect(deriveLiveStatusLabel(reasoning)).toBe("Pulling get campaigns");
  });

  it("humanizes an unknown stage rather than dropping it", () => {
    expect(deriveLiveStatusLabel([entry("crunching_numbers")])).toBe("Crunching numbers");
  });

  it("tracks the most recent entry as the run progresses", () => {
    const reasoning = [
      entry("tool_start", { tool_name: "get_campaigns" }),
      entry("tool_complete", { tool_name: "get_campaigns" }),
      entry("synthesis_start"),
    ];
    expect(deriveLiveStatusLabel(reasoning)).toBe("Writing report");
  });
});
