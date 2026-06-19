import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { BrandInsightsTrend } from "@/lib/schemas/brandInsights";

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

import { TrendSignalsTable } from "./TrendSignalsTable";

function trend(partial: Partial<BrandInsightsTrend> & { id: string; title: string }): BrandInsightsTrend {
  return { timesUsed: 0, ...partial } as BrandInsightsTrend;
}

const trends: BrandInsightsTrend[] = [
  trend({ id: "low", title: "Low signal", confidence: 0.4, platforms: ["instagram"] }),
  trend({ id: "high", title: "High signal", confidence: 0.9, platforms: ["tiktok", "youtube"] }),
];

describe("TrendSignalsTable", () => {
  afterEach(() => cleanup());

  it("renders trend signals with confidence and platform codes", () => {
    render(<TrendSignalsTable trends={trends} />);

    expect(screen.getByText("High signal")).toBeDefined();
    expect(screen.getByText("90%")).toBeDefined();
    expect(screen.getByText("TK")).toBeDefined();
    expect(screen.getByText("YT")).toBeDefined();
  });

  it("orders the highest-confidence signal first by default", () => {
    render(<TrendSignalsTable trends={trends} />);

    const titles = screen.getAllByText(/^(High|Low) signal$/).map((node) => node.textContent);
    expect(titles[0]).toBe("High signal");
    expect(titles[1]).toBe("Low signal");
  });
});
