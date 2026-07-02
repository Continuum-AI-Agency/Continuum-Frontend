import * as React from "react";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";

import {
  deriveMetricTrendValue,
  MetricsPanel,
  type PaidPerformanceMetricKey,
} from "./PaidMediaReportingWidget";
import type { PaidMetricsResponse } from "@/lib/schemas/paidMetrics";

// GA4 (Phase 5): sessions/conversions are merged into the paid trends payload
// by date and surfaced as two extra metric-cards. This suite covers the
// MetricsPanel rendering/selection behavior and the pure per-day derivation
// that feeds the trend chart — recharts' own SVG output isn't asserted on
// directly (brittle under happy-dom), the derivation is proven at the
// function level instead.

global.ResizeObserver =
  global.ResizeObserver ||
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
global.getComputedStyle = global.getComputedStyle || (() => ({}) as CSSStyleDeclaration);

const ThemeWrapper = ({ children }: { children: React.ReactNode }) => <Theme>{children}</Theme>;

const baseData: PaidMetricsResponse = {
  metrics: {
    spend: 500,
    roas: 2.5,
    impressions: 10000,
    clicks: 300,
    ctr: 3,
    cpc: 1.67,
    cpa: 5,
    gaSessions: 420,
    gaConversions: 12,
  },
  trends: [
    {
      date: "2026-06-01",
      spend: 100,
      roas: 2,
      impressions: 2000,
      clicks: 60,
      ctr: 3,
      cpc: 1.67,
      cpa: 5,
      gaSessions: 40,
      gaConversions: 2,
    },
    {
      date: "2026-06-02",
      spend: 150,
      roas: 2.2,
      impressions: 2500,
      clicks: 70,
      ctr: 2.8,
      cpc: 2.14,
      cpa: 6,
      gaSessions: 55,
      gaConversions: 4,
    },
  ],
  range: { since: "2026-06-01", until: "2026-06-02", preset: "last_7d" },
};

function clickMetricCard(label: string) {
  const button = screen.getByText(label).closest("button");
  if (!button) throw new Error(`Expected a button ancestor for metric-card labeled "${label}"`);
  fireEvent.click(button);
}

describe("MetricsPanel — GA4 metric-cards", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders GA Sessions and GA Conversions metric-cards with values from metrics", () => {
    render(
      <ThemeWrapper>
        <MetricsPanel data={baseData} expandedMetric="spend" onMetricSelect={() => {}} />
      </ThemeWrapper>
    );

    expect(screen.getByText("GA Sessions")).toBeTruthy();
    expect(screen.getByText("GA Conversions")).toBeTruthy();
    expect(screen.getByText("420")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
  });

  it("selecting the GA Sessions metric-card notifies the parent with the gaSessions key", () => {
    const onMetricSelect = mock((_key: PaidPerformanceMetricKey) => {});

    render(
      <ThemeWrapper>
        <MetricsPanel data={baseData} expandedMetric="spend" onMetricSelect={onMetricSelect} />
      </ThemeWrapper>
    );

    clickMetricCard("GA Sessions");

    expect(onMetricSelect).toHaveBeenCalledWith("gaSessions");
  });

  it("shows the GA Conversions trend heading and range once selected as the expanded metric", () => {
    render(
      <ThemeWrapper>
        <MetricsPanel data={baseData} expandedMetric="gaConversions" onMetricSelect={() => {}} />
      </ThemeWrapper>
    );

    expect(screen.getByText(/GA Conversions Trend/)).toBeTruthy();
    expect(screen.getByText(/2026-06-01.*2026-06-02/)).toBeTruthy();
  });
});

describe("deriveMetricTrendValue — GA4 daily chart series derivation", () => {
  it("reads gaSessions/gaConversions directly off each merged trend day (no derivation)", () => {
    const [day1, day2] = baseData.trends;

    expect(deriveMetricTrendValue(day1, "gaSessions")).toBe(40);
    expect(deriveMetricTrendValue(day2, "gaSessions")).toBe(55);
    expect(deriveMetricTrendValue(day1, "gaConversions")).toBe(2);
    expect(deriveMetricTrendValue(day2, "gaConversions")).toBe(4);
  });

  it("defaults to 0 for a day where GA4 had no matching row", () => {
    const dayWithoutGa4 = { date: "2026-06-03", spend: 90 } as PaidMetricsResponse["trends"][number];

    expect(deriveMetricTrendValue(dayWithoutGa4, "gaSessions")).toBe(0);
    expect(deriveMetricTrendValue(dayWithoutGa4, "gaConversions")).toBe(0);
  });

  it("derives the full daily chart series for the GA Sessions metric across all trend days", () => {
    const series = baseData.trends.map((day) => ({
      date: day.date,
      value: deriveMetricTrendValue(day, "gaSessions"),
    }));

    expect(series).toEqual([
      { date: "2026-06-01", value: 40 },
      { date: "2026-06-02", value: 55 },
    ]);
  });
});
