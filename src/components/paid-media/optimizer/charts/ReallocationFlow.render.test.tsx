import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { cycleItemsHeldOnly, cycleItemsMixed } from './__fixtures__/optimizerFixtures';
import { ReallocationFlow } from './ReallocationFlow';

afterEach(cleanup);

describe('ReallocationFlow', () => {
  it('shows the empty state when only held ad sets remain (no flow)', () => {
    const { getByText } = render(<ReallocationFlow items={cycleItemsHeldOnly} />);
    expect(getByText(/No budget moved this cycle/i)).toBeTruthy();
  });

  it('renders gain/loss bars on the semantic tokens, never hardcoded emerald/rose', () => {
    const { getByText, container } = render(
      <ReallocationFlow items={cycleItemsMixed} currency="USD" />,
    );
    expect(getByText('act_1::adset_gainer')).toBeTruthy();
    expect(getByText('act_1::adset_loser')).toBeTruthy();
    expect(container.textContent).toContain('$40 moved across 2 ad sets');
    expect(container.innerHTML).toContain('bg-success');
    expect(container.innerHTML).toContain('bg-destructive');
    expect(container.innerHTML).not.toMatch(/emerald-|rose-/);
  });
});
