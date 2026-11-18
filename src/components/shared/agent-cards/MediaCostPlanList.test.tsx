import { afterEach, describe, expect, it } from 'bun:test';
import { mediaCostLine, mediaCostPlan } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import { MediaCostPlanList } from './MediaCostPlanList';

afterEach(cleanup);

const reel = mediaCostPlan(
  [
    mediaCostLine('video', 'Omni clip · hook (4 s)', 'gemini-omni-flash', 4),
    mediaCostLine('image', 'Opening still · hook', 'nano-banana-2@512px', 1),
  ],
  9,
  'Plus a few cents of model reads for the gates.',
);

describe('MediaCostPlanList', () => {
  it('heads with what the brand is billed and itemizes every generation at list price', () => {
    const { container, getByText } = render(<MediaCostPlanList plan={reel} />);
    const field = (name: string) => container.querySelector(`[data-field="${name}"]`)?.textContent;
    expect(field('billed-cap-usd')).toBe('$10.35');
    expect(field('billed-expected-usd')).toBe('$0.52');
    expect(getByText('Omni clip · hook (4 s)')).toBeTruthy();
    expect(getByText('$0.40')).toBeTruthy();
    expect(getByText('4 s × $0.10 · gemini-omni-flash')).toBeTruthy();
    // A sub-cent unit price keeps its third decimal; the line total rounds to cents.
    expect(getByText('1 image × $0.045 · nano-banana-2@512px')).toBeTruthy();
    expect(getByText('$0.04')).toBeTruthy();
    expect(container.textContent).toContain('List price $0.45 for one pass, cap $9.00.');
    expect(container.textContent).toContain('model reads for the gates');
  });

  it('a plan with no generations says why instead of an empty list', () => {
    const typeset = mediaCostPlan(
      [],
      0,
      'A typeset is rendered in the brand fonts: no model is called.',
    );
    const { container } = render(<MediaCostPlanList plan={typeset} />);
    expect(container.querySelector('ul')).toBeNull();
    expect(container.textContent).toContain('no model is called');
  });
});
