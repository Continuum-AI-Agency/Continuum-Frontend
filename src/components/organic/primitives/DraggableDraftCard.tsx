'use client';

import { motion, useReducedMotion } from 'motion/react';
import * as React from 'react';
import { CalendarDraftCard } from './CalendarDraftCard';
import type { OrganicCalendarDraft } from './types';
import { useDraftDragHandle } from './useDraftDragHandle';

interface DraggableDraftCardProps {
  draft: OrganicCalendarDraft;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onRegenerate?: (draftId: string) => void;
  onClearFailure?: (draftId: string) => void;
  onEnrich?: (draftId: string) => void;
  onRealize?: (draftId: string) => void;
  onStitch?: (draftId: string) => void;
  onPreview?: (draft: OrganicCalendarDraft | null) => void;
}

function DraggableDraftCardComponent({
  draft,
  isSelected,
  isMultiSelected,
  onSelect,
  onToggleSelection,
  onRegenerate,
  onClearFailure,
  onEnrich,
  onRealize,
  onStitch,
  onPreview,
}: DraggableDraftCardProps) {
  const reduceMotion = useReducedMotion();
  const { attributes, listeners, setNodeRef, isDragging, style } = useDraftDragHandle(draft.id);

  return (
    <motion.div
      ref={setNodeRef}
      className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
      layout={!reduceMotion}
      layoutId={reduceMotion ? undefined : draft.id}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? {} : { opacity: 0, scale: 0.95 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              layout: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }
      }
      style={style}
      {...listeners}
      {...attributes}
    >
      <CalendarDraftCard
        draft={draft}
        isSelected={isSelected}
        isMultiSelected={isMultiSelected}
        onSelect={onSelect}
        onToggleSelection={onToggleSelection}
        onRegenerate={onRegenerate}
        onClearFailure={onClearFailure}
        onEnrich={onEnrich}
        onRealize={onRealize}
        onStitch={onStitch}
        isDragging={isDragging}
        onMouseEnter={() => onPreview?.(draft)}
        onMouseLeave={() => onPreview?.(null)}
      />
    </motion.div>
  );
}

export const DraggableDraftCard = React.memo(DraggableDraftCardComponent);
