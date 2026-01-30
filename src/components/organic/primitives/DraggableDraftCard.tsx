"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { CalendarDraftCard } from "./CalendarDraftCard";
import type { OrganicCalendarDraft } from "./types";

interface DraggableDraftCardProps {
  draft: OrganicCalendarDraft;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onRegenerate?: (draftId: string) => void;
  onPreview?: (draft: OrganicCalendarDraft | null) => void;
}

export function DraggableDraftCard({
  draft,
  isSelected,
  isMultiSelected,
  onSelect,
  onToggleSelection,
  onRegenerate,
  onPreview,
}: DraggableDraftCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: draft.id,
      data: { type: "draft", draft },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <motion.div
      ref={setNodeRef}
      layout
      layoutId={draft.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ 
        layout: { type: "spring", stiffness: 300, damping: 30 },
        opacity: { duration: 0.2 }
      }}
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
        onMouseEnter={() => onPreview?.(draft)}
        onMouseLeave={() => onPreview?.(null)}
      />
    </motion.div>
  );
}
