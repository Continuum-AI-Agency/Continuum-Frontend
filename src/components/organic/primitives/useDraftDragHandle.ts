'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type * as React from 'react';

// One activation contract for every draggable draft. The week card and the month chip
// used to be independent: only the week grid was draggable at all, and its `isDragging`
// was spent on opacity and never handed to the card, so the card's own click handler
// still fired at the end of a drag. Both surfaces now read the same handle, so a drag
// that starts in either place behaves identically and can suppress the click.
//
// The dragged element is a wrapper (it carries the transform) around the chip's own
// <button>. dnd-kit's `attributes` add role="button" + tabIndex=0, so spread on the wrapper
// they made every chip two tab stops: a nameless "button" and then the real one. The wrapper
// now takes only ref, style and listeners; the button is the activator and carries the
// drag semantics, so one tab stop answers Enter (open, the native click) and Space (pick up).

// Sourced from the primitive rather than re-declared: `SyntheticListenerMap` is not part
// of @dnd-kit/core's public entry, and a deep `dist/` import would break on any upgrade.
type DraggableResult = ReturnType<typeof useDraggable>;

/**
 * For the focusable control inside the dragged wrapper. No role or tabIndex (it is already a
 * button) and no `aria-pressed`: the chip's aria-pressed reports SELECTION, and dnd-kit's
 * drag-time `aria-pressed` would overwrite it. `data-dragging` is the drag signal instead.
 */
export type DraftDragActivatorAttributes = {
  'aria-roledescription': string;
  'aria-describedby': string;
  'data-dragging'?: 'true';
};

export type DraftDragHandle = {
  /** The dragged wrapper: ref, `style` and `listeners` go on it. */
  setNodeRef: DraggableResult['setNodeRef'];
  listeners: DraggableResult['listeners'];
  /**
   * dnd-kit's raw attributes (role, tabIndex, aria-*), for a surface whose dragged element IS
   * its focusable control. Never spread them on a wrapper around a button.
   */
  attributes: DraggableResult['attributes'];
  /**
   * Ref for the focusable control inside the wrapper. The keyboard sensor then starts only on
   * a Space pressed on that control, never on one bubbling up from a nested action.
   */
  setActivatorNodeRef: DraggableResult['setActivatorNodeRef'];
  activatorAttributes: DraftDragActivatorAttributes;
  /** True from activation until drop. Surfaces MUST early-return from click while set. */
  isDragging: boolean;
  /** Translate + lift, ready to spread onto the dragged element's `style`. */
  style: React.CSSProperties;
};

export function useDraftDragHandle(draftId: string): DraftDragHandle {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useDraggable({
      id: draftId,
      data: { type: 'draft' },
    });

  return {
    setNodeRef,
    listeners,
    attributes,
    setActivatorNodeRef,
    activatorAttributes: {
      'aria-roledescription': attributes['aria-roledescription'],
      'aria-describedby': attributes['aria-describedby'],
      ...(isDragging ? { 'data-dragging': 'true' } : {}),
    },
    isDragging,
    style: {
      transform: CSS.Translate.toString(transform),
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 50 : 'auto',
    },
  };
}
