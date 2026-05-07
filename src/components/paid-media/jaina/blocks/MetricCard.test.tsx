import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { MetricCard } from "./MetricCard";

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

afterEach(() => {
  cleanup();
});

describe("MetricCard", () => {
  it("renders conversion counts as numbers even when percent format is present", () => {
    render(
      <MetricCard
        metric={{
          label: "Conversions",
          value: 42,
          unit: null,
          format: "percent",
          change: null,
          change_direction: null,
          severity: null,
        }}
      />
    );

    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.queryByText("42%")).toBeNull();
  });

  it("keeps conversion rate cards as percentages", () => {
    render(
      <MetricCard
        metric={{
          label: "Conversion rate",
          value: 0.42,
          unit: null,
          format: "percent",
          change: null,
          change_direction: null,
          severity: null,
        }}
      />
    );

    expect(screen.getByText("42%")).toBeTruthy();
  });
});
