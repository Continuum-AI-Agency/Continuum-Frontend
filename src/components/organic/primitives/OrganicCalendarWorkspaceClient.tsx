"use client"

import * as React from "react"
import {
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core"
import { useCalendarStore, type GridSlot } from "@/lib/organic/store"
import { type OrganicPlatformKey } from "@/lib/organic/platforms"
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCreationStep,
  OrganicEditorSlide,
  OrganicPlatformTag,
  OrganicTrendType,
} from "./types"
import type { Trend } from "@/lib/organic/trends"
import { CalendarDndContext } from "./CalendarDndContext"
import { TimeGridCanvas } from "./TimeGridCanvas"
import { WorkspacePanel } from "./WorkspacePanel"
import { CalendarDraftCard } from "./CalendarDraftCard"

function parseJsonSafely<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function mapTimeOfDay(timeLabel: string): "morning" | "afternoon" | "evening" {
  const trimmed = timeLabel.toLowerCase()
  const match = trimmed.match(/(\d+)(?::(\d+))?\s*(am|pm)/)
  if (!match) return "morning"
  const hour = Number(match[1] ?? 9)
  const isPm = match[3] === "pm"
  const normalizedHour = isPm && hour < 12 ? hour + 12 : hour % 24
  if (normalizedHour >= 17) return "evening"
  if (normalizedHour >= 12) return "afternoon"
  return "morning"
}

function resolveTimeLabel(
  timeOfDay: string | null | undefined,
  fallbackTimes: string[]
): string {
  if (!timeOfDay) return fallbackTimes[0] ?? "9:00 AM"
  const mapping: Record<string, string> = {
    morning: "9:00 AM",
    afternoon: "1:00 PM",
    evening: "6:00 PM",
  }
  return mapping[timeOfDay] ?? fallbackTimes[0] ?? "9:00 AM"
}

function mapPlatformTag(name: string): OrganicPlatformTag {
  return name === "linkedin" ? "linkedin" : "instagram"
}

async function streamNdjson<T>(
  response: Response,
  onItem: (item: T) => void
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const parsed = parseJsonSafely<T>(trimmed)
      if (parsed) onItem(parsed)
    }
  }

  const tail = buffer.trim()
  if (tail.length > 0) {
    const parsed = parseJsonSafely<T>(tail)
    if (parsed) onItem(parsed)
  }
}

type OrganicCalendarWorkspaceClientProps = {
  days: OrganicCalendarDay[]
  steps: OrganicCreationStep[]
  editorSlides: OrganicEditorSlide[]
  trendTypes: OrganicTrendType[]
  trends?: Trend[]
  activePlatforms?: OrganicPlatformKey[]
  platformAccountIds?: Partial<Record<OrganicPlatformKey, string>>
  maxTrendSelections?: number
  brandProfileId?: string
  userId?: string
  instagramAccountId?: string
  initialSelectedDraftId?: string | null
}

