import * as React from "react"
import { DragEndEvent, DragStartEvent } from "@dnd-kit/core"

import { useCalendarStore } from "@/lib/organic/store"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import {
  ORGANIC_BETA_LAUNCH_SCHEDULE,
} from "../primitives/organic-calendar-config"
import {
  formatTimeLabel,
  parseTimeLabelToHour,
} from "../primitives/calendar-utils"
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicPlatformTag,
  OrganicSeedDragPayload,
} from "../primitives/types"

function isSchedulablePlatformTag(value: string | undefined): value is OrganicPlatformTag {
  return value === "instagram" || value === "facebook" || value === "linkedin"
}

function parsePlannerCellId(id: string): { dayId: string; platform?: OrganicPlatformTag } | null {
  if (!id.startsWith("planner-cell::")) return null
  const [, dayId, platformRaw] = id.split("::")
  if (!dayId) return null

  return {
    dayId,
    platform: isSchedulablePlatformTag(platformRaw) ? platformRaw : undefined,
  }
}

function buildSeededDraft({
  day,
  time,
  data,
  platform,
  platformAccountIds,
}: {
  day: OrganicCalendarDay | null
  time: string
  data: OrganicSeedDragPayload
  platform: OrganicPlatformTag
  platformAccountIds: Partial<Record<OrganicPlatformKey, string>>
}): OrganicCalendarDraft {
  const trendTitle = data.title || "Selected topic"
  const trendId = data.trendId

  return {
    id: `seeded-${Date.now()}`,
    title: trendTitle,
    summary: `Queued for generation from "${trendTitle}".`,
    timeLabel: formatTimeLabel(time),
    dateLabel: day ? `${day.label}, ${day.dateLabel}` : "Unscheduled",
    status: "placeholder",
    platforms: [platform],
    format: "Post",
    objective: "Generation Seed",
    captionPreview: "Click Generate to construct this post.",
    tags: [],
    mediaCount: 1,
    seedTrendId: trendId,
    targetAccountId: platformAccountIds[platform],
  }
}

export function useCalendarDnD(
  days: OrganicCalendarDay[],
  drafts: OrganicCalendarDraft[],
  platformAccountIds: Partial<Record<OrganicPlatformKey, string>>
) {
  const { moveDraft, addDraft, updateDraft } = useCalendarStore()
  const [activeDragDraft, setActiveDragDraft] = React.useState<OrganicCalendarDraft | null>(null)

  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      const draftId = event.active.id as string
      const draft = drafts.find((item) => item.id === draftId)
      if (draft) setActiveDragDraft(draft)
    },
    [drafts]
  )

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      setActiveDragDraft(null)
      const { active, over } = event
      if (!over) return

      const draftId = active.id as string
      const overId = String(over.id)
      const activeData = active.data.current as
        | { type?: string; trendId?: string; title?: string }
        | null

      if (overId === "unscheduled-pool") {
        if (activeData?.type === "draft") {
          moveDraft(draftId, "unscheduled")
        }
        return
      }

      if (activeData?.type === "draft") {
        const plannerCell = parsePlannerCellId(overId)

        if (plannerCell) {
          const targetDay = days.find((day) => day.id === plannerCell.dayId)

          updateDraft(draftId, (draft) => ({
            ...draft,
            dateLabel: targetDay ? `${targetDay.label}, ${targetDay.dateLabel}` : draft.dateLabel,
            platforms: plannerCell.platform ? [plannerCell.platform] : draft.platforms,
            targetAccountId:
              plannerCell.platform && platformAccountIds[plannerCell.platform]
                ? platformAccountIds[plannerCell.platform]
                : draft.targetAccountId,
          }))

          moveDraft(draftId, plannerCell.dayId)
          return
        }

        const targetDay = days.find((day) => day.id === overId)
        if (targetDay) {
          updateDraft(draftId, (draft) => ({
            ...draft,
            dateLabel: `${targetDay.label}, ${targetDay.dateLabel}`,
          }))
          moveDraft(draftId, targetDay.id)
        }
      }
    },
    [days, moveDraft, platformAccountIds, updateDraft]
  )

  const handleNativeDrop = React.useCallback(
    async (
      dayId: string,
      time: string,
      data: OrganicSeedDragPayload,
      platformKey?: OrganicPlatformTag
    ) => {
      if (data.type !== "trend" && data.type !== "question" && data.type !== "event") {
        return
      }

      const trendId = data.trendId
      if (!trendId) return

      const targetDay = days.find((day) => day.id === dayId)
      if (!targetDay) return

      const fallbackPlatform = (ORGANIC_BETA_LAUNCH_SCHEDULE[
        targetDay.label as keyof typeof ORGANIC_BETA_LAUNCH_SCHEDULE
      ] ?? "instagram") as OrganicPlatformTag

      const platform = platformKey ?? fallbackPlatform

      let finalTime = time
      if (targetDay.slots.length > 0) {
        const sortedSlots = [...targetDay.slots].sort((a, b) => {
          const hoursA = parseTimeLabelToHour(a.timeLabel) ?? 0
          const hoursB = parseTimeLabelToHour(b.timeLabel) ?? 0
          return hoursA - hoursB
        })

        const lastSlot = sortedSlots[sortedSlots.length - 1]
        if (lastSlot) {
          const lastHour = parseTimeLabelToHour(lastSlot.timeLabel) ?? 9
          const nextHour = (lastHour + 2) % 24
          finalTime = `${nextHour.toString().padStart(2, "0")}:00`
        }
      }

      const seededDraft = buildSeededDraft({
        day: targetDay,
        time: finalTime,
        data,
        platform,
        platformAccountIds,
      })

      addDraft(dayId, seededDraft)
    },
    [addDraft, days, platformAccountIds]
  )

  return {
    activeDragDraft,
    handleDragStart,
    handleDragEnd,
    handleNativeDrop,
  }
}
