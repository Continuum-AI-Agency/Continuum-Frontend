import { useEffect, useRef } from 'react';
import type { LayerMove } from '../../utils/layers/layerOps';

/**
 * In-editor keyboard map for the Layer Editor dialog.
 *
 * The canvas-level handlers stand down while a dialog is open, so this owns the keys:
 * arrows nudge, shift+arrows nudge coarse, Cmd/Ctrl+Z undoes, Cmd/Ctrl+] and [ reorder,
 * Delete removes the selected layers (NOT the canvas node), Escape deselects.
 *
 * Latest props are read through a ref, so the window listener is registered once per
 * open rather than re-binding on every pointer sample during a drag.
 */

export const NUDGE_STEP_PX = 1;
export const NUDGE_COARSE_STEP_PX = 10;

export interface LayerEditorKeymapParams {
  enabled: boolean;
  /**
   * `repeat` is true while a held arrow key auto-repeats.
   *
   * The caller uses it to keep one held press to ONE history entry: without it, two
   * seconds of key-repeat pushed ~60 documents and evicted the whole 50-entry history,
   * so Cmd+Z afterwards could not reach anything the user had done before nudging.
   */
  onNudge: (dx: number, dy: number, repeat: boolean) => void;
  onDuplicate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOrder: (move: LayerMove) => void;
  onDeleteSelected: () => void;
  onDeselect: () => void;
  onSelectAll: () => void;
}

type HistoryKey = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

/** Shared with the Video Editor's rule so the two dialogs answer to the same chords. */
export function resolveLayerHistoryShortcut(event: HistoryKey): 'undo' | 'redo' | null {
  if (event.altKey || (!event.metaKey && !event.ctrlKey)) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return null;
}

/** Cmd/Ctrl+] brings forward, Cmd/Ctrl+[ sends backward. Shift goes the whole way. */
export function resolveLayerOrderShortcut(event: HistoryKey): LayerMove | null {
  if (event.altKey || (!event.metaKey && !event.ctrlKey)) return null;
  if (event.key === ']') return event.shiftKey ? 'top' : 'up';
  if (event.key === '[') return event.shiftKey ? 'bottom' : 'down';
  return null;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Is the key already spoken for by the control that has focus?
 *
 * Base UI's Slider thumb is a `role="slider"` div rather than an `<input>`, so a tag
 * check alone misses it: ArrowLeft on a focused opacity slider used to nudge the LAYER
 * instead of the value, and `preventDefault` meant the slider never saw the key at all.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return true;
  return target.closest('[role="slider"]') !== null;
}

export function useLayerEditorKeymap(params: LayerEditorKeymapParams): void {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const { enabled } = params;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const current = paramsRef.current;
      // Renaming a layer types square brackets and arrow keys like any other text.
      if (isTextEntryTarget(event.target)) return;

      const history = resolveLayerHistoryShortcut(event);
      if (history) {
        event.preventDefault();
        if (history === 'undo') current.onUndo();
        else current.onRedo();
        return;
      }

      const order = resolveLayerOrderShortcut(event);
      if (order) {
        event.preventDefault();
        current.onOrder(order);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        current.onSelectAll();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        current.onDuplicate();
        return;
      }

      const arrow = ARROWS[event.key];
      if (arrow) {
        event.preventDefault();
        const step = event.shiftKey ? NUDGE_COARSE_STEP_PX : NUDGE_STEP_PX;
        current.onNudge(arrow[0] * step, arrow[1] * step, event.repeat);
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        current.onDeleteSelected();
        return;
      }

      // Escape is a three-step ladder — cancel a live drag, else clear the selection,
      // else close. This listener is on `window` in the bubble phase, which is the LAST
      // thing to see the key, so it cannot decide whether the dialog closes. The two
      // steps that have to win are owned where they can be: LayerStage cancels a drag on
      // a capture listener, and LayerEditorDialog refuses the close through Base UI's
      // own `escape-key` reason. This is only the deselect, and it is idempotent.
      if (event.key === 'Escape') {
        current.onDeselect();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