export function OrganicCalendarWorkspaceClient({
  days: initialDays,
  steps,
  editorSlides,
  trendTypes,
  trends = [],
  activePlatforms = [],
  platformAccountIds = {},
  maxTrendSelections,
  brandProfileId,
  userId,
  instagramAccountId,
  initialSelectedDraftId,
}: OrganicCalendarWorkspaceClientProps) {
  const {
    days: calendarDays,
    setDays: setCalendarDays,
    unscheduledDrafts,
    selectedDraftId,
    setSelectedDraftId,
    selectedDraftIds,
    toggleDraftSelection,
    selectedTrendIds,
    toggleTrend,
    gridStatus,
    setGridStatus,
    setGridProgress,
    setGridError,
    setGridJobId,
    addDraft,
    moveDraft,
    setGhosts,
    updateDraft: updateDraftById,
    viewMode,
    setViewMode,
  } = useCalendarStore()

  React.useEffect(() => {
    if (calendarDays.length === 0) {
      setCalendarDays(initialDays)
    }
  }, [initialDays, calendarDays.length, setCalendarDays])

  const drafts = React.useMemo(
    () => [...calendarDays.flatMap((day) => day.slots), ...unscheduledDrafts],
    [calendarDays, unscheduledDrafts]
  )

  const [activeDragDraft, setActiveDragDraft] = React.useState<OrganicCalendarDraft | null>(null)

  const resolveDayMeta = React.useCallback(
    (dayId: string) => calendarDays.find((day) => day.id === dayId) ?? null,
    [calendarDays]
  )

  const buildDraftFromSlot = React.useCallback(
    (slot: GridSlot): OrganicCalendarDraft => {
      const day = resolveDayMeta(slot.schedule.dayId)
      const timeLabel = resolveTimeLabel(slot.schedule.timeOfDay ?? null, day?.suggestedTimes ?? [])
      const title = slot.contentPlan.titleTopic ?? slot.contentPlan.type ?? "Planned draft"
      const summary = slot.strategy.objective ?? slot.contentPlan.type ?? "Planned draft"
      const dateLabel = day ? `${day.label}, ${day.dateLabel}` : slot.schedule.dayId

      return {
        id: slot.slotId,
        title,
        summary,
        timeLabel,
        dateLabel,
        status: "draft",
        platforms: [mapPlatformTag(slot.platform.name)],
        format: slot.contentPlan.format ?? slot.contentPlan.type ?? "Draft",
        objective: slot.strategy.objective ?? "Draft",
        captionPreview: "Details incoming.",
        tags: slot.tags?.trendIds ?? [],
        mediaCount: slot.contentPlan.numSlides ?? 1,
      }
    },
    [resolveDayMeta]
  )

  const handleGenerateDrafts = async () => {
    setGridStatus("running")
    setGridProgress({ percent: 0, message: "Initializing agent..." })
    setGridError(null)

    try {
      const response = await fetch("/api/organic/generate-grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: brandProfileId,
          trendIds: selectedTrendIds,
          platformIds: platformAccountIds,
          weekStart: calendarDays[0]?.id,
        }),
      })

      if (!response.ok) throw new Error("Failed to start generation")

      await streamNdjson<{
        type: string
        slot?: GridSlot
        progress?: number
        total?: number
        dayId?: string
        draft?: Partial<OrganicCalendarDraft>
      }>(response, (event) => {
        if (event.type === "progress") {
          setGridProgress({
            percent: Math.round(((event.progress ?? 0) / (event.total ?? 1)) * 100),
            message: `Generating slot ${event.progress}/${event.total}`,
          })
        } else if (event.type === "ghost" && event.dayId) {
          setGhosts(event.dayId, 1)
        } else if (event.type === "slot" && event.slot) {
          const draft = buildDraftFromSlot(event.slot)
          addDraft(event.slot.schedule.dayId, draft)
          
          setGhosts(event.slot.schedule.dayId, 0)
        } else if (event.type === "complete") {
          setGridStatus("complete")
        }
      })
    } catch (error) {
      console.error(error)
      setGridError("Generation failed. Please try again.")
      setGridStatus("error")
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    const draftId = event.active.id as string
    const draft = drafts.find((d) => d.id === draftId)
    if (draft) setActiveDragDraft(draft)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragDraft(null)
    const { active, over } = event
    if (!over) return

    const draftId = active.id as string
    const overId = over.id as string

    if (overId.includes("T")) {
      const [dayId, timeLabel] = overId.split("T")
      
      updateDraftById(draftId, (d) => ({
        ...d,
        timeLabel: formatTimeLabel(timeLabel),
      }))
      
      moveDraft(draftId, dayId)
    } else {
      
    }
  }

  const formatTimeLabel = (isoTime: string) => {
    const [h, m] = isoTime.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
  }

  return (
    <div className="h-[calc(100vh-6rem)] overflow-hidden">
      <CalendarDndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        dragOverlay={
          activeDragDraft ? (
            <div className="w-[200px] opacity-80 rotate-3 cursor-grabbing">
              <CalendarDraftCard
                draft={activeDragDraft}
                isSelected={false}
                isMultiSelected={false}
                onSelect={() => {}}
                onToggleSelection={() => {}}
              />
            </div>
          ) : null
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-[65fr_35fr] gap-6 h-full p-2">
          <div className="min-w-0 h-full overflow-hidden">
            <TimeGridCanvas
              days={calendarDays}
              selectedDraftId={selectedDraftId}
              selectedDraftIds={selectedDraftIds}
              onSelectDraft={setSelectedDraftId}
              onToggleSelection={toggleDraftSelection}
              onRegenerate={() => {}}
              onBuild={handleGenerateDrafts}
            />
          </div>
          <div className="h-full min-w-0 overflow-hidden">
            <WorkspacePanel
              trends={trends}
              selectedTrendIds={selectedTrendIds}
              activePlatforms={activePlatforms}
              maxTrendSelections={maxTrendSelections}
              onToggleTrend={(id) => toggleTrend(id, maxTrendSelections)}
              onGenerate={handleGenerateDrafts}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </div>
        </div>
      </CalendarDndContext>
    </div>
  )
}
