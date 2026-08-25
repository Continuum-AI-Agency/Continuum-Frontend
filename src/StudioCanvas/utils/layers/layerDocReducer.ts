import type { LayerEditorLayer } from '../../types';
import type { Frame } from './frameModel';

/**
 * Undo/redo for one layer document.
 *
 * A pure reducer, deliberately free of React, so the end-to-end bench can drive the
 * REAL history in a browser tab without mounting a component — an undo model proved
 * through a mock would prove nothing about the product.
 *
 * The `{ present, past, future }` shape and the 50-entry cap are the canvas store's
 * (`stores/useStudioStore.ts`), so the dialog's history behaves like the canvas's.
 */

export interface LayerDoc {
  frame: Frame;
  layers: LayerEditorLayer[];
}

export interface LayerHistory {
  present: LayerDoc;
  past: LayerDoc[];
  future: LayerDoc[];
}

/** Deep enough to matter: 50 steps back, matching the canvas. */
export const HISTORY_LIMIT = 50;

export type LayerDocAction =
  /** One undoable edit — add, delete, reorder, align, nudge, opacity, frame. */
  | { type: 'commit'; doc: LayerDoc }
  /** Pointer-down: bank the pre-drag document, then stream `preview` frames. */
  | { type: 'begin' }
  /** Pointer-move: replace `present` only. Never grows `past`. */
  | { type: 'preview'; doc: LayerDoc }
  | { type: 'undo' }
  | { type: 'redo' }
  /** Dialog open, or the node's data changed underneath us. Clears the history. */
  | { type: 'reset'; doc: LayerDoc };

export function initialHistory(doc: LayerDoc): LayerHistory {
  return { present: doc, past: [], future: [] };
}

/**
 * `begin` + N `preview`s + nothing on pointer-up is ONE history entry.
 *
 * Without that split a 300-frame drag would push 300 documents and a single Cmd+Z
 * would move the layer one mouse-sample backwards — the classic "undo does nothing"
 * bug. `begin` banks the state the drag started from; the previews only ever replace
 * `present`.
 */
export function layerDocReducer(state: LayerHistory, action: LayerDocAction): LayerHistory {
  switch (action.type) {
    case 'commit':
      return {
        present: action.doc,
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: [],
      };
    case 'begin':
      return {
        present: state.present,
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: [],
      };
    case 'preview':
      return { ...state, present: action.doc };
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        present: previous,
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future],
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        present: next,
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: rest,
      };
    }
    case 'reset':
      return initialHistory(action.doc);
  }
}

export const canUndo = (state: LayerHistory): boolean => state.past.length > 0;
export const canRedo = (state: LayerHistory): boolean => state.future.length > 0;
