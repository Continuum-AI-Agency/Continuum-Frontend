import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { Children, isValidElement, type ReactNode } from 'react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

let lastChartPoint: unknown;

// Stub the BKLit ComposedChart container (needs ResizeObserver). Render only the
// tooltip child against the last real chart point so this seam also covers the
// tooltip's action list without needing chart context.
mock.module('@/components/charts/composed-chart', () => ({
  ComposedChart: ({ data, children }: { data: unknown[]; children: ReactNode }) => {
    lastChartPoint = data.at(-1);
    const tooltip = Children.toArray(children).find(
      (child) => isValidElement(child) && child.props.matchCrosshair === true,
    );
    return (
      <>
        <div data-testid="hero-chart" />
        {tooltip}
      </>
    );
  },
}));

mock.module('@/components/charts/tooltip', () => ({
  ChartTooltip: ({ content }: { content: (context: { point: unknown }) => ReactNode }) =>
    content({ point: lastChartPoint }),
}));

import { cpaSeriesSparse, cpaSeriesTrend } from './__fixtures__/optimizerFixtures';

const { CpaHeroTimeline } = await import('./CpaHeroTimeline');

afterEach(cleanup);

describe('CpaHeroTimeline', () => {
  it('shows the empty state until two cycles have scored', () => {
    const { getByText, queryByTestId } = render(<CpaHeroTimeline series={cpaSeriesSparse} />);
    expect(getByText(/CPA timeline appears/i)).toBeTruthy();
    expect(queryByTestId('hero-chart')).toBeNull();
  });

  it('renders the timeline with a projected-CPA header once cycles exist', () => {
    const { getByTestId, container } = render(
      <CpaHeroTimeline confidenceBand="high" currency="USD" series={cpaSeriesTrend} />,
    );
    expect(getByTestId('hero-chart')).toBeTruthy();
    expect(container.textContent).toContain('Projected CPA next cycle');
    expect(container.textContent).toContain('$25'); // last actual CPA = 500 / 20
    expect(container.textContent?.toLowerCase()).toContain('confidence');
  });

  it('labels the goldilocks zone only when the portfolio has an explicit target', () => {
    const withTarget = render(
      <CpaHeroTimeline currency="USD" series={cpaSeriesTrend} targetCpa={30} />,
    );
    expect(withTarget.container.textContent).toContain('On target');
    cleanup();
    // No target → no zone legend (engine default $50 is not drawn as a brand target).
    const without = render(<CpaHeroTimeline currency="USD" series={cpaSeriesTrend} />);
    expect(without.queryByText(/On target/i)).toBeNull();
  });

  it('labels the y-axis with the objective cost label (CPM for awareness)', () => {
    const { container } = render(<CpaHeroTimeline objective="awareness" series={cpaSeriesTrend} />);
    // The rotated axis title names the cost — even with the chart body stubbed out.
    expect(container.textContent).toContain('CPM');
  });

  it('renders repeated events without a duplicate React key warning', () => {
    const event = {
      ts: '2026-06-22T00:00:00.000Z',
      kind: 'config' as const,
      label: 'pause · 120250872653660236',
      count: 1,
    };
    const originalConsoleError = console.error;
    const consoleError = mock(() => {});
    console.error = consoleError as unknown as typeof console.error;

    try {
      const { getAllByText } = render(
        <CpaHeroTimeline
          eventsByTs={{ '2026-06-22T00:00:00.000Z': [event, event] }}
          series={cpaSeriesTrend}
        />,
      );

      expect(getAllByText(event.label)).toHaveLength(2);
      expect(
        consoleError.mock.calls.some((call) =>
          call.join(' ').includes('Encountered two children with the same key'),
        ),
      ).toBe(false);
    } finally {
      console.error = originalConsoleError;
    }
  });

  // The tooltip panel is dark in BOTH themes, so page-theme text tokens render near-black
  // text on a near-black card. This is what made the hover card unreadable in light mode.
  it('styles the tooltip with the on-dark tooltip tokens, never the page foreground', () => {
    const { container } = render(
      <CpaHeroTimeline
        eventsByTs={{
          '2026-06-22T00:00:00.000Z': [
            { ts: '2026-06-22T00:00:00.000Z', kind: 'applied', label: 'Budgets applied', count: 1 },
          ],
        }}
        series={cpaSeriesTrend}
      />,
    );
    const panel = container.querySelector('.min-w-\\[196px\\]');
    expect(panel).toBeTruthy();
    expect(panel?.innerHTML).toContain('text-chart-tooltip-foreground');
    // Page-theme tokens inside the always-dark panel are the bug: near-black on near-black.
    expect(panel?.innerHTML).not.toContain('text-foreground');
    expect(panel?.innerHTML).not.toContain('text-muted-foreground');
  });

  it('shows the cost change against the previous cycle', () => {
    const { container } = render(<CpaHeroTimeline currency="USD" series={cpaSeriesTrend} />);
    // The trend fixture ends below its previous cycle, so the delta reads as a fall.
    expect(container.textContent).toContain('↓');
  });
});
