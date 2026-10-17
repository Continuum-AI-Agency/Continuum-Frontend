import { afterEach, describe, expect, it, jest, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { READ_TIMEOUT_MS } from '@/lib/api/timeout';
import { StepStart } from './StepStart';

// PP-L1-suggest-slower-than-read-timeout-reads-offline: a suggestion read that is slow (a cold
// Meta read, 8–13 s in production) is not an offline service. While it runs past the read bound
// the list says it is still reading; a read that timed out offers a retry; only a service that
// did not answer at all is called offline.

type Failure = 'timeout' | 'unreachable' | null;

function renderStart(props: { isLoading: boolean; failure: Failure; onRetry?: () => void }) {
  return (
    <StepStart
      accountId="act_1"
      brandId="brand-1"
      currency="MXN"
      emptyMessage="No grouped suggestions yet."
      failure={props.failure}
      isLoading={props.isLoading}
      onPick={() => {}}
      onRetry={props.onRetry ?? (() => {})}
      onScratch={() => {}}
      snapshots={[]}
      suggestions={[]}
    />
  );
}

afterEach(cleanup);

describe('StepStart when the suggestions are slow or fail', () => {
  it('says a timed-out read is slow and offers a retry, never that the service is offline', () => {
    const onRetry = mock(() => {});
    render(renderStart({ isLoading: false, failure: 'timeout', onRetry }));
    const notice = screen.getByTestId('suggestions-failure');
    expect(notice.textContent).not.toMatch(/offline/i);
    expect(notice.textContent).toMatch(/taking longer than usual/i);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Start from scratch/ })).toBeTruthy();
  });

  it('keeps the offline sentence for a service that did not answer', () => {
    render(renderStart({ isLoading: false, failure: 'unreachable' }));
    expect(screen.getByTestId('suggestions-failure').textContent).toMatch(
      /the optimizer service is offline/,
    );
  });

  it('names a read still running past the read bound instead of a silent skeleton', () => {
    jest.useFakeTimers();
    try {
      render(renderStart({ isLoading: true, failure: null }));
      expect(screen.queryByTestId('suggestions-slow')).toBeNull();
      act(() => {
        jest.advanceTimersByTime(READ_TIMEOUT_MS);
      });
      expect(screen.getByTestId('suggestions-slow').textContent).toMatch(
        /Still reading this account.s ad sets from Meta/,
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
