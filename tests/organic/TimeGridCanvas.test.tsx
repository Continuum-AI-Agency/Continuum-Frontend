
import { expect, test, describe, afterEach } from "bun:test";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { TimeGridCanvas } from "@/components/organic/primitives/TimeGridCanvas";
import { organicCalendarDays } from "@/components/organic/primitives/mock-data";

describe("TimeGridCanvas", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders a fixed 7-column weekly grid", () => {
    const { container } = render(
      <TimeGridCanvas
        days={organicCalendarDays}
        selectedDraftId={null}
        selectedDraftIds={[]}
        onSelectDraft={() => {}}
        onToggleSelection={() => {}}
        onRegenerate={() => {}}
      />
    );

    const grid = container.querySelector(".grid.grid-cols-7");
    expect(grid).toBeTruthy();
  });

  test("renders one day column per week day", () => {
    const { container } = render(
      <TimeGridCanvas
        days={organicCalendarDays}
        selectedDraftId={null}
        selectedDraftIds={[]}
        onSelectDraft={() => {}}
        onToggleSelection={() => {}}
        onRegenerate={() => {}}
      />
    );

    const columns = container.querySelectorAll("[data-slot='time-grid-day-column']");
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.length).toBe(organicCalendarDays.length);
  });
});
