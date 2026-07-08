import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// The visx AreaChart needs ResizeObserver (absent in happy-dom), so stub the kit
// and assert the redesigned header/delta chrome — the point of the retokenization.
mock.module('@/components/charts/area-chart', () => ({
  AreaChart: ({ children }: { children?: unknown }) => (
    <div data-testid="area-chart">{children as never}</div>
  ),
  Area: () => null,
}));

import { cpaSeriesSparse, cpaSeriesTrend } from './__fixtures__/optimizerFixtures';

const { CpaTrendChart } = await import('./CpaTrendChart');

afterEach(cleanup);

describe('CpaTrendChart', () => {
  it('shows the empty state until two cycles have scored', () => {
    const { getByText, queryByTestId } = render(<CpaTrendChart series={cpaSeriesSparse} />);
    expect(getByText(/CPA trend appears after/i)).toBeTruthy();
    expect(queryByTestId('area-chart')).toBeNull();
  });

  it('renders the header + delta on the success token when CPA is improving', () => {
    const { getByText, getByTestId, container } = render(
      <CpaTrendChart series={cpaSeriesTrend} currency="USD" />,
    );
    expect(getByText('CPA trend · 4 cycles')).toBeTruthy();
    expect(container.textContent).toContain('37%');
    expect(container.textContent).toContain('$25');
    expect(getByTestId('area-chart')).toBeTruthy();
    expect(container.querySelector('.text-success')).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/emerald-|amber-/);
  });
});
