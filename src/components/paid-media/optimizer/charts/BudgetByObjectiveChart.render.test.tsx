import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Stub the visx bar kit (needs ResizeObserver) — assert the empty state and the
// token-clean legend chrome.
mock.module('@/components/charts/bar', () => ({ Bar: () => null }));
mock.module('@/components/charts/bar-chart', () => ({
  BarChart: ({ children }: { children?: unknown }) => (
    <div data-testid="bar-chart">{children as never}</div>
  ),
}));
mock.module('@/components/charts/bar-y-axis', () => ({ BarYAxis: () => null }));

import { portfoliosPopulated } from './__fixtures__/optimizerFixtures';

const { BudgetByObjectiveChart } = await import('./BudgetByObjectiveChart');

afterEach(cleanup);

describe('BudgetByObjectiveChart', () => {
  it('renders the empty state instead of vanishing when there is no budget', () => {
    const { getByText } = render(<BudgetByObjectiveChart portfolios={[]} />);
    expect(getByText(/Budget mix appears/i)).toBeTruthy();
  });

  it('renders the objective legend with account currency amounts', () => {
    const { getByTestId, container } = render(
      <BudgetByObjectiveChart portfolios={portfoliosPopulated} currency="USD" />,
    );
    expect(getByTestId('bar-chart')).toBeTruthy();
    expect(container.textContent).toContain('Purchase');
    expect(container.textContent).toContain('$300');
    expect(container.textContent).toContain('Lead');
    expect(container.textContent).toContain('$120');
  });
});
