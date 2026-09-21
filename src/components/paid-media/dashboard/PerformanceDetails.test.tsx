import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { PerformanceDetails } from './PerformanceDetails';

// The comparison grid prints one tile per metric, CPC and CPA among them, and coloured the
// change by its sign. A cost per acquisition that came DOWN — the whole point — rendered in
// the destructive colour next to a ROAS that rose in green.

function comparison(metricKey: string, percentageChange: number) {
  return {
    [metricKey]: { current: 10, previous: 12, percentageChange },
  };
}

describe('PerformanceDetails comparison tiles', () => {
  afterEach(cleanup);

  it('colours a rising ROAS green and a falling one destructive', () => {
    const { rerender } = render(<PerformanceDetails comparison={comparison('roas', 8.4)} />);
    expect(screen.getByText('+8.4%').className).toContain('text-emerald-600');
    rerender(<PerformanceDetails comparison={comparison('roas', -8.4)} />);
    expect(screen.getByText('-8.4%').className).toContain('text-destructive');
  });

  it('colours a FALLING CPA green and a rising one destructive', () => {
    const { rerender } = render(<PerformanceDetails comparison={comparison('cpa', -8.4)} />);
    const fell = screen.getByText('-8.4%');
    expect(fell.className).toContain('text-emerald-600');
    expect(fell.className).not.toContain('text-destructive');

    rerender(<PerformanceDetails comparison={comparison('cpa', 8.4)} />);
    expect(screen.getByText('+8.4%').className).toContain('text-destructive');
  });

  it('colours a falling CPC green too, and leaves the sign alone', () => {
    render(<PerformanceDetails comparison={comparison('cpc', -3.1)} />);
    const chip = screen.getByText('-3.1%');
    expect(chip.className).toContain('text-emerald-600');
    expect(chip.textContent).toBe('-3.1%');
  });
});
