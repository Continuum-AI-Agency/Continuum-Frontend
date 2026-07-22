import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { EmptyState } from './EmptyState';

afterEach(cleanup);

describe('EmptyState', () => {
  it('renders the outcome-first headline as a heading', () => {
    const { getByRole } = render(<EmptyState headline="Connect Instagram to see reach trends" />);
    expect(getByRole('heading', { name: /connect instagram to see reach trends/i })).toBeTruthy();
  });

  it('lists what unlocks after setup under an accessible label', () => {
    const { getByRole, getByText } = render(
      <EmptyState
        headline="Unlock organic insights"
        unlocks={['Reach trends', 'Best hooks', 'Post rankings']}
      />,
    );
    const list = getByRole('list', { name: /what you unlock after setup/i });
    expect(list).toBeTruthy();
    expect(getByText('Reach trends')).toBeTruthy();
    expect(getByText('Best hooks')).toBeTruthy();
    expect(getByText('Post rankings')).toBeTruthy();
  });

  it('omits the unlocks list when none are provided', () => {
    const { queryByRole } = render(<EmptyState headline="Nothing here yet" />);
    expect(queryByRole('list')).toBeNull();
  });

  it('renders the primary and secondary actions', () => {
    const { getByRole } = render(
      <EmptyState
        headline="Get started"
        action={<button type="button">Connect Meta</button>}
        secondaryAction={<button type="button">Learn more</button>}
      />,
    );
    expect(getByRole('button', { name: 'Connect Meta' })).toBeTruthy();
    expect(getByRole('button', { name: 'Learn more' })).toBeTruthy();
  });

  it('renders the description when provided', () => {
    const { getByText } = render(
      <EmptyState headline="Get started" description="Setup takes about a minute." />,
    );
    expect(getByText('Setup takes about a minute.')).toBeTruthy();
  });
});
