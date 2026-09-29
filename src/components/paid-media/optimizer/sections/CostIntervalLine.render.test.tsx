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
    expect(container.textContent).toBe('Cost: $22.00 (likely $16.00–$30.00) from 55 events');
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

  it('renders nothing when there is no interval at all', () => {
    const { container } = render(<CostIntervalLine adsetId="a3" ci={null} currency="USD" />);
    expect(container.innerHTML).toBe('');
  });
});
