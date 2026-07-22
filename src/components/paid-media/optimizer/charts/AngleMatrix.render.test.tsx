import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { angleCellsPopulated, angleCellsUntagged } from './__fixtures__/optimizerFixtures';
import { AngleMatrix } from './AngleMatrix';

afterEach(cleanup);

describe('AngleMatrix', () => {
  it('shows the empty state until the first cycle scores', () => {
    const { getByText } = render(<AngleMatrix cells={[]} />);
    expect(getByText(/No audience data yet/i)).toBeTruthy();
  });

  it('renders CPA cells with token fills (no hardcoded hsl) and a text alternative', () => {
    const { container, getByLabelText, getAllByRole } = render(
      <AngleMatrix cells={angleCellsPopulated} currency="USD" />,
    );
    expect(container.textContent).toContain('$20');
    expect(container.textContent).toContain('$70');
    expect(container.innerHTML).not.toMatch(/hsl\(/);
    expect(getAllByRole('img').length).toBeGreaterThan(0);
    expect(getByLabelText(/Prospecting, Social proof/i)).toBeTruthy();
  });

  it('surfaces the honest labeler note when every angle is untagged', () => {
    const { getByText } = render(<AngleMatrix cells={angleCellsUntagged} />);
    expect(getByText(/haven.t been analyzed for creative angle yet/i)).toBeTruthy();
    expect(getByText(/labeler processes this account automatically/i)).toBeTruthy();
  });
});
