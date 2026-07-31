import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

const storeState: {
  selectedDraftId: string | null;
  selectedDraftIds: string[];
  editingDraftId: string | null;
  setSelectedDraftId: (id: string | null) => void;
  setEditingDraftId: (id: string | null) => void;
  toggleDraftSelection: (id: string) => void;
  clearDraftSelection: () => void;
  bulkDeleteDrafts: (ids: string[]) => void;
} = {
  selectedDraftId: null,
  selectedDraftIds: [],
  editingDraftId: null,
  setSelectedDraftId: mock((id: string | null) => {
    storeState.selectedDraftId = id;
  }),
  setEditingDraftId: mock((id: string | null) => {
    storeState.editingDraftId = id;
  }),
  toggleDraftSelection: mock(),
  clearDraftSelection: mock(() => {
    storeState.selectedDraftIds = [];
  }),
  bulkDeleteDrafts: mock(),
};

mock.module('@/lib/organic/store', () => createCalendarStoreStub(storeState));

mock.module('../primitives/DraftDeletionConfirmation', () => ({
  useDraftDeletionConfirmation: () => ({ requestDraftDeletion: mock() }),
}));

import { useCalendarSelection } from './useCalendarSelection';

function renderSelection(selectedDraftId: string | null = null, onDismiss?: () => void) {
  storeState.selectedDraftId = selectedDraftId;
  storeState.selectedDraftIds = [];
  return renderHook(() => useCalendarSelection([], { onDismiss }));
}

