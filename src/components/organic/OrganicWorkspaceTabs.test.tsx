import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";

let searchParamState = "tab=metrics";
const pushMock = mock(() => {});

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => new URLSearchParams(searchParamState),
}));

mock.module("@radix-ui/themes", () => {
  const TabsContext = React.createContext<{
    value: string;
    onValueChange?: (value: string) => void;
  }>({ value: "" });

  return {
    Tabs: {
      Root: ({
        value,
        onValueChange,
        children,
      }: {
        value: string;
        onValueChange?: (value: string) => void;
        children: React.ReactNode;
      }) => (
        <TabsContext.Provider value={{ value, onValueChange }}>
          <div>{children}</div>
        </TabsContext.Provider>
      ),
      List: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Trigger: ({ value, children }: { value: string; children: React.ReactNode }) => {
        const context = React.useContext(TabsContext);
        return (
          <button type="button" onClick={() => context.onValueChange?.(value)}>
            {children}
          </button>
        );
      },
    },
  };
});

import { OrganicWorkspaceTabs } from "./OrganicWorkspaceTabs";

function findElementByExactText(root: HTMLElement, text: string): HTMLElement {
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      if (element.children.length === 0 && element.textContent?.trim() === text) {
        return element;
      }
      for (let index = element.childNodes.length - 1; index >= 0; index -= 1) {
        stack.push(element.childNodes[index]);
      }
    }
  }

  throw new Error(`Element with text "${text}" not found`);
}

describe("OrganicWorkspaceTabs", () => {
  beforeEach(() => {
    pushMock.mockReset();
    searchParamState = "tab=metrics";
  });

  afterEach(() => {
    cleanup();
  });

  it("initializes from the planner query param", () => {
    searchParamState = "tab=planner";

    const { container } = render(
      <OrganicWorkspaceTabs
        plannerSlot={<div>Planner Slot</div>}
        metricsSlot={<div>Metrics Slot</div>}
      />
    );

    expect(findElementByExactText(container, "Planner Slot")).toBeTruthy();
    expect(container.textContent?.includes("Metrics Slot")).toBe(false);
  });

  it("updates the query param when the active tab changes", () => {
    const { container } = render(
      <OrganicWorkspaceTabs
        plannerSlot={<div>Planner Slot</div>}
        metricsSlot={<div>Metrics Slot</div>}
      />
    );

    fireEvent.click(findElementByExactText(container, "Planner"));

    expect(pushMock).toHaveBeenCalledWith("?tab=planner");
  });
});
