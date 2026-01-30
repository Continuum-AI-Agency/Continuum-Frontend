import * as React from "react";
import { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useCalendarStore } from "@/lib/organic/store";
import type { 
  OrganicCalendarDay, 
  OrganicCalendarDraft, 
  OrganicPlatformTag, 
  OrganicSeedDragPayload 
} from "../primitives/types";
import { 
  ORGANIC_BETA_LAUNCH_SCHEDULE 
} from "../primitives/organic-calendar-config";
import { 
  parseTimeLabelToHour, 
  formatTimeLabel 
} from "../primitives/calendar-utils";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";

export function useCalendarDnD(
  days: OrganicCalendarDay[],
  drafts: OrganicCalendarDraft[],
  platformAccountIds: Partial<Record<OrganicPlatformKey, string>>
) {
  const { moveDraft, addDraft } = useCalendarStore();
  const [activeDragDraft, setActiveDragDraft] = React.useState<OrganicCalendarDraft | null>(null);

  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      const draftId = event.active.id as string;
      const draft = drafts.find((d) => d.id === draftId);
      if (draft) setActiveDragDraft(draft);
    },
    [drafts]
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      setActiveDragDraft(null);
      const { active, over } = event;
      if (!over) return;

      const draftId = active.id as string;
      const overId = over.id as string;

      const targetDay = days.find((d) => d.id === overId);
      if (targetDay) {
        moveDraft(draftId, targetDay.id);
      }
    },
    [days, moveDraft]
  );

  const handleNativeDrop = React.useCallback(
    async (dayId: string, time: string, data: OrganicSeedDragPayload) => {
      if (data.type === "trend" || data.type === "question" || data.type === "event") {
        const trendId = data.trendId;
        const trendTitle = data.title || "Selected topic";
        if (!trendId) return;

        const targetDay = days.find((day) => day.id === dayId);
        if (!targetDay) return;

        const dayName = targetDay.label;
        const platform = (ORGANIC_BETA_LAUNCH_SCHEDULE[
          dayName as keyof typeof ORGANIC_BETA_LAUNCH_SCHEDULE
        ] ?? "instagram") as OrganicPlatformTag;
        const accountId = platformAccountIds[platform as OrganicPlatformKey];

        let finalTime = time;
        if (targetDay.slots.length > 0) {
          const sortedSlots = [...targetDay.slots].sort((a, b) => {
            const hA = parseTimeLabelToHour(a.timeLabel) ?? 0;
            const hB = parseTimeLabelToHour(b.timeLabel) ?? 0;
            return hA - hB;
          });

          const lastSlot = sortedSlots[sortedSlots.length - 1];

          if (lastSlot) {
            const lastHour = parseTimeLabelToHour(lastSlot.timeLabel) ?? 9;
            const nextHour = (lastHour + 2) % 24;
            finalTime = `${nextHour.toString().padStart(2, "0")}:00`;
          }
        }

        const seededDraft: OrganicCalendarDraft = {
          id: `seeded-${Date.now()}`,
          title: trendTitle,
          summary: `Queued for generation from "${trendTitle}".`,
          timeLabel: formatTimeLabel(finalTime),
          dateLabel: `${targetDay.label}, ${targetDay.dateLabel}`,
          status: "placeholder",
          platforms: [platform],
          format: "Post",
          objective: "Generation Seed",
          captionPreview: "Click Generate to construct this post.",
          tags:
            data.type === "question"
              ? [trendId, "question"]
              : data.type === "event"
              ? [trendId, "event"]
              : [trendId],
          mediaCount: 1,
          seedTrendId: trendId,
          targetAccountId: accountId,
        };

        addDraft(dayId, seededDraft);
      }
    },
    [days, platformAccountIds, addDraft]
  );

  return {
    activeDragDraft,
    handleDragStart,
    handleDragEnd,
    handleNativeDrop,
  };
}
