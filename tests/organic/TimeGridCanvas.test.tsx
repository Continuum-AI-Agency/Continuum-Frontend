
import { expect, test, describe, afterEach } from "bun:test";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { TimeGridCanvas } from "@/components/organic/primitives/TimeGridCanvas";
import { organicCalendarDays } from "@/components/organic/primitives/mock-data";

describe("TimeGridCanvas", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders with horizontal scrolling container", () => {
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

    const scrollContainer = container.querySelector(".overflow-x-auto");
    expect(scrollContainer).toBeTruthy();
    
    const innerContainer = container.querySelector(".min-w-max");
    expect(innerContainer).toBeTruthy();
  });

  test("renders day columns with minimum width", () => {
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

    const columns = container.querySelectorAll(".min-w-\\[250px\\]");
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.length).toBe(organicCalendarDays.length);
  });
});