describe('useCalendarSelection', () => {
  beforeEach(() => {
    storeState.selectedDraftId = null;
    storeState.selectedDraftIds = [];
    storeState.editingDraftId = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('starts expanded and suppresses nothing', () => {
    const { result } = renderSelection('draft-1');
    expect(result.current.isPreviewCollapsed).toBe(false);
    expect(result.current.isAutoSelectSuppressed('draft-1')).toBe(false);
  });

  // Collapsing is what the panel's chevron does. It is deliberately NOT clearAll:
  // the draft stays selected so the preview can be re-opened in place.
  it('collapses the preview without clearing the selection', () => {
    const { result, rerender } = renderSelection('draft-1');

    act(() => result.current.collapsePreview());
    rerender();

    expect(result.current.isPreviewCollapsed).toBe(true);
    expect(storeState.selectedDraftId).toBe('draft-1');
    expect(result.current.selectedId).toBe('draft-1');
  });

  // The regression this hook exists to prevent: with `?draftId=` in the URL the
  // workspace's deep-link watcher re-selects the draft on the very next render, so
  // a collapse that only nulled the selection was undone before it could paint.
  it('keeps a collapsed preview collapsed while a deep-linked draft stays selected', () => {
    const { result, rerender } = renderSelection('draft-1');

    act(() => result.current.collapsePreview());
    rerender();

    // Simulate the deep-link watcher re-asserting the same draft.
    act(() => storeState.setSelectedDraftId('draft-1'));
    rerender();

    expect(result.current.isPreviewCollapsed).toBe(true);
    expect(result.current.isAutoSelectSuppressed('draft-1')).toBe(true);
  });

  it('suppresses auto-select for the draft the user just closed', () => {
    const { result, rerender } = renderSelection('draft-1');

    act(() => result.current.clearAll());
    rerender();

    expect(storeState.selectedDraftId).toBeNull();
    expect(result.current.isAutoSelectSuppressed('draft-1')).toBe(true);
    // Only that draft: closing one preview must not stop another from opening.
    expect(result.current.isAutoSelectSuppressed('draft-2')).toBe(false);
    expect(result.current.isAutoSelectSuppressed(null)).toBe(false);
    expect(result.current.isPreviewCollapsed).toBe(false);
  });

  it('re-opens on expand and clears the suppression', () => {
    const { result, rerender } = renderSelection('draft-1');

    act(() => result.current.collapsePreview());
    rerender();
    act(() => result.current.expandPreview());
    rerender();

    expect(result.current.isPreviewCollapsed).toBe(false);
    expect(result.current.isAutoSelectSuppressed('draft-1')).toBe(false);
  });

  // THE H-02 regression. With a single dismissal slot, landing on `?draftId=A`, clicking
  // pill B and closing recorded only B — so the deep-link watcher re-selected A and the
  // panel could not be closed by any means.
  it('keeps every dismissed draft suppressed, not just the last one', () => {
    const { result, rerender } = renderSelection('draft-a');

    act(() => result.current.clearAll());
    rerender();
    act(() => result.current.handleSelect('draft-b'));
    rerender();
    act(() => result.current.clearAll());
    rerender();

    expect(result.current.isAutoSelectSuppressed('draft-a')).toBe(true);
    expect(result.current.isAutoSelectSuppressed('draft-b')).toBe(true);
    expect(result.current.isAutoSelectSuppressed('draft-c')).toBe(false);
  });

  // Expanding used to clear the WHOLE set, re-arming every draft ever dismissed and
  // handing the deep-link watcher its loop back.
  it('re-arms only the selected draft on expand', () => {
    const { result, rerender } = renderSelection('draft-a');

    act(() => result.current.clearAll());
    rerender();
    act(() => result.current.handleSelect('draft-b'));
    rerender();
    act(() => result.current.collapsePreview());
    rerender();
    act(() => result.current.expandPreview());
    rerender();

    expect(result.current.isAutoSelectSuppressed('draft-b')).toBe(false);
    expect(result.current.isAutoSelectSuppressed('draft-a')).toBe(true);
  });

  it('tells the call site to strip the deep link when the preview is dismissed', () => {
    const onDismiss = mock();
    const { result } = renderSelection('draft-1', onDismiss);

    act(() => result.current.clearAll());
    expect(onDismiss).toHaveBeenCalledTimes(1);

    act(() => result.current.collapsePreview());
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  // A user can always get the panel back: picking the row again re-opens it even
  // after it was closed or collapsed.
  it('re-opens when the user selects the dismissed draft again', () => {
    const { result, rerender } = renderSelection('draft-1');

    act(() => result.current.collapsePreview());
    rerender();
    act(() => result.current.handleSelect('draft-1'));
    rerender();

    expect(result.current.isPreviewCollapsed).toBe(false);
    expect(result.current.isAutoSelectSuppressed('draft-1')).toBe(false);
    expect(storeState.selectedDraftId).toBe('draft-1');
  });

  it('leaves the preview alone for a multi-select toggle', () => {
    const { result, rerender } = renderSelection('draft-1');

    act(() => result.current.collapsePreview());
    rerender();
    act(() => result.current.handleSelect('draft-2', true));
    rerender();

    expect(result.current.isPreviewCollapsed).toBe(true);
    expect(storeState.selectedDraftId).toBe('draft-1');
  });

  it('closes the preview on Escape', () => {
    const { result, rerender } = renderSelection('draft-1');

    act(() =>
      result.current.handleKeyDown({
        key: 'Escape',
        preventDefault: () => undefined,
        shiftKey: false,
      } as React.KeyboardEvent),
    );
    rerender();

    expect(storeState.selectedDraftId).toBeNull();
    expect(result.current.isAutoSelectSuppressed('draft-1')).toBe(true);
  });

  // Dismissing the panel has to abandon the edit intent too, or the workspace's
  // expand-on-edit effect re-opens the panel the instant it is collapsed.
  it('clears the edit intent when the preview is collapsed', () => {
    const { result } = renderSelection('draft-1');
    storeState.editingDraftId = 'draft-1';

    act(() => result.current.collapsePreview());

    expect(storeState.editingDraftId).toBeNull();
  });

  it('clears the edit intent when the selection is cleared', () => {
    const { result } = renderSelection('draft-1');
    storeState.editingDraftId = 'draft-1';

    act(() => result.current.clearAll());

    expect(storeState.editingDraftId).toBeNull();
  });
});
