import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';

// Pins the keyboard contract lifted verbatim out of StudioCanvas: modal scope stands
// every key down, editable targets are never hijacked, and Delete snapshots before it
// deletes. Two orderings are load-bearing and asserted rather than assumed — Meta+V
// pastes instead of switching to select mode, and takeSnapshot runs before
// deleteElements so the delete is undoable.

const callOrder: string[] = [];

const takeSnapshot = mock(() => {
  callOrder.push('takeSnapshot');
});
const deleteElements = mock((_payload: unknown) => {
  callOrder.push('deleteElements');
});
const undo = mock(() => {});
const redo = mock(() => {});
const setInteractionMode = mock((_mode: string) => {});
const copySelectedNodes = mock(() => {});
const cutSelectedNodes = mock(() => {});
const pasteNodes = mock(() => {});

type StoreShape = {
  nodes: { id: string; position: { x: number; y: number }; data: unknown; selected?: boolean }[];
  edges: { id: string; source: string; target: string; selected?: boolean }[];
  keyboardScope: string;
  takeSnapshot: typeof takeSnapshot;
  undo: typeof undo;
  redo: typeof redo;
  setInteractionMode: typeof setInteractionMode;
  copySelectedNodes: typeof copySelectedNodes;
  cutSelectedNodes: typeof cutSelectedNodes;
  pasteNodes: typeof pasteNodes;
};

const store: StoreShape = {
  nodes: [],
  edges: [],
  keyboardScope: 'canvas',
  takeSnapshot,
  undo,
  redo,
  setInteractionMode,
  copySelectedNodes,
  cutSelectedNodes,
  pasteNodes,
};

const useStudioStoreMock = () => store;
useStudioStoreMock.getState = () => store;

mock.module('@xyflow/react', () => ({
  useReactFlow: () => ({ deleteElements }),
}));
mock.module('../stores/useStudioStore', () => ({
  useStudioStore: useStudioStoreMock,
}));

const { useCanvasKeyboardShortcuts } = await import('./useCanvasKeyboardShortcuts');

const node = (id: string, selected: boolean) => ({
  id,
  position: { x: 0, y: 0 },
  data: {},
  selected,
});
const edge = (id: string, selected: boolean) => ({
  id,
  source: 'a',
  target: 'b',
  selected,
});

const press = (init: KeyboardEventInit, target?: HTMLElement) => {
  act(() => {
    const event = new KeyboardEvent('keydown', { bubbles: true, ...init });
    (target ?? window).dispatchEvent(event);
  });
};

const appendTarget = (tagName: string, contentEditable = false) => {
  const element = document.createElement(tagName);
  if (contentEditable) element.contentEditable = 'true';
  document.body.append(element);
  return element;
};

const noCallsAtAll = () => {
  expect(undo).not.toHaveBeenCalled();
  expect(redo).not.toHaveBeenCalled();
  expect(copySelectedNodes).not.toHaveBeenCalled();
  expect(cutSelectedNodes).not.toHaveBeenCalled();
  expect(pasteNodes).not.toHaveBeenCalled();
  expect(setInteractionMode).not.toHaveBeenCalled();
  expect(takeSnapshot).not.toHaveBeenCalled();
  expect(deleteElements).not.toHaveBeenCalled();
};

