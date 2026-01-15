"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
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
    </div>
  );
}
