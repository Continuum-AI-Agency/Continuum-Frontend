"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";
import { RocketIcon } from "@radix-ui/react-icons";
import { TimeSlot } from "./TimeSlot";
import { DraggableDraftCard } from "./DraggableDraftCard";
import { useCalendarStore } from "@/lib/organic/store";
import type { OrganicCalendarDay, OrganicCalendarDraft } from "./types";

import { parseTimeLabelToHour } from "./calendar-utils";

function TimeGridDayColumn({
  day,
  drafts,
  selectedDraftId,
  selectedDraftIds,
  onSelectDraft,
  onToggleSelection,
  onRegenerate,
}: {
  day: OrganicCalendarDay;
  drafts: OrganicCalendarDraft[];
  selectedDraftId: string | null;
  selectedDraftIds: string[];
  onSelectDraft: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onRegenerate: (draftId: string) => void;
}) {
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="flex-1 min-w-[140px] border-r border-subtle last:border-r-0">
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-b border-subtle p-3 text-center">
        <div className="text-sm font-semibold text-primary">{day.label}</div>
        <div className="text-xs text-secondary">{day.dateLabel}</div>
      </div>
      <div className="relative">
        {HOURS.map((hour) => {
          const timeLabel = `${hour.toString().padStart(2, "0")}:00`;
          const draftsInHour = drafts.filter(d => {
             const h = parseTimeLabelToHour(d.timeLabel);
             return h === hour;
          });

          return (
            <TimeSlot 
              key={timeLabel} 
              date={day.id} 
              time={timeLabel}
              className="h-32 border-b border-subtle/30 p-1"
            >
              <span className="absolute top-1 left-1 text-[10px] text-secondary/50 select-none">
                {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
              </span>
              <div className="ml-8 flex flex-col gap-1 h-full">
                {draftsInHour.map(draft => (
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
              </div>
            </TimeSlot>
          );
        })}
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
  onBuild,
}: {
  days: OrganicCalendarDay[];
  selectedDraftId: string | null;
  selectedDraftIds: string[];
  onSelectDraft: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onRegenerate: (draftId: string) => void;
  onBuild: () => void;
}) {
  const hasDrafts = days.some((day) => day.slots.length > 0);

  return (
    <GlassPanel className="flex h-full flex-col p-0 overflow-hidden bg-default/20">
      {hasDrafts ? (
        <div className="flex-1 overflow-y-auto">
          <div className="flex min-h-full">
            <div className="w-16 flex-none border-r border-subtle bg-surface/50 pt-[61px]">
              {Array.from({ length: 24 }, (_, i) => (
                <div key={i} className="h-32 border-b border-subtle/30 relative">
                  <span className="absolute -top-2 right-2 text-xs text-secondary/70">
                    {i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-1">
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
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-subtle bg-default/30 text-center m-4">
          <p className="text-sm font-semibold text-primary">No drafts scheduled yet</p>
          <p className="mt-2 text-xs text-secondary">
            Build a workflow to generate the first batch of drafts.
          </p>
          <Button className="mt-4" onClick={onBuild}>
            <RocketIcon /> Build
          </Button>
        </div>
      )}
    </GlassPanel>
  );
}
