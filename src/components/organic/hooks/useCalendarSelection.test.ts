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

const requestDraftDeletion = mock((_ids: string[], _deleteDrafts: (ids: string[]) => void) => {});

mock.module('../primitives/DraftDeletionConfirmation', () => ({
  useDraftDeletionConfirmation: () => ({ requestDraftDeletion }),
}));

import {
  findSelectionFocusTarget,
  isEditableTarget,
  openerShowsTarget,
  useCalendarSelection,
} from './useCalendarSelection';

// The planner root as the workspace renders it: the view region holding a chip, and the
// preview beside it holding the caption editor and a plain button.
function plannerDom() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div data-tour-id="organic-list-content"><button data-draft-id="draft-1">chip</button></div>
    <aside><textarea aria-label="Caption"></textarea><button>Approve</button></aside>`;
  document.body.append(root);
  const find = (selector: string) => {
    const element = root.querySelector(selector);
    if (!element) throw new Error(`fixture lost ${selector}`);
    return element;
  };
  return {
    root,
    chip: find('[data-draft-id]'),
    caption: find('textarea'),
    previewButton: find('aside button'),
  };
}

function keyEvent(
  key: string,
  target: Element,
  currentTarget: Element,
  overrides: { defaultPrevented?: boolean; shiftKey?: boolean } = {},
) {
  return {
    key,
    target,
    currentTarget,
    defaultPrevented: false,
    shiftKey: false,
    preventDefault: () => undefined,
    ...overrides,
  } as unknown as React.KeyboardEvent;
}

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
    requestDraftDeletion.mockClear();
    document.body.innerHTML = '';
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
    const { root, chip } = plannerDom();

    act(() => result.current.handleKeyDown(keyEvent('Escape', chip, root)));
    rerender();

    expect(storeState.selectedDraftId).toBeNull();
    expect(result.current.isAutoSelectSuppressed('draft-1')).toBe(true);
  });

  // The first Escape in the caption belongs to the editor; only the next one closes.
  it('leaves Escape typed into the caption to the editor', () => {
    const { result } = renderSelection('draft-1');
    const { root, caption } = plannerDom();

    act(() => result.current.handleKeyDown(keyEvent('Escape', caption, root)));

    expect(storeState.selectedDraftId).toBe('draft-1');
  });

  it('ignores an Escape the editor already handled', () => {
    const { result } = renderSelection('draft-1');
    const { root, chip } = plannerDom();

    act(() =>
      result.current.handleKeyDown(keyEvent('Escape', chip, root, { defaultPrevented: true })),
    );

    expect(storeState.selectedDraftId).toBe('draft-1');
  });

  // React bubbles a portalled dialog's keys to the planner root although its DOM is not
  // inside it.
  it('ignores keys from outside the planner root', () => {
    const { result } = renderSelection('draft-1');
    const { root } = plannerDom();
    const portalled = document.createElement('button');
    document.body.append(portalled);

    act(() => result.current.handleKeyDown(keyEvent('Escape', portalled, root)));
    act(() => result.current.handleKeyDown(keyEvent('Delete', portalled, root)));

    expect(storeState.selectedDraftId).toBe('draft-1');
    expect(requestDraftDeletion).not.toHaveBeenCalled();
  });

  // The keys of a keyboard drag are the drag's: Escape cancels the move and the arrows carry
  // the chip, so neither may close the preview or move the selection underneath it.
  it('stands down while a chip is being dragged', () => {
    const { result } = renderSelection('draft-1');
    const { root, chip } = plannerDom();
    chip.setAttribute('data-dragging', '');

    act(() => result.current.handleKeyDown(keyEvent('Escape', chip, root)));
    act(() => result.current.handleKeyDown(keyEvent('Delete', chip, root)));

    expect(storeState.selectedDraftId).toBe('draft-1');
    expect(requestDraftDeletion).not.toHaveBeenCalled();
  });

  // aria-pressed is the chip's selection state, not a drag: a selected chip keeps its keys.
  it('still answers a selected chip that is not being dragged', () => {
    const { result } = renderSelection('draft-1');
    const { root, chip } = plannerDom();
    chip.setAttribute('aria-pressed', 'true');
    chip.setAttribute('aria-roledescription', 'draggable');

    act(() => result.current.handleKeyDown(keyEvent('Escape', chip, root)));

    expect(storeState.selectedDraftId).toBeNull();
  });

  it('never raises the delete dialog for Backspace in the caption', () => {
    const { result } = renderSelection('draft-1');
    const { root, caption } = plannerDom();

    act(() => result.current.handleKeyDown(keyEvent('Backspace', caption, root)));

    expect(requestDraftDeletion).not.toHaveBeenCalled();
  });

  it('asks to delete the selected draft on Delete from the grid', () => {
    const { result } = renderSelection('draft-1');
    const { root, chip } = plannerDom();

    act(() => result.current.handleKeyDown(keyEvent('Delete', chip, root)));

    expect(requestDraftDeletion).toHaveBeenCalledTimes(1);
    expect(requestDraftDeletion.mock.calls[0]?.[0]).toEqual(['draft-1']);
  });

  it('does not delete from a control in the preview', () => {
    const { result } = renderSelection('draft-1');
    const { root, previewButton } = plannerDom();

    act(() => result.current.handleKeyDown(keyEvent('Delete', previewButton, root)));

    expect(requestDraftDeletion).not.toHaveBeenCalled();
  });

  // Memoised grid chips receive handlers built on clearAll; a new identity per selection
  // re-rendered every one of them.
  it('keeps clearAll stable across selection changes', () => {
    const { result, rerender } = renderSelection('draft-1');
    const first = result.current.clearAll;

    act(() => result.current.handleSelect('draft-2'));
    rerender();

    expect(result.current.selectedId).toBe('draft-2');
    expect(result.current.clearAll).toBe(first);
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

describe('findSelectionFocusTarget', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function grid(markup: string) {
    const root = document.createElement('div');
    root.innerHTML = markup;
    document.body.append(root);
    return root;
  }

  it('finds the chip of the dismissed draft, ids with selector characters included', () => {
    const root = grid(
      '<button data-draft-id="a"></button><button data-draft-id="b:1&quot;]"></button>',
    );

    expect(findSelectionFocusTarget(root, { kind: 'draft', id: 'b:1"]' })).toBe(
      root.querySelectorAll('button')[1] as HTMLElement,
    );
  });

  it('finds a published post by its own attribute, not a draft with the same id', () => {
    const root = grid('<button data-draft-id="x"></button><button data-post-id="x"></button>');

    expect(
      findSelectionFocusTarget(root, { kind: 'post', id: 'x' }).hasAttribute('data-post-id'),
    ).toBe(true);
  });

  it('falls back to the day overflow when the chip is folded into "+N more"', () => {
    const root = grid('<button data-day-overflow="2026-08-03"></button>');

    expect(findSelectionFocusTarget(root, { kind: 'draft', id: 'gone', dayId: '2026-08-03' })).toBe(
      root.querySelector('button') as HTMLElement,
    );
  });

  // A draft in another week has no chip on screen; its dock row is the next best place, and
  // only after the calendar has had its say.
  it('falls back to the draft\u2019s dock row when no calendar chip is on screen', () => {
    const root = grid(
      '<ul><li data-dock-item data-dock-draft-id="far"><button>row</button><button>Add media</button></li></ul>',
    );

    expect(findSelectionFocusTarget(root, { kind: 'draft', id: 'far', dayId: null })).toBe(
      root.querySelector('button') as HTMLElement,
    );
  });

  it('prefers the calendar chip over the dock row', () => {
    const root = grid(
      '<li data-dock-draft-id="d"><button>row</button></li><button data-draft-id="d">chip</button>',
    );

    expect(findSelectionFocusTarget(root, { kind: 'draft', id: 'd' }).textContent).toBe('chip');
  });

  it('falls back to the planner root when nothing matches', () => {
    const root = grid('<button data-draft-id="other"></button>');

    expect(findSelectionFocusTarget(root, { kind: 'draft', id: 'gone', dayId: null })).toBe(root);
  });
});

describe('openerShowsTarget', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function control(markup: string, selector: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = markup;
    document.body.append(root);
    return root.querySelector(selector) as HTMLElement;
  }

  it('accepts the chip of the selected draft', () => {
    const chip = control('<div data-draft-id="b"><button>chip</button></div>', 'button');
    expect(openerShowsTarget(chip, { kind: 'draft', id: 'b' })).toBe(true);
  });

  // ArrowDown moved the selection from A to B; A's chip no longer stands for the preview.
  it('rejects the chip of a draft the arrows moved away from', () => {
    const chip = control('<button data-draft-id="a">chip</button>', 'button');
    expect(openerShowsTarget(chip, { kind: 'draft', id: 'b' })).toBe(false);
  });

  it('accepts the "Add media" button of the selected draft\u2019s dock row', () => {
    const addMedia = control(
      '<li data-dock-draft-id="b"><button>row</button><button id="add">Add media</button></li>',
      '#add',
    );
    expect(openerShowsTarget(addMedia, { kind: 'draft', id: 'b' })).toBe(true);
  });

  it('matches a post by its own attribute, never a draft with the same id', () => {
    const post = control('<button data-post-id="x">post</button>', 'button');
    const draftChip = control('<button data-draft-id="x">draft</button>', 'button');
    expect(openerShowsTarget(post, { kind: 'post', id: 'x' })).toBe(true);
    expect(openerShowsTarget(draftChip, { kind: 'post', id: 'x' })).toBe(false);
  });

  it('rejects a control that stands for nothing', () => {
    const toolbar = control('<button>Today</button>', 'button');
    expect(openerShowsTarget(toolbar, { kind: 'draft', id: 'b' })).toBe(false);
  });
});

describe('isEditableTarget', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is true for fields and anything inside an editable region', () => {
    const { caption, chip } = plannerDom();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const inner = document.createElement('span');
    editor.append(inner);
    document.body.append(editor);

    expect(isEditableTarget(caption)).toBe(true);
    expect(isEditableTarget(inner)).toBe(true);
    expect(isEditableTarget(chip)).toBe(false);
  });

  it('is true only for inputs that type text, not a checkbox or a button input', () => {
    const input = (type: string) => {
      const el = document.createElement('input');
      el.type = type;
      return el;
    };

    for (const type of ['text', 'search', 'number', 'date', 'time']) {
      expect(isEditableTarget(input(type))).toBe(true);
    }
    for (const type of ['checkbox', 'radio', 'range', 'button', 'submit']) {
      expect(isEditableTarget(input(type))).toBe(false);
    }
  });

  it('is false for a non-element target', () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(window)).toBe(false);
  });
});
