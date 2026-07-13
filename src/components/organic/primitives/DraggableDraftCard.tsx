'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { motion, useReducedMotion } from 'motion/react';
import * as React from 'react';
import { CalendarDraftCard } from './CalendarDraftCard';
import type { OrganicCalendarDraft } from './types';

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
  onPreview,
}: DraggableDraftCardProps) {
  const reduceMotion = useReducedMotion();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draft.id,
    data: { type: 'draft' },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <motion.div
      ref={setNodeRef}
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
        onMouseEnter={() => onPreview?.(draft)}
        onMouseLeave={() => onPreview?.(null)}
      />
    </motion.div>
  );
}

export const DraggableDraftCard = React.memo(DraggableDraftCardComponent);
