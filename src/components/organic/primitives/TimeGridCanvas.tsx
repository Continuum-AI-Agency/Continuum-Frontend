"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { DraggableDraftCard } from "./DraggableDraftCard";
import { useCalendarStore } from "@/lib/organic/store";
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicSeedDragPayload,
} from "./types";
import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence } from "framer-motion";
import { parseTimeLabelToHour } from "./calendar-utils";

function TimeGridDayColumn({
  day,
  drafts,
  selectedDraftId,
  selectedDraftIds,
  onSelectDraft,
  onToggleSelection,
  onRegenerate,
  onNativeDrop,
}: {
  day: OrganicCalendarDay;
  drafts: OrganicCalendarDraft[];
  selectedDraftId: string | null;
  selectedDraftIds: string[];
  onSelectDraft: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onRegenerate: (draftId: string) => void;
  onNativeDrop?: (date: string, time: string, data: OrganicSeedDragPayload) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: day.id,
    data: { type: "day-column", dayId: day.id },
  });

  const ghosts = useCalendarStore((s) => s.ghosts[day.id] || 0);

  const sortedDrafts = React.useMemo(() => {
    return [...drafts].sort((a, b) => {
      const timeA = parseTimeLabelToHour(a.timeLabel) ?? 0;
      const timeB = parseTimeLabelToHour(b.timeLabel) ?? 0;
      return timeA - timeB;
    });
  }, [drafts]);

  const handleNativeDrop = (e: React.DragEvent) => {
    const rawData = e.dataTransfer.getData("application/json");
    if (rawData && onNativeDrop) {
      try {
        const data = JSON.parse(rawData) as OrganicSeedDragPayload;
        onNativeDrop(day.id, "09:00", data);
      } catch (err) {
        console.error("Failed to parse dropped data", err);
      }
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 min-w-[200px] border-r border-subtle last:border-r-0 flex flex-col transition-colors",
        isOver && "bg-brand-primary/5"
      )}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/json")) {
          e.preventDefault();
        }
      }}
      onDrop={handleNativeDrop}
    >
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-b border-subtle p-3 text-center">
        <div className="text-sm font-semibold text-primary">{day.label}</div>
        <div className="text-xs text-secondary">{day.dateLabel}</div>
      </div>
      
      <div className="flex-1 p-2 space-y-3 overflow-y-auto">
        <AnimatePresence mode="popLayout" initial={false}>
          {sortedDrafts.map((draft) => (
            <DraggableDraftCard
              key={draft.id}
              draft={draft}
              isSelected={draft.id === selectedDraftId}
              isMultiSelected={selectedDraftIds.includes(draft.id)}
              onSelect={onSelectDraft}
              onToggleSelection={onToggleSelection}
              onRegenerate={onRegenerate}
            />
          ))}
        </AnimatePresence>
        
        {Array.from({ length: ghosts }).map((_, i) => (
          <div key={`ghost-${i}`} className="w-full rounded border border-dashed border-subtle bg-default/20 px-3 py-4 animate-pulse h-24">
            <div className="flex justify-between mb-2">
               <div className="h-3 w-1/4 bg-subtle rounded" />
               <div className="h-3 w-1/6 bg-subtle rounded" />
            </div>
            <div className="h-4 w-3/4 bg-subtle rounded mb-2" />
            <div className="h-3 w-1/2 bg-subtle rounded" />
          </div>
        ))}
        
        {drafts.length === 0 && ghosts === 0 && (
          <div className="h-24 flex items-center justify-center border border-dashed border-subtle rounded opacity-40">
            <span className="text-xs text-secondary">Drop items here</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function TimeGridCanvas({
  days,
  selectedDraftId,
  selectedDraftIds,
  onSelectDraft,
  onToggleSelection,
  onRegenerate,
  onNativeDrop,
}: {
  days: OrganicCalendarDay[];
  selectedDraftId: string | null;
  selectedDraftIds: string[];
  onSelectDraft: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onRegenerate: (draftId: string) => void;
  onNativeDrop?: (date: string, time: string, data: OrganicSeedDragPayload) => void;
}) {
  const hasDrafts = days.some((day) => day.slots.length > 0);

  return (
    <GlassPanel className="flex h-full flex-col p-0 overflow-hidden bg-default/20">
      <div className="flex-1 overflow-x-auto">
        <div className="flex min-h-full min-w-max">
          {days.map((day) => (
            <TimeGridDayColumn
              key={day.id}
              day={day}
              drafts={day.slots}
              selectedDraftId={selectedDraftId}
              selectedDraftIds={selectedDraftIds}
              onSelectDraft={onSelectDraft}
              onToggleSelection={onToggleSelection}
              onRegenerate={onRegenerate}
              onNativeDrop={onNativeDrop}
            />
          ))}
        </div>
      </div>
    </GlassPanel>
  );
}
