import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Stub the visx AreaChart (needs ResizeObserver). The metric toggle + creative
// chips (the interactive chrome we assert) render outside it.
mock.module('@/components/charts/area-chart', () => ({
  AreaChart: () => <div data-testid="timeline-chart" />,
  Area: () => null,
}));

const { AdSetTimeline } = await import('./AdSetTimeline');

afterEach(cleanup);

function trend(adId: string, name: string, spends: number[]) {
  return {
    ad_id: adId,
    ad_name: name,
    series: spends.map((spend, index) => ({
      date: `2026-07-0${index + 1}`,
      spend,
      impressions: 0,
      clicks: 0,
      ctr: 0,
      cpc: 0,
      cpa: null,
      roas: null,
      purchases: 0,
      purchase_value: 0,
    })),
  };
}

describe('AdSetTimeline', () => {
  it('shows the empty state until a creative has two days of delivery', () => {
    const { getByText } = render(<AdSetTimeline trends={[trend('a', 'A', [10]) as never]} />);
    expect(getByText(/per-creative trends appear/i)).toBeTruthy();
  });

  it('renders the metric toggle and a chip per chartable creative', () => {
    const { getByText, container } = render(
      <AdSetTimeline
        trends={[trend('a', 'Alpha', [10, 12]) as never, trend('b', 'Bravo', [5, 8]) as never]}
      />,
    );
    expect(getByText('Spend')).toBeTruthy();
    expect(getByText('ROAS')).toBeTruthy();
    expect(getByText('Alpha')).toBeTruthy();
    expect(getByText('Bravo')).toBeTruthy();
    expect(container.textContent).toContain('2 of 2 creatives');
  });
});
