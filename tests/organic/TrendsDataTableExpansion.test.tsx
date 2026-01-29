import { expect, test, vi } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrendsDataTable } from "@/components/organic/TrendsDataTable";

// Mock radix-ui components to track usage
const accordionTriggerSpy = vi.fn();

vi.mock("@radix-ui/react-accordion", () => ({
  Root: ({ children }: any) => React.createElement("div", { "data-accordion-root": true }, children),
  Item: ({ children }: any) => React.createElement("div", { "data-accordion-item": true }, children),
  Header: ({ children }: any) => React.createElement("div", { "data-accordion-header": true }, children),
  Trigger: ({ children, ...props }: any) => {
    accordionTriggerSpy(props);
    return React.createElement("button", { "data-accordion-trigger": true, ...props }, children);
  },
  Content: ({ children }: any) => React.createElement("div", { "data-accordion-content": true }, children),
}));

test("TrendsDataTable uses accordion for expandable rows", () => {
  const mockData = [
    {
      id: "1",
      title: "Test Trend",
      summary: "This is a summary",
      momentum: "rising" as const,
      platforms: ["instagram"] as any,
      tags: [],
    },
  ];

  renderToStaticMarkup(
    <TrendsDataTable
      data={mockData}
      selectedTrendIds={[]}
      onToggleTrend={() => {}}
      activePlatforms={["instagram"]}
    />
  );

  // This test should FAIL initially because it uses a flat table
  expect(accordionTriggerSpy).toHaveBeenCalled();
});
