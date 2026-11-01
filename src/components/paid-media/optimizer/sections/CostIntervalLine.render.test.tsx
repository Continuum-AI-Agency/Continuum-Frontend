import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

import { CostIntervalLine } from './CostIntervalLine';

afterEach(cleanup);

function figure(container: HTMLElement, key: string) {
  return container.querySelector(`[data-figure="${key}"]`);
}

describe('CostIntervalLine', () => {
  it('prints the estimate and its interval for a measured ad set', () => {
    const { container } = render(
      <CostIntervalLine adsetId="a1" ci={{ cpa: 22, lo: 16, hi: 30, events: 55 }} currency="USD" />,
    );
    expect(container.textContent).toBe(
      'Cost: $22.00 USD (likely $16.00 USD–$30.00 USD) from 55 events',
    );
    expect(figure(container, 'queue.a1.detail.ci.hi')?.getAttribute('data-figure-raw')).toBe('30');
  });

  // The engine's { cpa: 0, lo: 0, hi: null, events: 0 }: this used to print "Cost: $0.00 from
  // 0 events", a cost the ad set never had.
  it('says there is no upper bound yet for a zero-conversion ad set', () => {
    const { container } = render(
      <CostIntervalLine adsetId="a2" ci={{ cpa: 0, lo: 0, hi: null, events: 0 }} currency="USD" />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('no upper bound yet (0 conversions)');
    expect(text).not.toContain('$0');
    expect(text).not.toContain('NaN');
    const hi = figure(container, 'queue.a2.detail.ci.hi');
    expect(hi?.getAttribute('data-figure-raw')).toBe('');
    expect(figure(container, 'queue.a2.detail.cost')).toBeNull();
  });

  // PP-DT-E-google-portfolio-money-without-currency: Google's data-driven credit is fractional,
  // and the line read "from 420.588645 events" on Easy Fit 2026's Google portfolio.
  it('rounds a fractional event count to one decimal', () => {
    const { container } = render(
      <CostIntervalLine
        adsetId="a4"
        ci={{ cpa: 36.73, lo: 33.4, hi: 40.4, events: 420.588645 }}
        currency="MXN"
      />,
    );
    expect(container.textContent).toContain('from 420.6 events');
    expect(container.textContent).not.toContain('420.588645');
  });

  it('renders nothing when there is no interval at all', () => {
    const { container } = render(<CostIntervalLine adsetId="a3" ci={null} currency="USD" />);
    expect(container.innerHTML).toBe('');
  });
});
