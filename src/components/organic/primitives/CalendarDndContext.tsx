'use client';

import {
  type Announcements,
  type CollisionDetection,
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useCalendarStore } from '@/lib/organic/store';
import {
  crossPlatformDropRefusal,
  parsePlannerCellId,
  plannerCellKeyboardCoordinates,
  plannerCellLabel,
} from '../hooks/useCalendarDnD';
import type { OrganicCalendarDraft } from './types';

// Module constants, not literals: useSensor memoises on the options object, and a fresh
// object per render rebuilt the sensors, then dnd-kit's internal context, which re-rendered
// every draggable chip and droppable cell on each workspace render (each selection).
const POINTER_SENSOR_OPTIONS = { activationConstraint: { distance: 8 } };

// Space alone picks a draft up. The sensor listens on the chip's drag wrapper, so with Enter
// in `start` it preventDefault-ed the keydown and Enter never reached the chip's click: the
// keyboard could not open a preview.
const KEYBOARD_SENSOR_OPTIONS = {
  coordinateGetter: plannerCellKeyboardCoordinates,
  keyboardCodes: {
    start: [KeyboardCode.Space],
    cancel: [KeyboardCode.Esc],
    end: [KeyboardCode.Space, KeyboardCode.Enter, KeyboardCode.Tab],
  },
};

// The cell under the pointer wins. closestCorners measures the drag overlay, a full-size card
// pinned to where a small dock row was grabbed, so it hung below the pointer and dropped onto
// the next platform row down. A keyboard drag has no pointer: the cell holding the dragged
// rect's centre is the target, where the arrow keys put it, and a dock row still sitting in
// the dock is over nothing.
const pointerFirstCollision: CollisionDetection = (args) => {
  const { pointerCoordinates, collisionRect } = args;
  if (!pointerCoordinates) {
    return pointerWithin({
      ...args,
      pointerCoordinates: {
        x: collisionRect.left + collisionRect.width / 2,
        y: collisionRect.top + collisionRect.height / 2,
      },
    });
  }
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : closestCorners(args);
};

// Read at announce time, never subscribed: the context re-rendering per draft edit would
// re-render every chip and cell under it.
function findDraft(id: UniqueIdentifier): OrganicCalendarDraft | undefined {
  for (const day of useCalendarStore.getState().days) {
    const draft = day.slots.find((slot) => slot.id === id);
    if (draft) return draft;
  }
  return undefined;
}

export function CalendarDndContext({
  children,
  onDragEnd,
  onDragStart,
  dragOverlay,
}: {
  children: React.ReactNode;
  onDragEnd: (event: DragEndEvent) => void;
  onDragStart?: (event: DragStartEvent) => void;
  dragOverlay?: React.ReactNode;
}) {
  const uiText = useTranslations('organic');
  const accessibility = useMemo(() => {
    const title = (id: UniqueIdentifier) => findDraft(id)?.title || uiText('dragUntitled');
    const area = (id: UniqueIdentifier) => plannerCellLabel(id) ?? uiText('dragDropArea');
    const announcements: Announcements = {
      onDragStart: ({ active }) => uiText('dragPickedUp', { title: title(active.id) }),
      onDragOver: ({ active, over }) =>
        over
          ? uiText('dragOver', { title: title(active.id), area: area(over.id) })
          : uiText('dragNotOverDay', { title: title(active.id) }),
      onDragEnd: ({ active, over }) => {
        if (!over) return uiText('dragReturned', { title: title(active.id) });
        const draft = findDraft(active.id);
        const platform = parsePlannerCellId(String(over.id))?.platform;
        const reason = draft && platform ? crossPlatformDropRefusal(draft, platform, uiText) : null;
        return reason
          ? uiText('dragDropRefused', { title: title(active.id), reason })
          : uiText('dragDropped', { title: title(active.id), area: area(over.id) });
      },
      onDragCancel: ({ active }) => uiText('dragCancelled', { title: title(active.id) }),
    };
    return { announcements };
  }, [uiText]);
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_SENSOR_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_SENSOR_OPTIONS),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerFirstCollision}
      accessibility={accessibility}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
    >
      {children}
      <DragOverlay dropAnimation={null}>{dragOverlay}</DragOverlay>
    </DndContext>
  );
}
