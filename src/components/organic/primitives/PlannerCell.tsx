import * as React from "react"
import { useDroppable } from "@dnd-kit/core"
import { Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { useCalendarStore } from "@/lib/organic/store"
import { Button } from "@/components/ui/button"
import type {
  OrganicSeedDragPayload,
  OrganicCalendarDraft,
  OrganicPlatformTag,
} from "./types"
import { DraggableDraftCard } from "./DraggableDraftCard"
import { AddPostMenu } from "./AddPostMenu"
import type { CreatePostOptions, PlannerPlatform } from "./planner-platforms"

type PlannerCellProps = {
  dayId: string
  platform: PlannerPlatform
  drafts: OrganicCalendarDraft[]
  selectedDraftId: string | null
  selectedDraftIdSet: ReadonlySet<string>
  showGhosts: boolean
  compact?: boolean
  isLastColumn: boolean
  isLastRow: boolean
  isToday?: boolean
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
  onCreatePost: (options: CreatePostOptions) => void
}

export const PlannerCell = React.memo(function PlannerCell({
  dayId,
  platform,
  drafts,
  selectedDraftId,
  selectedDraftIdSet,
  showGhosts,
  compact = false,
  isLastColumn,
  isLastRow,
  isToday = false,
  onSelectDraft,
  onToggleSelection,
  onRegenerate,
  onClearFailure,
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

  const visibleDrafts = drafts

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

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative align-top",
        compact
          ? "min-h-[clamp(40px,5dvh,80px)] px-[var(--app-shell-pad-inline-tight)] py-[var(--app-shell-pad-block)]"
          : "min-h-[clamp(80px,11dvh,140px)] px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]",
        "border-r border-b border-border/50",
        !isLastColumn && "border-r",
        isLastColumn && "border-r-0",
        isLastRow && "border-b-0",
        isOver && !isComingSoon && "bg-primary/10",
        isToday && "bg-primary/[0.03]"
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
            isMultiSelected={selectedDraftIdSet.has(draft.id)}
            onSelect={onSelectDraft}
            onToggleSelection={onToggleSelection}
            onRegenerate={onRegenerate}
            onClearFailure={onClearFailure}
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
          <AddPostMenu dayId={dayId} platformKey={platform.key} onCreatePost={onCreatePost}>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className={cn("mx-auto opacity-0 group-hover:opacity-100 transition-opacity duration-150", compact ? "h-6 w-6" : "h-7 w-7")}
              aria-label={`Add post for ${dayId} ${platform.label}`}
            >
              <Plus className="size-3.5" />
            </Button>
          </AddPostMenu>
        )}

      </div>
    </div>
  )
})
