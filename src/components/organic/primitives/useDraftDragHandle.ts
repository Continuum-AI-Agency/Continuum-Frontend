'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type * as React from 'react';

// One activation contract for every draggable draft. The week card and the month chip
// used to be independent: only the week grid was draggable at all, and its `isDragging`
// was spent on opacity and never handed to the card, so the card's own click handler
// still fired at the end of a drag. Both surfaces now read the same handle, so a drag
// that starts in either place behaves identically and can suppress the click.

// Sourced from the primitive rather than re-declared: `SyntheticListenerMap` is not part
// of @dnd-kit/core's public entry, and a deep `dist/` import would break on any upgrade.
type DraggableResult = ReturnType<typeof useDraggable>;

export type DraftDragHandle = {
  setNodeRef: DraggableResult['setNodeRef'];
  listeners: DraggableResult['listeners'];
  attributes: DraggableResult['attributes'];
  /** True from activation until drop. Surfaces MUST early-return from click while set. */
  isDragging: boolean;
  /** Translate + lift, ready to spread onto the dragged element's `style`. */
  style: React.CSSProperties;
};

export function useDraftDragHandle(draftId: string): DraftDragHandle {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draftId,
    data: { type: 'draft' },
  });

  return {
    setNodeRef,
    listeners,
    attributes,
    isDragging,
    style: {
      transform: CSS.Translate.toString(transform),
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 50 : 'auto',
    },
  };
}
