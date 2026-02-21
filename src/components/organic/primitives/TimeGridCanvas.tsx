"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DraggableDraftCard } from "./DraggableDraftCard";
import { useCalendarStore } from "@/lib/organic/store";
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicSeedDragPayload,
} from "./types";
import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence } from "framer-motion";
import { parseTimeLabelToMinutes } from "./calendar-utils";

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
      const timeA = parseTimeLabelToMinutes(a.timeLabel) ?? 0;
      const timeB = parseTimeLabelToMinutes(b.timeLabel) ?? 0;
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
        "flex min-w-[250px] flex-1 flex-col border-r border-slate-800 last:border-r-0 transition-colors",
        isOver && "bg-sky-500/10"
      )}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/json")) {
          e.preventDefault();
        }
      }}
      onDrop={handleNativeDrop}
    >
      <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 p-3 text-center backdrop-blur">
        <div className="text-sm font-semibold text-slate-100">{day.label}</div>
        <div className="font-mono text-[11px] text-slate-400">{day.dateLabel}</div>
      </div>
      
      <ScrollArea className="flex-1 bg-slate-950/40 p-2">
        <div className="space-y-3">
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
          <div key={`ghost-${i}`} className="h-24 w-full animate-pulse rounded border border-dashed border-slate-700 bg-slate-900/60 px-3 py-4">
            <div className="flex justify-between mb-2">
               <div className="h-3 w-1/4 rounded bg-slate-700" />
               <div className="h-3 w-1/6 rounded bg-slate-700" />
            </div>
            <div className="mb-2 h-4 w-3/4 rounded bg-slate-700" />
            <div className="h-3 w-1/2 rounded bg-slate-700" />
          </div>
        ))}
        
        {drafts.length === 0 && ghosts === 0 && (
          <div className="flex h-24 items-center justify-center rounded border border-dashed border-slate-700 opacity-75">
            <span className="font-mono text-[11px] text-slate-400">Drop items here</span>
          </div>
        )}
        </div>
      </ScrollArea>
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
  return (
    <GlassPanel className="flex h-full flex-col overflow-hidden border border-slate-800/80 bg-slate-950/60 p-0">
      <ScrollArea className="flex-1">
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
      </ScrollArea>
    </GlassPanel>
  );
}
