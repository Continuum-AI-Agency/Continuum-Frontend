import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { LayerDraftState } from '@/components/forge/layerDraft';
import { confirmForgeExit, useForgeExitGuard } from './useForgeExitGuard';

afterEach(() => {
  cleanup();
  delete document.body.dataset.exited;
});

function Harness({ saveResult = true }: { saveResult?: boolean }) {
  const guard = useForgeExitGuard();
  const draft: LayerDraftState = {
    dirty: true,
    busy: false,
    saveLabel: 'new variant',
    save: async () => {
      if (saveResult) guard.onDraftChange(null);
      return saveResult;
    },
    discard: () => guard.onDraftChange(null),
  };
  return (
    <>
      <button type="button" onClick={() => guard.onDraftChange(draft)}>
        Dirty
      </button>
      <button
        type="button"
        onClick={() => guard.runGuarded(() => (document.body.dataset.exited = 'yes'))}
      >
        Exit
      </button>
      {guard.dialog}
    </>
  );
}

describe('useForgeExitGuard', () => {
  test('holds the requested exit until the person discards', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Dirty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(document.body.dataset.exited).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(document.body.dataset.exited).toBe('yes'));
  });

  test('returns focus to the exit control after Stay closes the accessible dialog', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Dirty' }));
    const exit = screen.getByRole('button', { name: 'Exit' });
    exit.focus();
    fireEvent.click(exit);
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));

    await waitFor(() => expect(document.activeElement).toBe(exit));
  });

  test('uses the browser beforeunload warning while the draft is dirty', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Dirty' }));
    const unload = new Event('beforeunload', { cancelable: true });

    window.dispatchEvent(unload);

    expect(unload.defaultPrevented).toBe(true);
  });

  test('continues only after save succeeds', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Dirty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    fireEvent.click(screen.getByRole('button', { name: 'new variant' }));
    await waitFor(() => expect(document.body.dataset.exited).toBe('yes'));
  });

  test('keeps the dialog open when save fails', async () => {
    render(<Harness saveResult={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dirty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    fireEvent.click(screen.getByRole('button', { name: 'new variant' }));
    await waitFor(() => expect(screen.getByText('Unsaved layer changes')).toBeTruthy());
    expect(document.body.dataset.exited).toBeUndefined();
  });

  test('resolves a pending external exit as denied when the guard unmounts', async () => {
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Dirty' }));
    const pending = confirmForgeExit();
    view.unmount();
    await expect(pending).resolves.toBe(false);
  });
});
