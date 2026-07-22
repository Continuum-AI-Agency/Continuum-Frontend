import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { ErrorRetryState } from './ErrorRetryState';

afterEach(cleanup);

describe('ErrorRetryState', () => {
  it('announces the failure with role=alert and shows the message', () => {
    const { getByRole, getByText } = render(
      <ErrorRetryState message="We could not reach the analytics service." />,
    );
    expect(getByRole('alert')).toBeTruthy();
    expect(getByText('We could not reach the analytics service.')).toBeTruthy();
  });

  it('fires onRetry when the retry button is clicked', () => {
    const onRetry = mock(() => {});
    const { getByRole } = render(<ErrorRetryState message="Sync failed." onRetry={onRetry} />);
    fireEvent.click(getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button when no handler is supplied', () => {
    const { queryByRole } = render(<ErrorRetryState message="Sync failed." />);
    expect(queryByRole('button')).toBeNull();
  });

  it('uses a custom retry label when provided', () => {
    const { getByRole } = render(
      <ErrorRetryState message="Sync failed." onRetry={() => {}} retryLabel="Try again" />,
    );
    expect(getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
