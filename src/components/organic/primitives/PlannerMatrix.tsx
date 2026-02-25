import * as React from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
  OrganicCalendarDay,
  OrganicSeedDragPayload,
  OrganicPlatformTag,
} from "./types"
import type { PlannerPlatform } from "./planner-platforms"
import { PlannerCell } from "./PlannerCell"

type PlannerMatrixProps = {
  days: OrganicCalendarDay[]
  platforms: PlannerPlatform[]
  selectedDraftId: string | null
  selectedDraftIds: string[]
  todayId: string
  onSelectDraft: (id: string) => void
  onToggleSelection: (id: string) => void
  onRegenerate: (draftId: string) => void
  onNativeDrop?: (
    dayId: string,
    time: string,
    data: OrganicSeedDragPayload,
    platformKey?: OrganicPlatformTag
  ) => void
  onCreatePost: (options: {
    dayId: string
    platformKey: PlannerPlatform["key"]
    status?: "draft" | "scheduled" | "placeholder"
  }) => void
}

function DayHeader({
  label,
  dateLabel,
  isToday,
}: {
  label: string
  dateLabel: string
  isToday: boolean
}) {
  const dayNumber = dateLabel.split(" ").at(-1) ?? dateLabel

  return (
    <div className="sticky top-0 z-20 border-r border-b border-border/50 bg-background/95 px-1.5 py-1.5 text-center backdrop-blur last:border-r-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {isToday ? (
        <span className="mt-1 inline-flex size-6 items-center justify-center rounded-full bg-orange-500 text-xs font-semibold text-white">
          {dayNumber}
        </span>
      ) : (
        <p className="mt-1 text-sm font-semibold text-foreground">{dayNumber}</p>
      )}
    </div>
  )
}

export function PlannerMatrix({
  days,
  platforms,
  selectedDraftId,
  selectedDraftIds,
  todayId,
  onSelectDraft,
  onToggleSelection,
  onRegenerate,
  onNativeDrop,
  onCreatePost,
}: PlannerMatrixProps) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg ring-1 ring-border/45 bg-background/90">
      <div className="min-w-[880px]">
        <div className="grid grid-cols-[96px_repeat(7,minmax(110px,1fr))]">
          <div className="sticky top-0 left-0 z-30 flex items-center justify-center border-r border-b border-border/50 bg-background/95 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
            Platform
          </div>

          {days.map((day) => (
            <DayHeader
              key={day.id}
              label={day.label}
              dateLabel={day.dateLabel}
              isToday={day.id === todayId}
            />
          ))}

          {platforms.map((platform, platformIndex) => (
            <React.Fragment key={platform.key}>
              <div
                className={cn(
                  "sticky left-0 z-10 flex flex-col items-center justify-center border-r border-b border-border/50 bg-background/95 px-1.5 backdrop-blur",
                  platform.comingSoon ? "gap-0.5 py-1.5" : "gap-1 py-3"
                )}
              >
                <Avatar
                  className={cn(
                    "border border-border bg-muted/40",
                    platform.comingSoon ? "size-5" : "size-7"
                  )}
                >
                  <AvatarFallback className="bg-muted text-foreground">
                    <platform.Icon className={cn(platform.comingSoon ? "size-3" : "size-4")} />
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "font-semibold uppercase tracking-wide text-muted-foreground",
                    platform.comingSoon ? "text-[9px]" : "text-[11px]"
                  )}
                >
                  {platform.label}
                </span>
                {platform.comingSoon ? (
                  <Badge
                    variant="outline"
                    className="h-4 border-orange-500/30 bg-orange-500/10 px-1 text-[8px] text-orange-600"
                  >
                    soon
                  </Badge>
                ) : null}
              </div>

              {days.map((day, dayIndex) => {
                if (platform.comingSoon) {
                  return (
                    <PlannerCell
                      key={`${day.id}-${platform.key}`}
                      dayId={day.id}
                      platform={platform}
                      drafts={[]}
                      selectedDraftId={selectedDraftId}
                      selectedDraftIds={selectedDraftIds}
                      showGhosts={false}
                      compact
                      isLastColumn={dayIndex === days.length - 1}
                      isLastRow={platformIndex === platforms.length - 1}
                      onSelectDraft={onSelectDraft}
                      onToggleSelection={onToggleSelection}
                      onRegenerate={onRegenerate}
                      onNativeDrop={onNativeDrop}
                      onCreatePost={onCreatePost}
                    />
                  )
                }

                const schedulablePlatformKey = platform.key as OrganicPlatformTag
                const cellDrafts = day.slots.filter((draft) => {
                  if (draft.platforms.length === 0) return schedulablePlatformKey === "instagram"
                  return draft.platforms.includes(schedulablePlatformKey)
                })

                return (
                  <PlannerCell
                    key={`${day.id}-${platform.key}`}
                    dayId={day.id}
                    platform={platform}
                    drafts={cellDrafts}
                    selectedDraftId={selectedDraftId}
                    selectedDraftIds={selectedDraftIds}
                    showGhosts={platformIndex === 0}
                    isLastColumn={dayIndex === days.length - 1}
                    isLastRow={platformIndex === platforms.length - 1}
                    onSelectDraft={onSelectDraft}
                    onToggleSelection={onToggleSelection}
                    onRegenerate={onRegenerate}
                    onNativeDrop={onNativeDrop}
                    onCreatePost={onCreatePost}
                  />
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}
