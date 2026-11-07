import { afterEach, describe, expect, test } from 'bun:test';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
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
  test('branch switching parks the persistent copy without saving or discarding its edits', async () => {
    const { result } = renderHook(() => useForgeExitGuard());
    let parked = false;
    let saved = false;
    let discarded = false;
    act(() => result.current.onDraftChange({ contextId: 'working-copy-a', dirty: true, busy: false, saveLabel: 'Save',
      save: async () => { saved = true; return true; }, discard: () => { discarded = true; },
      park: async () => { parked = true; return true; } }));
    await act(async () => { expect(await result.current.runPreserving(() => { document.body.dataset.exited = 'yes'; })).toBe(true); });
    expect(parked).toBe(true);
    expect(saved).toBe(false);
    expect(discarded).toBe(false);
    expect(document.body.dataset.exited).toBe('yes');
  });

  test('a delayed parking acknowledgement cannot navigate a replacement working copy', async () => {
    const { result } = renderHook(() => useForgeExitGuard());
    let finish!: (value: boolean) => void;
    const parking = new Promise<boolean>((resolve) => { finish = resolve; });
    const draft = { dirty: true, busy: false, saveLabel: 'Save', save: async () => true, discard: () => {} };
    act(() => result.current.onDraftChange({ ...draft, contextId: 'working-copy-a', park: () => parking }));
    const switching = result.current.runPreserving(() => { document.body.dataset.exited = 'yes'; });
    act(() => result.current.onDraftChange({ ...draft, contextId: 'working-copy-b' }));
    await act(async () => { finish(true); expect(await switching).toBe(false); });
    expect(document.body.dataset.exited).toBeUndefined();
  });

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
