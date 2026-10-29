import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, waitFor } from '@testing-library/react';

import { StrandedLockGuard } from './StrandedLockGuard';

afterEach(() => {
  cleanup();
  document.body.removeAttribute('style');
});

describe('StrandedLockGuard — a lock left behind by a closed dialog', () => {
  it('lifts body pointer-events:none once no dialog is open', async () => {
    render(<StrandedLockGuard settleMs={10} />);
    document.body.style.pointerEvents = 'none';
    await waitFor(() => expect(document.body.style.pointerEvents).toBe(''));
  });

  it('leaves the lock while a dialog is open', async () => {
    const { container } = render(
      <>
        <StrandedLockGuard settleMs={10} />
        <div data-open role="alertdialog">
          Create the ad set?
        </div>
      </>,
    );
    document.body.style.pointerEvents = 'none';
    await new Promise((done) => setTimeout(done, 60));
    expect(document.body.style.pointerEvents).toBe('none');
    expect(container.textContent).toContain('Create the ad set?');
  });
});
