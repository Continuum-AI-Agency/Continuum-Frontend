import * as React from "react"
import { useDroppable } from "@dnd-kit/core"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import { useCalendarStore } from "@/lib/organic/store"
import type {
  OrganicSeedDragPayload,
  OrganicCalendarDraft,
  OrganicPlatformTag,
} from "./types"
import { DraggableDraftCard } from "./DraggableDraftCard"
import { parseTimeLabelToMinutes } from "./calendar-utils"
import type { PlannerPlatform } from "./planner-platforms"

type PlannerCellProps = {
  dayId: string
  platform: PlannerPlatform
  drafts: OrganicCalendarDraft[]
  selectedDraftId: string | null
  selectedDraftIds: string[]
  showGhosts: boolean
  compact?: boolean
  isLastColumn: boolean
  isLastRow: boolean
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

export function PlannerCell({
  dayId,
  platform,
  drafts,
  selectedDraftId,
  selectedDraftIds,
  showGhosts,
  compact = false,
  isLastColumn,
  isLastRow,
  onSelectDraft,
  onToggleSelection,
  onRegenerate,
  onNativeDrop,
  onCreatePost,
}: PlannerCellProps) {
  const isComingSoon = Boolean(platform.comingSoon)
  const droppableId = `planner-cell::${dayId}::${platform.key}`
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: {
      type: "planner-cell",
      dayId,
      platform: platform.key,
    },
    disabled: isComingSoon,
  })

  const ghosts = useCalendarStore((state) => (showGhosts ? state.ghosts[dayId] || 0 : 0))

  const sortedDrafts = React.useMemo(() => {
    return [...drafts].sort((a, b) => {
      const minutesA = parseTimeLabelToMinutes(a.timeLabel) ?? 0
      const minutesB = parseTimeLabelToMinutes(b.timeLabel) ?? 0
      return minutesA - minutesB
    })
  }, [drafts])

  const visibleDrafts = sortedDrafts

  const handleNativeDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const rawData = event.dataTransfer.getData("application/json")
    if (!rawData || !onNativeDrop) return

    try {
      const data = JSON.parse(rawData) as OrganicSeedDragPayload
      if (!isComingSoon) {
        onNativeDrop(dayId, "09:00", data, platform.key as OrganicPlatformTag)
      }
    } catch (error) {
      console.error("Failed to parse dropped trend payload", error)
    }
  }

  const showEmptyState = drafts.length === 0 && ghosts === 0

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative align-top",
        compact ? "min-h-[50px] p-1" : "min-h-[102px] p-1.5",
        "border-r border-b border-border/50",
        !isLastColumn && "border-r",
        isLastColumn && "border-r-0",
        isLastRow && "border-b-0",
        isOver && !isComingSoon && "bg-orange-500/5"
      )}
      onDragOver={(event) => {
        if (!isComingSoon && event.dataTransfer.types.includes("application/json")) {
          event.preventDefault()
        }
      }}
      onDrop={handleNativeDrop}
    >
      <div
        className={cn(
          "relative z-10 flex flex-col gap-2",
          !compact && !isComingSoon && "max-h-[228px] overflow-y-auto pr-1"
        )}
      >
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

        {Array.from({ length: ghosts }).map((_, index) => (
          <div
            key={`ghost-${dayId}-${platform.key}-${index}`}
            className="h-16 animate-pulse rounded-lg border border-dashed border-border bg-muted/40"
          />
        ))}

        {isComingSoon ? (
          <div
            className={cn(
              "flex w-full items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/40 font-semibold uppercase tracking-wide text-muted-foreground",
              compact ? "h-8 text-[9px]" : "h-16 text-[11px]"
            )}
          >
            Soon
          </div>
        ) : (
          <>
            {showEmptyState ? (
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={() =>
                      onCreatePost({ dayId, platformKey: platform.key, status: "draft" })
                    }
                  className={cn(
                    "flex w-full items-center justify-center rounded-lg border border-dashed border-border/80 font-medium text-muted-foreground transition-colors hover:border-orange-500/60 hover:text-foreground",
                    compact ? "h-10 text-[10px]" : "h-16 text-xs"
                  )}
                >
                  + Add post
                </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuLabel>Quick Add</ContextMenuLabel>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() =>
                      onCreatePost({ dayId, platformKey: platform.key, status: "draft" })
                    }
                  >
                    Add draft
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() =>
                      onCreatePost({ dayId, platformKey: platform.key, status: "scheduled" })
                    }
                  >
                    Add scheduled post
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() =>
                      onCreatePost({ dayId, platformKey: platform.key, status: "placeholder" })
                    }
                  >
                    Add idea placeholder
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ) : null}
          </>
        )}

      </div>
    </div>
  )
}
