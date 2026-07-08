import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactElement } from 'react';

let searchParamState = 'tab=metrics';
const replaceStateMock = mock(() => {});

mock.module('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamState),
}));

import { OrganicWorkspaceTabs } from './OrganicWorkspaceTabs';

function renderWorkspaceTabs(node: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

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

describe('OrganicWorkspaceTabs', () => {
  const originalReplaceState = window.history.replaceState;

  beforeEach(() => {
    replaceStateMock.mockReset();
    window.history.replaceState = replaceStateMock as unknown as typeof window.history.replaceState;
    searchParamState = 'tab=metrics';
  });

  afterEach(() => {
    window.history.replaceState = originalReplaceState;
    cleanup();
  });

  it('initializes from the planner query param', () => {
    searchParamState = 'tab=planner';

    const { container } = renderWorkspaceTabs(
      <OrganicWorkspaceTabs
        plannerSlot={<div>Planner Slot</div>}
        metricsSlot={<div>Metrics Slot</div>}
      />,
    );

    expect(findElementByExactText(container, 'Planner Slot')).toBeTruthy();
    expect(container.textContent?.includes('Metrics Slot')).toBe(false);
  });

  it('updates the query param when the active tab changes', () => {
    const { container } = renderWorkspaceTabs(
      <OrganicWorkspaceTabs
        plannerSlot={<div>Planner Slot</div>}
        metricsSlot={<div>Metrics Slot</div>}
      />,
    );

    fireEvent.click(findElementByExactText(container, 'Planner'));

    expect(replaceStateMock).toHaveBeenCalledWith(null, '', '?tab=planner');
  });
});
