"use client"

import * as React from "react"

import { formatDayId } from "./calendar-utils"
import { PlannerHeader } from "./PlannerHeader"
import { PlannerMatrix } from "./PlannerMatrix"
import {
  buildPlannerPlatforms,
  type PlannerPlatformKey,
} from "./planner-platforms"
import type {
  OrganicCalendarDay,
  OrganicPlatformTag,
  OrganicSeedDragPayload,
} from "./types"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"

type TimeGridCanvasProps = {
  days: OrganicCalendarDay[]
  selectedDraftId: string | null
  selectedDraftIds: string[]
  activePlatforms: OrganicPlatformKey[]
  rangeTitle: string
  rangeSubtitle?: string
  viewMode: "day" | "week" | "month"
  onViewModeChange: (mode: "day" | "week" | "month") => void
  onPreviousWeek: () => void
  onNextWeek: () => void
  onCreatePost: (options?: {
    dayId?: string
    platform?: PlannerPlatformKey
    status?: "draft" | "scheduled" | "placeholder"
  }) => void
  onSelectDraft: (id: string) => void
  onToggleSelection: (id: string) => void
  onRegenerate: (draftId: string) => void
  onClearFailure?: (draftId: string) => void
  onNativeDrop?: (
    dayId: string,
    time: string,
    data: OrganicSeedDragPayload,
    platformKey?: OrganicPlatformTag
  ) => void
}

export function TimeGridCanvas({
  days,
  selectedDraftId,
  selectedDraftIds,
  activePlatforms,
  rangeTitle,
  rangeSubtitle,
  viewMode,
  onViewModeChange,
  onPreviousWeek,
  onNextWeek,
  onCreatePost,
  onSelectDraft,
  onToggleSelection,
  onRegenerate,
  onClearFailure,
  onNativeDrop,
}: TimeGridCanvasProps) {
  const plannerPlatforms = React.useMemo(
    () => buildPlannerPlatforms(activePlatforms, days),
    [activePlatforms, days]
  )

  const todayId = React.useMemo(() => formatDayId(new Date()), [])

  return (
    <section className="flex h-full min-h-0 flex-col gap-2 rounded-lg bg-card/50 p-2">
      <PlannerHeader
        title={rangeTitle}
        subtitle={rangeSubtitle}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        onPreviousWeek={onPreviousWeek}
        onNextWeek={onNextWeek}
        onCreatePost={(options) =>
          onCreatePost({
            status: options?.status,
          })
        }
      />

      <PlannerMatrix
        days={days}
        platforms={plannerPlatforms}
        selectedDraftId={selectedDraftId}
        selectedDraftIds={selectedDraftIds}
        todayId={todayId}
        onSelectDraft={onSelectDraft}
        onToggleSelection={onToggleSelection}
        onRegenerate={onRegenerate}
        onClearFailure={onClearFailure}
        onNativeDrop={onNativeDrop}
        onCreatePost={({ dayId, platformKey, status }) =>
          onCreatePost({
            dayId,
            platform: platformKey,
            status,
          })
        }
      />
    </section>
  )
}
