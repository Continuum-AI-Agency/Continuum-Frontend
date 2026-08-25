import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import {
  NUDGE_COARSE_STEP_PX,
  NUDGE_STEP_PX,
  resolveLayerHistoryShortcut,
  resolveLayerOrderShortcut,
  useLayerEditorKeymap,
} from './useLayerEditorKeymap';

// The keymap is the only place a keystroke becomes a document edit, so each binding is
// asserted as the ACTION it dispatches, not as "a handler ran". The inertness check is
// the one that matters in the field: renaming a layer types brackets and arrows, and a
// keymap that fires through a focused input silently reorders while you are naming.

const key = (over: Partial<KeyboardEvent>) =>
  ({ metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, key: '', ...over }) as never;

describe('resolveLayerHistoryShortcut', () => {
  it('maps the undo/redo chords and ignores the bare key', () => {
    expect(resolveLayerHistoryShortcut(key({ key: 'z', metaKey: true }))).toBe('undo');
    expect(resolveLayerHistoryShortcut(key({ key: 'Z', ctrlKey: true }))).toBe('undo');
    expect(resolveLayerHistoryShortcut(key({ key: 'z', metaKey: true, shiftKey: true }))).toBe(
      'redo',
    );
    expect(resolveLayerHistoryShortcut(key({ key: 'y', ctrlKey: true }))).toBe('redo');
    expect(resolveLayerHistoryShortcut(key({ key: 'z' }))).toBeNull();
    // Alt+Cmd+Z is a different chord on macOS; claiming it would steal it.
    expect(resolveLayerHistoryShortcut(key({ key: 'z', metaKey: true, altKey: true }))).toBeNull();
  });
});

describe('resolveLayerOrderShortcut', () => {
  it('maps bracket chords to one step, shift to the whole way', () => {
    expect(resolveLayerOrderShortcut(key({ key: ']', metaKey: true }))).toBe('up');
    expect(resolveLayerOrderShortcut(key({ key: '[', metaKey: true }))).toBe('down');
    expect(resolveLayerOrderShortcut(key({ key: ']', ctrlKey: true, shiftKey: true }))).toBe('top');
    expect(resolveLayerOrderShortcut(key({ key: '[', ctrlKey: true, shiftKey: true }))).toBe(
      'bottom',
    );
    expect(resolveLayerOrderShortcut(key({ key: ']' }))).toBeNull();
  });
});

interface Dispatched {
  nudges: [number, number][];
  orders: string[];
  undos: number;
  redos: number;
  deletes: number;
  deselects: number;
  selectAlls: number;
}

function mount(enabled = true) {
  const log: Dispatched = {
    nudges: [],
    orders: [],
    undos: 0,
    redos: 0,
    deletes: 0,
    deselects: 0,
    selectAlls: 0,
  };

  function Harness() {
    useLayerEditorKeymap({
      enabled,
      onNudge: (dx, dy) => log.nudges.push([dx, dy]),
      onUndo: () => {
        log.undos += 1;
      },
      onRedo: () => {
        log.redos += 1;
      },
      onOrder: (move) => log.orders.push(move),
      onDeleteSelected: () => {
        log.deletes += 1;
      },
      onDeselect: () => {
        log.deselects += 1;
      },
      onSelectAll: () => {
        log.selectAlls += 1;
      },
    });
    return createElement('input', { 'data-testid': 'rename' });
  }

  const view = render(createElement(Harness));
  return { log, view };
}

const press = (init: KeyboardEventInit & { key: string }, target?: EventTarget) => {
  const event = new window.KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
  (target ?? window).dispatchEvent(event);
  return event;
};

describe('useLayerEditorKeymap', () => {
  afterEach(cleanup);

  it('nudges 1px, and 10px with shift', () => {
    const { log } = mount();

    press({ key: 'ArrowRight' });
    press({ key: 'ArrowUp', shiftKey: true });

    expect(log.nudges).toEqual([
      [NUDGE_STEP_PX, 0],
      [0, -NUDGE_COARSE_STEP_PX],
    ]);
  });

  it('dispatches undo, redo, ordering, select-all, delete and deselect', () => {
    const { log } = mount();

    press({ key: 'z', metaKey: true });
    press({ key: 'z', metaKey: true, shiftKey: true });
    press({ key: ']', metaKey: true });
    press({ key: '[', metaKey: true, shiftKey: true });
    press({ key: 'a', metaKey: true });
    press({ key: 'Delete' });
    press({ key: 'Escape' });

    expect(log.undos).toBe(1);
    expect(log.redos).toBe(1);
    expect(log.orders).toEqual(['up', 'bottom']);
    expect(log.selectAlls).toBe(1);
    expect(log.deletes).toBe(1);
    expect(log.deselects).toBe(1);
  });

  it('preventDefault()s the chords it claims, so the browser does not also act', () => {
    mount();
    expect(press({ key: 'z', metaKey: true }).defaultPrevented).toBe(true);
    expect(press({ key: 'ArrowLeft' }).defaultPrevented).toBe(true);
  });

  it('stands down entirely while a text field has focus', () => {
    const { log, view } = mount();
    const input = view.getByTestId('rename');

    press({ key: ']', metaKey: true }, input);
    press({ key: 'ArrowLeft' }, input);
    press({ key: 'Backspace' }, input);

    expect(log.orders).toEqual([]);
    expect(log.nudges).toEqual([]);
    expect(log.deletes).toBe(0);
  });

  it('binds nothing while the dialog is closed', () => {
    const { log } = mount(false);

    press({ key: 'ArrowRight' });
    press({ key: 'z', metaKey: true });

    expect(log.nudges).toEqual([]);
    expect(log.undos).toBe(0);
  });
});
