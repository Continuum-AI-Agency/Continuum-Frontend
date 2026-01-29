import { expect, test, vi } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandTrendsPanel } from "@/components/brand-insights/BrandTrendsPanel";

// Mock radix-ui components to track usage
const accordionTriggerSpy = vi.fn();
const tabsTriggerSpy = vi.fn();

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

vi.mock("@radix-ui/react-tabs", () => ({
  Root: ({ children }: any) => React.createElement("div", { "data-tabs-root": true }, children),
  List: ({ children }: any) => React.createElement("div", { "data-tabs-list": true }, children),
  Trigger: ({ children, ...props }: any) => {
    tabsTriggerSpy(props);
    return React.createElement("button", { "data-tabs-trigger": true, ...props }, children);
  },
  Content: ({ children }: any) => React.createElement("div", { "data-tabs-content": true }, children),
}));

test("BrandTrendsPanel uses tabs instead of accordion", () => {
  renderToStaticMarkup(
    <BrandTrendsPanel
      trends={[]}
      events={[]}
      questionsByNiche={{ questionsByNiche: {} }}
      brandId="test-brand"
    />
  );

  expect(tabsTriggerSpy).toHaveBeenCalled();
  expect(accordionTriggerSpy).not.toHaveBeenCalled();
});