describe('useCanvasKeyboardShortcuts', () => {
  beforeEach(() => {
    callOrder.length = 0;
    for (const spy of [
      takeSnapshot,
      deleteElements,
      undo,
      redo,
      setInteractionMode,
      copySelectedNodes,
      cutSelectedNodes,
      pasteNodes,
    ]) {
      spy.mockClear();
    }
    store.nodes = [];
    store.edges = [];
    store.keyboardScope = 'canvas';
    document.body.innerHTML = '';
  });

  afterEach(cleanup);

  describe('modal scope stands every handled key down', () => {
    it('turns undo, clipboard, the mode letters and Delete into no-ops', () => {
      store.keyboardScope = 'modal';
      store.nodes = [node('n1', true)];
      store.edges = [edge('e1', true)];

      renderHook(() => useCanvasKeyboardShortcuts());

      press({ key: 'z', metaKey: true });
      press({ key: 'z', metaKey: true, shiftKey: true });
      press({ key: 'y', metaKey: true });
      press({ key: 'c', metaKey: true });
      press({ key: 'x', metaKey: true });
      press({ key: 'v', metaKey: true });
      press({ key: 'h' });
      press({ key: 'v' });
      press({ key: 'Delete' });
      press({ key: 'Backspace' });

      noCallsAtAll();
    });
  });

  describe('editable targets are never hijacked', () => {
    it.each([
      ['INPUT', 'input'] as const,
      ['TEXTAREA', 'textarea'] as const,
    ])('ignores keys typed inside a %s', (_label, tagName) => {
      store.nodes = [node('n1', true)];
      renderHook(() => useCanvasKeyboardShortcuts());
      const target = appendTarget(tagName);

      press({ key: 'z', metaKey: true }, target);
      press({ key: 'v', metaKey: true }, target);
      press({ key: 'h' }, target);
      press({ key: 'Delete' }, target);

      noCallsAtAll();
    });

    it('ignores keys typed inside a contentEditable element', () => {
      store.nodes = [node('n1', true)];
      renderHook(() => useCanvasKeyboardShortcuts());
      const target = appendTarget('div', true);
      expect(target.isContentEditable).toBe(true);

      press({ key: 'z', metaKey: true }, target);
      press({ key: 'h' }, target);
      press({ key: 'Backspace' }, target);

      noCallsAtAll();
    });
  });

  describe('undo and redo', () => {
    it('runs undo for Meta+Z and for Ctrl+Z', () => {
      renderHook(() => useCanvasKeyboardShortcuts());

      press({ key: 'z', metaKey: true });
      expect(undo).toHaveBeenCalledTimes(1);

      press({ key: 'z', ctrlKey: true });
      expect(undo).toHaveBeenCalledTimes(2);
      expect(redo).not.toHaveBeenCalled();
    });

    it('runs redo for Meta+Shift+Z and for Meta+Y', () => {
      renderHook(() => useCanvasKeyboardShortcuts());

      press({ key: 'z', metaKey: true, shiftKey: true });
      expect(redo).toHaveBeenCalledTimes(1);

      press({ key: 'y', metaKey: true });
      expect(redo).toHaveBeenCalledTimes(2);
      expect(undo).not.toHaveBeenCalled();
    });

    it('does nothing for the uppercase Z a real browser sends with Shift held', () => {
      // Pinned, not endorsed: the branch tests `event.key === 'z'`, and a real
      // Cmd+Shift+Z reports key 'Z'. Redo-by-Shift+Z is therefore dead on hardware;
      // Meta+Y is the only redo that survives.
      renderHook(() => useCanvasKeyboardShortcuts());

      press({ key: 'Z', metaKey: true, shiftKey: true });

      expect(redo).not.toHaveBeenCalled();
      expect(undo).not.toHaveBeenCalled();
    });
  });

  describe('clipboard', () => {
    it('copies, cuts and pastes through the store', () => {
      renderHook(() => useCanvasKeyboardShortcuts());

      press({ key: 'c', metaKey: true });
      press({ key: 'x', metaKey: true });
      press({ key: 'v', metaKey: true });

      expect(copySelectedNodes).toHaveBeenCalledTimes(1);
      expect(cutSelectedNodes).toHaveBeenCalledTimes(1);
      expect(pasteNodes).toHaveBeenCalledTimes(1);
    });

    it('accepts Ctrl as well as Meta for clipboard keys', () => {
      renderHook(() => useCanvasKeyboardShortcuts());

      press({ key: 'c', ctrlKey: true });
      press({ key: 'x', ctrlKey: true });
      press({ key: 'v', ctrlKey: true });

      expect(copySelectedNodes).toHaveBeenCalledTimes(1);
      expect(cutSelectedNodes).toHaveBeenCalledTimes(1);
      expect(pasteNodes).toHaveBeenCalledTimes(1);
    });
  });

  describe('interaction mode letters', () => {
    it('maps h to pan and v to select, case-insensitively', () => {
      renderHook(() => useCanvasKeyboardShortcuts());

      press({ key: 'h' });
      press({ key: 'H' });
      press({ key: 'v' });
      press({ key: 'V' });

      expect(setInteractionMode.mock.calls).toEqual([['pan'], ['pan'], ['select'], ['select']]);
    });

    it('pastes on Meta+V instead of switching to select mode', () => {
      // Ordering trap: the Meta+V branch returns before the bare-v branch.
      renderHook(() => useCanvasKeyboardShortcuts());

      press({ key: 'v', metaKey: true });

      expect(pasteNodes).toHaveBeenCalledTimes(1);
      expect(setInteractionMode).not.toHaveBeenCalled();
    });
  });

  describe('deletion', () => {
    it.each([
      ['Delete'] as const,
      ['Backspace'] as const,
    ])('snapshots before deleting the selected nodes and edges on %s', (key) => {
      store.nodes = [node('kept', false), node('doomed', true)];
      store.edges = [edge('kept-edge', false), edge('doomed-edge', true)];
      renderHook(() => useCanvasKeyboardShortcuts());

      press({ key });

      expect(callOrder).toEqual(['takeSnapshot', 'deleteElements']);
      expect(deleteElements).toHaveBeenCalledWith({
        nodes: [store.nodes[1]],
        edges: [store.edges[1]],
      });
    });

    it('deletes an edge-only selection', () => {
      store.nodes = [node('kept', false)];
      store.edges = [edge('doomed-edge', true)];
      renderHook(() => useCanvasKeyboardShortcuts());

      press({ key: 'Delete' });

      expect(callOrder).toEqual(['takeSnapshot', 'deleteElements']);
      expect(deleteElements).toHaveBeenCalledWith({ nodes: [], edges: [store.edges[0]] });
    });

    it('does not snapshot or delete when nothing is selected', () => {
      store.nodes = [node('kept', false)];
      store.edges = [edge('kept-edge', false)];
      renderHook(() => useCanvasKeyboardShortcuts());

      press({ key: 'Delete' });
      press({ key: 'Backspace' });

      expect(takeSnapshot).not.toHaveBeenCalled();
      expect(deleteElements).not.toHaveBeenCalled();
    });
  });

  describe('teardown', () => {
    it('removes the listener on unmount', () => {
      store.nodes = [node('doomed', true)];
      const { unmount } = renderHook(() => useCanvasKeyboardShortcuts());

      unmount();

      press({ key: 'z', metaKey: true });
      press({ key: 'h' });
      press({ key: 'Delete' });

      noCallsAtAll();
    });
  });
});
