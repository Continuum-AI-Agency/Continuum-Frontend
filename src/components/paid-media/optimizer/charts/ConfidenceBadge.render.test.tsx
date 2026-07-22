import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { ConfidenceBadge } from './ConfidenceBadge';

afterEach(cleanup);

function litSegments(meter: HTMLElement): number {
  return meter.querySelectorAll('[data-on="true"]').length;
}

describe('ConfidenceBadge', () => {
  it('lights all three segments and shows the score for a high band', () => {
    const { getByTestId, container } = render(<ConfidenceBadge band="high" score={0.72} />);
    expect(litSegments(getByTestId('confidence-meter'))).toBe(3);
    expect(container.textContent).toContain('High');
    expect(container.textContent).toContain('72%');
  });

  it('lights only the first segment for a low band', () => {
    const { getByTestId, container } = render(<ConfidenceBadge band="low" score={0.1} />);
    expect(litSegments(getByTestId('confidence-meter'))).toBe(1);
    expect(container.textContent).toContain('Low');
  });

  it('lights two segments for a medium band', () => {
    const { getByTestId } = render(<ConfidenceBadge band="medium" />);
    expect(litSegments(getByTestId('confidence-meter'))).toBe(2);
  });

  it('defaults an unknown band to the medium (two-segment) meter', () => {
    const { getByTestId } = render(<ConfidenceBadge band={null} />);
    expect(litSegments(getByTestId('confidence-meter'))).toBe(2);
  });

  it('omits the score when none is provided (label still renders)', () => {
    const { container } = render(<ConfidenceBadge band="high" />);
    expect(container.textContent).toContain('High');
    expect(container.textContent).not.toMatch(/\d%/);
  });

  it('is a three-segment meter, not a single rounded pill', () => {
    const { getByTestId } = render(<ConfidenceBadge band="high" score={0.5} />);
    expect(getByTestId('confidence-meter').querySelectorAll('span').length).toBe(3);
  });
});
