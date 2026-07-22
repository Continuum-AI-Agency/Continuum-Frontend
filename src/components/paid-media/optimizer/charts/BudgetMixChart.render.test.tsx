import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Stub the visx bar kit (needs ResizeObserver) — assert the empty state, the
// single-slice text degrade, and the token-clean multi-slice legend chrome.
mock.module('@/components/charts/bar', () => ({ Bar: () => null }));
mock.module('@/components/charts/bar-chart', () => ({
  BarChart: ({ children }: { children?: unknown }) => (
    <div data-testid="bar-chart">{children as never}</div>
  ),
}));
mock.module('@/components/charts/bar-y-axis', () => ({ BarYAxis: () => null }));

import type { BudgetMix } from './chartData';

const { BudgetMixChart } = await import('./BudgetMixChart');

afterEach(cleanup);

describe('BudgetMixChart', () => {
  it('renders the empty state instead of vanishing when nothing is funded', () => {
    const { getByText } = render(<BudgetMixChart mix={{ dimension: 'portfolio', slices: [] }} />);
    expect(getByText(/Budget mix appears/i)).toBeTruthy();
  });

  it('degrades a lone funded slice to a one-line summary, not a full-width bar', () => {
    const mix: BudgetMix = { dimension: 'portfolio', slices: [{ name: 'Solo', daily: 4300 }] };
    const { queryByTestId, container } = render(<BudgetMixChart mix={mix} currency="USD" />);
    expect(queryByTestId('bar-chart')).toBeNull();
    expect(container.textContent).toContain('All budget on');
    expect(container.textContent).toContain('Solo');
    expect(container.textContent).toContain('$4,300');
  });

  it('renders the bar chart + legend with account currency amounts for a real mix', () => {
    const mix: BudgetMix = {
      dimension: 'objective',
      slices: [
        { name: 'Purchase', daily: 300 },
        { name: 'Lead', daily: 120 },
      ],
    };
    const { getByTestId, container } = render(<BudgetMixChart mix={mix} currency="USD" />);
    expect(getByTestId('bar-chart')).toBeTruthy();
    expect(container.textContent).toContain('Purchase');
    expect(container.textContent).toContain('$300');
    expect(container.textContent).toContain('Lead');
    expect(container.textContent).toContain('$120');
  });
});
