import { afterEach, describe, expect, it } from 'bun:test';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from './ToastProvider';
import { toast } from './toast-imperative';

// Guards the seam that was broken, not the toast component.
//
// Eighty `toast.*()` calls across 22 files pushed into `sonner`'s store while no `<Toaster>`
// was ever mounted, so every one rendered nothing — including both branches of the
// paid-media approve/reject flow, where a failed Meta call looked identical to a successful
// one. Nothing failed: the import resolved, the call returned, the sink just did not exist.
//
// So the assertion has to be that a MODULE-LEVEL call reaches a MOUNTED renderer and puts
// text on screen. Asserting the function was called would have passed the whole time.

afterEach(cleanup);

describe('imperative toast', () => {
  it('renders a toast raised from outside React', async () => {
    render(<ToastProvider>{null}</ToastProvider>);

    act(() => {
      toast.error('Approve failed · Meta call rejected');
    });

    await waitFor(() => {
      expect(screen.getByText('Approve failed · Meta call rejected')).toBeTruthy();
    });
  });

  it('carries the description through', async () => {
    render(<ToastProvider>{null}</ToastProvider>);

    act(() => {
      toast.success('Approved', { description: 'Budget increase · Ad set 42' });
    });

    await waitFor(() => {
      expect(screen.getByText('Budget increase · Ad set 42')).toBeTruthy();
    });
  });

  it('supports the bare call form', async () => {
    render(<ToastProvider>{null}</ToastProvider>);

    act(() => {
      toast('Node deleted', { description: 'Fetch competitor ads' });
    });

    await waitFor(() => {
      expect(screen.getByText('Node deleted')).toBeTruthy();
    });
  });

  it('flushes calls raised before the provider mounted', async () => {
    // A store can fire during module init, before any layout has rendered. Dropping those
    // is how the old path behaved; they should survive until there is somewhere to put them.
    act(() => {
      toast.info('Queued before mount');
    });

    render(<ToastProvider>{null}</ToastProvider>);

    await waitFor(() => {
      expect(screen.getByText('Queued before mount')).toBeTruthy();
    });
  });
});
