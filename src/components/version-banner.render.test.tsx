import { afterEach, describe, expect, it } from 'bun:test';
import { act, cleanup, render, screen } from '@testing-library/react';

import { VersionBanner } from './version-banner';

afterEach(cleanup);

function rejectWith(reason: unknown) {
  const event = new Event('unhandledrejection') as Event & { reason: unknown };
  Object.defineProperty(event, 'reason', { value: reason });
  window.dispatchEvent(event);
}

describe('VersionBanner — a stale tab offers the reload instead of dead buttons', () => {
  it('appears when a press needs a chunk the deployment no longer serves', () => {
    render(<VersionBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    const chunk = new Error('Loading chunk 4821 failed.');
    chunk.name = 'ChunkLoadError';
    act(() => rejectWith(chunk));
    expect(screen.getByRole('status').textContent).toContain(
      'This tab is running an older version',
    );
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
  });

  it('appears when a Server Action id belongs to an older deployment', () => {
    render(<VersionBanner />);
    // A Server Action called from a click rejects with this when its id is from another build.
    act(() =>
      rejectWith(
        new Error(
          'Failed to find Server Action "7f3a". This request might be from an older or newer deployment.',
        ),
      ),
    );
    expect(screen.getByRole('status').textContent).toContain(
      'This tab is running an older version',
    );
  });

  it('stays hidden for an ordinary error', () => {
    render(<VersionBanner />);
    act(() => rejectWith(new Error('Could not ask Jaina.')));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
