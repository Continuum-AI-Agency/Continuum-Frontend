import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

const { StepFunnel } = await import('./StepFunnel');

afterEach(cleanup);

describe('StepFunnel', () => {
  it('shows the empty state when the window has no delivery', () => {
    const { getByText } = render(
      <StepFunnel objective="purchase" window={{ impressions: 0, clicks: 0 }} />,
    );
    expect(getByText(/conversion funnel appears/i)).toBeTruthy();
  });

  it('renders every stage of the four-stage purchase funnel', () => {
    const { container } = render(
      <StepFunnel
        objective="purchase"
        window={{ impressions: 10_000, clicks: 500, addToCarts: 100, purchases: 25 }}
      />,
    );
    for (const label of ['Impressions', 'Clicks', 'Add to cart', 'Purchases']) {
      expect(container.textContent).toContain(label);
    }
  });

  it('shows step conversion rates and absolute counts together', () => {
    const { container } = render(
      <StepFunnel objective="lead" window={{ impressions: 10_000, clicks: 1000, leads: 100 }} />,
    );
    expect(container.textContent).toContain('10%');
    expect(container.textContent).toContain('10,000');
    expect(container.textContent).toContain('1,000');
    expect(container.textContent).toContain('100');
  });

  it('spells out what was lost at each step', () => {
    const { container } = render(
      <StepFunnel objective="lead" window={{ impressions: 10_000, clicks: 1000, leads: 100 }} />,
    );
    expect(container.textContent).toContain('9,000 lost at this step');
    expect(container.textContent).toContain('900 lost at this step');
  });

  // The real account's rate is 0.13% — rounding it to "0%" would read as "nothing converts".
  it('keeps a sub-1% rate legible instead of rounding it to zero', () => {
    const { container } = render(
      <StepFunnel objective="lead" window={{ impressions: 244_341, clicks: 1277, leads: 316 }} />,
    );
    expect(container.textContent).toContain('0.5%');
    expect(container.textContent).not.toContain('0% ');
  });

  it('names the overall conversion against the objective goal', () => {
    const { container } = render(
      <StepFunnel objective="lead" window={{ impressions: 10_000, clicks: 1000, leads: 100 }} />,
    );
    expect(container.textContent).toContain('become leads');
  });

  // The whole point of the rewrite: bar length is the step rate, not the raw volume.
  it('scales bars by step conversion, so a tiny terminal stage is still visible', () => {
    const { container } = render(
      <StepFunnel objective="lead" window={{ impressions: 244_341, clicks: 1277, leads: 316 }} />,
    );
    const widths = [...container.querySelectorAll<HTMLElement>('[style*="width"]')].map(
      (node) => node.style.width,
    );
    // Leads/clicks is ~25%, which must NOT collapse to a hairline the way 316/244,341 would.
    expect(widths.some((width) => Number.parseFloat(width) > 20)).toBe(true);
  });
});
