import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { PublishIntentSummary, type PublishIntentSummaryData } from './PublishIntentSummary';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

afterEach(cleanup);

const intent = (accountId: string | null): PublishIntentSummaryData => ({
  blockers: [],
  format: 'POST',
  account: { id: accountId },
  caption: { length: 5, preview: 'Hello' },
  media: { count: 1, required: 1 },
});

describe('PublishIntentSummary — the account the confirm names', () => {
  it('names the account by the handle the preview showed when it is the one addressed', () => {
    render(
      <PublishIntentSummary
        intent={intent('acct-1')}
        account={{ id: 'acct-1', label: '@plfid.studio' }}
      />,
    );
    expect(screen.getByText('@plfid.studio')).toBeTruthy();
    expect(screen.queryByText('acct-1')).toBeNull();
  });

  // A handle for a different account would name the wrong destination on a public post.
  it('falls back to the id the server addresses when the shown account differs', () => {
    render(
      <PublishIntentSummary
        intent={intent('acct-2')}
        account={{ id: 'acct-1', label: '@plfid.studio' }}
      />,
    );
    expect(screen.getByText('acct-2')).toBeTruthy();
    expect(screen.queryByText('@plfid.studio')).toBeNull();
  });

  it('says no account is selected when the server addresses none', () => {
    render(<PublishIntentSummary intent={intent(null)} />);
    expect(screen.getByText('No account selected')).toBeTruthy();
  });
});
