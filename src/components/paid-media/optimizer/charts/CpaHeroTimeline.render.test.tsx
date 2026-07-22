import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Stub the BKLit ComposedChart container (needs ResizeObserver). It ignores its
// children, so the projection line, terminal marker, action pins and tooltip
// never render (no chart context needed) — we assert the projected-CPA header and
// the empty-vs-populated switch, which is the hero's own chrome.
mock.module('@/components/charts/composed-chart', () => ({
  ComposedChart: () => <div data-testid="hero-chart" />,
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

  it('labels the y-axis with the objective cost label (CPM for awareness)', () => {
    const { container } = render(<CpaHeroTimeline objective="awareness" series={cpaSeriesTrend} />);
    // The rotated axis title names the cost — even with the chart body stubbed out.
    expect(container.textContent).toContain('CPM');
  });
});
