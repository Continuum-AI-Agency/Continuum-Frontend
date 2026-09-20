import { afterEach, describe, expect, it } from 'bun:test';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { installPickerDomGlobals } from '@/components/automations/workspace/pickers/pickerTestHarness';
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

// Base UI's toast waits on a MutationObserver; happy-dom's, lifted per file like the pickers do.
installPickerDomGlobals();

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

  it('an action is a button named for it, and pressing it runs the action once', async () => {
    render(<ToastProvider>{null}</ToastProvider>);
    let undone = 0;

    act(() => {
      toast.success('Deleted 2 rows', { action: { label: 'Undo', onClick: () => undone++ } });
    });

    const button = await screen.findByRole('button', { name: 'Undo' });
    act(() => button.click());
    expect(undone).toBe(1);

    // Pressing it also dismisses the toast. Waited for rather than asserted straight away,
    // because unmounting while the exit animation is still running CANCELS it, and happy-dom
    // rejects the cancelled animation's `finished` where nothing is listening.
    await waitFor(() => expect(screen.queryAllByText('Deleted 2 rows')).toHaveLength(0));
  });
});
