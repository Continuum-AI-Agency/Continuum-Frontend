"use client"

import * as React from "react"

import { formatDayId } from "./calendar-utils"
import { PlannerHeader } from "./PlannerHeader"
import { PlannerMatrix } from "./PlannerMatrix"
import type { CreatePostMode, PlannerPlatform, PlannerPlatformKey } from "./planner-platforms"
import type {
  OrganicCalendarDay,
  OrganicPlatformTag,
  OrganicSeedDragPayload,
} from "./types"

type TimeGridCanvasProps = {
  days: OrganicCalendarDay[]
  platforms: PlannerPlatform[]
  selectedDraftId: string | null
  selectedDraftIds: string[]
  rangeTitle: string
  rangeSubtitle?: string
  viewMode: "day" | "week"
  onViewModeChange: (mode: "day" | "week") => void
  onPreviousWeek: () => void
  onNextWeek: () => void
  onCreatePost: (options?: {
    dayId?: string
    platform?: PlannerPlatformKey
    status?: "draft" | "scheduled" | "placeholder"
    mode?: CreatePostMode
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
  platforms,
  selectedDraftId,
  selectedDraftIds,
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
      />

      <PlannerMatrix
        days={days}
        platforms={platforms}
        selectedDraftId={selectedDraftId}
        selectedDraftIds={selectedDraftIds}
        todayId={todayId}
        onSelectDraft={onSelectDraft}
        onToggleSelection={onToggleSelection}
        onRegenerate={onRegenerate}
        onClearFailure={onClearFailure}
        onNativeDrop={onNativeDrop}
        onCreatePost={({ dayId, platformKey, status, mode }) =>
          onCreatePost({
            dayId,
            platform: platformKey,
            status,
            mode,
          })
        }
      />
    </section>
  )
}
