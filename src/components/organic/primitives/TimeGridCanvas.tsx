"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
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
  const visibleDrafts = sortedDrafts.slice(0, 3);
  const hiddenCount = Math.max(0, sortedDrafts.length - visibleDrafts.length);

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
      data-slot="time-grid-day-column"
      ref={setNodeRef}
      className={cn(
        "flex min-w-0 flex-col border-r border-slate-600/75 last:border-r-0 transition-colors",
        isOver && "bg-sky-500/10"
      )}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/json")) {
          e.preventDefault();
        }
      }}
      onDrop={handleNativeDrop}
    >
      <div className="border-b border-slate-600/80 bg-slate-950/70 p-2 text-left">
        <div className="font-mono text-[11px] uppercase tracking-wide text-slate-800">{day.label}</div>
        <div className="text-sm font-semibold text-slate-900">{day.dateLabel}</div>
      </div>

      <div className="flex-1 space-y-2 overflow-hidden bg-slate-950/20 p-2">
        <AnimatePresence mode="popLayout" initial={false}>
          {visibleDrafts.map((draft) => (
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
          <div key={`ghost-${i}`} className="h-24 w-full animate-pulse rounded border border-dashed border-slate-600/80 bg-slate-950/50 px-3 py-4">
            <div className="flex justify-between mb-2">
               <div className="h-3 w-1/4 rounded bg-slate-700" />
               <div className="h-3 w-1/6 rounded bg-slate-700" />
            </div>
            <div className="mb-2 h-4 w-3/4 rounded bg-slate-700" />
            <div className="h-3 w-1/2 rounded bg-slate-700" />
          </div>
        ))}

        {drafts.length === 0 && ghosts === 0 ? (
          <div className="flex h-24 items-center justify-center rounded border border-dashed border-slate-600/80">
            <span className="font-mono text-[11px] text-slate-700">Drop items here</span>
          </div>
        ) : null}

        {hiddenCount > 0 ? (
          <div className="rounded border border-slate-600/80 bg-slate-100/85 px-2 py-1 text-center font-mono text-[10px] uppercase tracking-wider text-slate-700">
            +{hiddenCount} more
          </div>
        ) : null}
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
  return (
    <div className="grid h-full min-h-0 grid-cols-7 overflow-hidden rounded-xl border border-slate-600/80 bg-slate-950/40">
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
  );
}
