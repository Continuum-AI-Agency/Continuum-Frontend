"use client"

import * as React from "react"
import {
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core"
import { useCalendarStore } from "@/lib/organic/store"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCreationStep,
  OrganicEditorSlide,
  OrganicPlatformTag,
  OrganicSeedDragPayload,
  OrganicTrendType,
} from "./types"
import type { Trend } from "@/lib/organic/trends"
import type {
  CalendarPlacement,
  CalendarPlacementSeed,
} from "@/lib/organic/calendar-generation"
import { CalendarDndContext } from "./CalendarDndContext"
import { TimeGridCanvas } from "./TimeGridCanvas"
import { WorkspacePanel } from "./WorkspacePanel"
import { CalendarDraftCard } from "./CalendarDraftCard"
import {
  buildScheduledAt,
  buildWeekDays,
  formatDayId,
  formatWeekRange,
  parseTimeLabelToHour,
  startOfWeek,
} from "./calendar-utils"
import {
  ORGANIC_BETA_LAUNCH_SCHEDULE,
  ORGANIC_NEWSLETTER_DEFAULT,
} from "./organic-calendar-config"
import { streamCalendarGeneration } from "./organic-calendar-api"
import { WeekPicker } from "./WeekPicker"

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

function formatTimeLabel(isoTime: string) {
  const [h, m] = isoTime.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`
}

function formatTimeLabelFromIso(isoString: string): string | null {
  const parsed = new Date(isoString)
  if (Number.isNaN(parsed.getTime())) return null
  const hours = parsed.getHours()
  const minutes = parsed.getMinutes()
  return formatTimeLabel(`${hours}:${minutes.toString().padStart(2, "0")}`)
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
  initialWeekStart?: string | null
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
  initialWeekStart,
}: OrganicCalendarWorkspaceClientProps) {
  const {
    days: calendarDays,
    setDays: setCalendarDays,
    unscheduledDrafts,
    selectedDraftId,
    setSelectedDraftId,
    selectedDraftIds,
    toggleDraftSelection,
    clearDraftSelection,
    selectedTrendIds,
    toggleTrend,
    setGridStatus,
    setGridProgress,
    setGridError,
    addDraft,
    moveDraft,
    setGhosts,
    updateDraft: updateDraftById,
  } = useCalendarStore()

  const [activeDragDraft, setActiveDragDraft] = React.useState<OrganicCalendarDraft | null>(null)
  const resolvedInitialWeekStart = React.useMemo(() => {
    if (initialWeekStart) {
      const parsed = new Date(initialWeekStart)
      if (!Number.isNaN(parsed.getTime())) {
        return startOfWeek(parsed)
      }
    }
    return startOfWeek(new Date())
  }, [initialWeekStart])
  const [weekStart, setWeekStart] = React.useState<Date>(resolvedInitialWeekStart)
  const weekStartId = formatDayId(weekStart)
  const weekCacheRef = React.useRef<Record<string, OrganicCalendarDay[]>>({})

  React.useEffect(() => {
    if (calendarDays.length === 0) {
      setCalendarDays(initialDays)
      weekCacheRef.current[weekStartId] = initialDays
    }
  }, [initialDays, calendarDays.length, setCalendarDays, weekStartId])

  React.useEffect(() => {
    if (calendarDays.length > 0) {
      weekCacheRef.current[weekStartId] = calendarDays
    }
  }, [calendarDays, weekStartId])

  const handleWeekChange = React.useCallback(
    (date: Date) => {
      const nextWeekStart = startOfWeek(date)
      const nextWeekId = formatDayId(nextWeekStart)
      if (nextWeekId === weekStartId) return
      weekCacheRef.current[weekStartId] = calendarDays
      const nextDays = weekCacheRef.current[nextWeekId] ?? buildWeekDays(nextWeekStart)
      setCalendarDays(nextDays)
      setSelectedDraftId(null)
      clearDraftSelection()
      setWeekStart(nextWeekStart)
    },
    [
      calendarDays,
      clearDraftSelection,
      setCalendarDays,
      setSelectedDraftId,
      weekStartId,
    ]
  )

  const handlePreviousWeek = React.useCallback(() => {
    const previous = new Date(weekStart)
    previous.setDate(weekStart.getDate() - 7)
    handleWeekChange(previous)
  }, [handleWeekChange, weekStart])

  const handleNextWeek = React.useCallback(() => {
    const next = new Date(weekStart)
    next.setDate(weekStart.getDate() + 7)
    handleWeekChange(next)
  }, [handleWeekChange, weekStart])

  const drafts = React.useMemo(
    () => [...calendarDays.flatMap((day) => day.slots), ...unscheduledDrafts],
    [calendarDays, unscheduledDrafts]
  )

  const seededDraftCount = React.useMemo(
    () =>
      calendarDays.reduce(
        (count, day) =>
          count + day.slots.filter((slot) => slot.status === "placeholder").length,
        0
      ),
    [calendarDays]
  )

  const resolveDayMeta = React.useCallback(
    (dayId: string) => calendarDays.find((day) => day.id === dayId) ?? null,
    [calendarDays]
  )

  const mapPlacementToDraft = React.useCallback(
    (placement: CalendarPlacement, existing?: OrganicCalendarDraft | null): OrganicCalendarDraft => {
      const day = resolveDayMeta(placement.schedule.dayId)
      const timeLabel =
        formatTimeLabelFromIso(placement.schedule.scheduledAt) ??
        resolveTimeLabel(placement.schedule.timeOfDay ?? null, day?.suggestedTimes ?? [])
      const content = placement.content ?? {}
      const seedTrendId = placement.seed?.trendId ?? null
      const tags = seedTrendId ? [seedTrendId] : existing?.tags ?? []
      const title = content.titleTopic ?? existing?.title ?? "Planned draft"
      const summary = placement.creative?.creativeIdea ?? content.objective ?? existing?.summary ?? "Planned draft"
      const caption = placement.copy?.caption ?? existing?.captionPreview ?? "Details incoming."

      return {
        id: placement.placementId,
        title,
        summary,
        timeLabel,
        dateLabel: day ? `${day.label}, ${day.dateLabel}` : placement.schedule.dayId,
        status: "draft",
        platforms: [placement.platform.name],
        format: content.format ?? content.type ?? existing?.format ?? "Post",
        objective: content.objective ?? existing?.objective ?? "Draft",
        captionPreview: caption,
        tags,
        mediaCount: content.numSlides ?? existing?.mediaCount ?? 1,
      }
    },
    [resolveDayMeta]
  )

  const handleAutoSort = React.useCallback(async () => {
    let trendIndex = 0
    const itemsToSchedule = [...selectedTrendIds]

    if (itemsToSchedule.length === 0 && trends.length > 0) {
      itemsToSchedule.push(...trends.slice(0, 6).map((trend) => trend.id))
    }

    if (itemsToSchedule.length === 0) return

    for (const day of calendarDays) {
      if (day.label === ORGANIC_NEWSLETTER_DEFAULT.dayLabel) {
        const newsletterId = `newsletter-${day.id}`
        const alreadyExists = day.slots.some((slot) => slot.id === newsletterId)
        if (!alreadyExists) {
          addDraft(day.id, {
            id: newsletterId,
            title: "Weekly Newsletter",
            summary: "Distill the week's top insights into an email.",
            timeLabel: ORGANIC_NEWSLETTER_DEFAULT.timeLabel,
            dateLabel: `${day.label}, ${day.dateLabel}`,
            status: "draft",
            platforms: ["instagram"],
            format: ORGANIC_NEWSLETTER_DEFAULT.format,
            objective: "Retention",
            captionPreview: "Drafting your weekly recap...",
            tags: ["newsletter"],
            mediaCount: 1,
          })
        }
        continue
      }

      const platform = ORGANIC_BETA_LAUNCH_SCHEDULE[day.label as keyof typeof ORGANIC_BETA_LAUNCH_SCHEDULE]
      const trendId = itemsToSchedule[trendIndex]

      if (platform && trendId) {
        const accountId = platformAccountIds[platform]
        const trend = trends.find((item) => item.id === trendId)
        const tags = trend?.tags?.includes("question")
          ? [trendId, "question"]
          : trend?.tags?.includes("event")
          ? [trendId, "event"]
          : [trendId]
        const seedId = `seed-${day.id}-${trendId}`
        const alreadyExists = day.slots.some((slot) => slot.id === seedId)
        if (!alreadyExists) {
          addDraft(day.id, {
            id: seedId,
            title: "Seeded topic",
            summary: "Ready to generate once you press build.",
            timeLabel: day.suggestedTimes[0] ?? "9:00 AM",
            dateLabel: `${day.label}, ${day.dateLabel}`,
            status: "placeholder",
            platforms: [platform],
            format: "Post",
            objective: "Generation Seed",
            captionPreview: "Click Generate to construct this post.",
            tags,
            mediaCount: 1,
            seedTrendId: trendId,
            targetAccountId: accountId,
          })
        }

        trendIndex = (trendIndex + 1) % itemsToSchedule.length
      }
    }
  }, [calendarDays, selectedTrendIds, trends, addDraft, platformAccountIds])

  const handleGenerateDrafts = async () => {
    setGridStatus("running")
    setGridProgress({ percent: 0, message: "Preparing calendar seeds..." })
    setGridError(null)

    if (!brandProfileId) {
      setGridStatus("error")
      setGridError("Missing brand context. Please reconnect your brand profile.")
      return
    }

    const seeds = calendarDays.flatMap((day) =>
      day.slots
        .filter((draft) => draft.status === "placeholder" && (draft.seedTrendId || draft.tags.length > 0))
        .map((draft) => {
          const trendId = draft.seedTrendId ?? draft.tags[0]
          if (!trendId) return null
          const seedSource = draft.tags.includes("question")
            ? "question"
            : draft.tags.includes("event")
            ? "event"
            : "trend"
          return {
            placementId: draft.id,
            trendId,
            dayId: day.id,
            scheduledAt: buildScheduledAt(day.id, draft.timeLabel) ?? day.id,
            timeLabel: draft.timeLabel,
            platform: draft.platforms[0] ?? "instagram",
            accountId: draft.targetAccountId ?? platformAccountIds[draft.platforms[0]],
            seedSource,
            desiredFormat: draft.format,
          }
        })
        .filter(Boolean)
    )

    if (seeds.length === 0) {
      setGridStatus("error")
      setGridError("Seed the calendar with trends or questions before generating.")
      return
    }

    seeds.forEach((seed) => {
      if (!seed) return
      updateDraftById(seed.placementId, (draft) => ({
        ...draft,
        status: "streaming",
      }))
    })

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

    try {
      await streamCalendarGeneration(
        {
          brandProfileId,
          weekStart: weekStartId,
          timezone,
          placements: seeds as CalendarPlacementSeed[],
          platformAccountIds: platformAccountIds as Record<OrganicPlatformKey, string>,
          options: {
            schedulePreset: "beta-launch",
            includeNewsletter: true,
            guidancePrompt: undefined,
            preferredPlatforms: activePlatforms.length > 0 ? activePlatforms : undefined,
          },
        },
        (event) => {
          if (event.type === "progress") {
            setGridProgress({
              percent: Math.round((event.completed / event.total) * 100),
              message: event.message ?? "Generating content...",
            })
            return
          }

          if (event.type === "placement") {
            const placement = event.placement
            const existing = drafts.find((draft) => draft.id === placement.placementId) ?? null
            const nextDraft = mapPlacementToDraft(placement, existing)
            addDraft(placement.schedule.dayId, nextDraft)
            setGhosts(placement.schedule.dayId, 0)
            return
          }

          if (event.type === "error") {
            setGridError(event.message)
            setGridStatus("error")
            return
          }

          if (event.type === "complete") {
            setGridStatus("complete")
          }
        }
      )
    } catch (error) {
      setGridStatus("error")
      setGridError(
        error instanceof Error ? error.message : "Generation failed. Please try again."
      )
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

    const targetDay = calendarDays.find(d => d.id === overId)
    if (targetDay) {
      moveDraft(draftId, targetDay.id)
    }
  }


  const handleRegenerate = React.useCallback(
    async (draftId: string) => {
      const draft = drafts.find((item) => item.id === draftId)
      if (!draft) return

      if (!brandProfileId) {
        setGridError("Missing brand context. Please reconnect your brand profile.")
        return
      }

      const dayId = calendarDays.find((day) => day.slots.some((slot) => slot.id === draftId))?.id
      if (!dayId) return

      const trendId = draft.seedTrendId ?? draft.tags[0]
      if (!trendId) return
      const seedSource = draft.tags.includes("question")
        ? "question"
        : draft.tags.includes("event")
        ? "event"
        : "trend"

      updateDraftById(draftId, (current) => ({ ...current, status: "streaming" }))

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

      try {
        await streamCalendarGeneration(
          {
            brandProfileId,
            weekStart: weekStartId,
            timezone,
            placements: [
              {
                placementId: draft.id,
                trendId,
                dayId,
                scheduledAt: buildScheduledAt(dayId, draft.timeLabel) ?? dayId,
                timeLabel: draft.timeLabel,
                platform: draft.platforms[0] ?? "instagram",
                accountId: draft.targetAccountId ?? platformAccountIds[draft.platforms[0]],
                seedSource,
                desiredFormat: draft.format,
              },
            ],
            platformAccountIds: platformAccountIds as Record<OrganicPlatformKey, string>,
          },
          (event) => {
            if (event.type === "placement") {
              const next = mapPlacementToDraft(event.placement, draft)
              addDraft(dayId, next)
              return
            }
            if (event.type === "error") {
              setGridError(event.message)
            }
          }
        )
      } catch (e) {
        updateDraftById(draftId, (current) => ({ ...current, status: "draft" }))
      }
    },
    [
      addDraft,
      brandProfileId,
      buildScheduledAt,
      calendarDays,
      drafts,
      mapPlacementToDraft,
      platformAccountIds,
      setGridError,
      updateDraftById,
      weekStartId,
    ]
  )

  const handleNativeDrop = React.useCallback(async (dayId: string, time: string, data: OrganicSeedDragPayload) => {
    if (data.type === "trend" || data.type === "question") {
      const trendId = data.trendId;
      const trendTitle = data.title || "Selected topic";
      if (!trendId) return;

      const targetDay = calendarDays.find((day) => day.id === dayId);
      if (!targetDay) return;

      // Determine platform based on Beta Launch schedule
      const dayName = targetDay.label;
      const platform =
        (ORGANIC_BETA_LAUNCH_SCHEDULE[dayName as keyof typeof ORGANIC_BETA_LAUNCH_SCHEDULE] ??
          "instagram") as OrganicPlatformTag;
      const accountId = platformAccountIds[platform as OrganicPlatformKey];

      // Calculate contextual time
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
              : (data.type as string) === "event"
              ? [trendId, "event"]
              : [trendId],
        mediaCount: 1,
        seedTrendId: trendId,
        targetAccountId: accountId,
      };

      addDraft(dayId, seededDraft);
    }
  }, [calendarDays, platformAccountIds, addDraft]);

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
            <div className="flex items-center justify-between gap-4 px-1 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-secondary">
                  Week planning
                </p>
                <p className="text-xs text-secondary">
                  Mon/Wed/Fri Instagram · Tue/Thu/Sat LinkedIn
                </p>
              </div>
              <WeekPicker
                value={weekStart}
                rangeLabel={formatWeekRange(weekStart)}
                onChange={handleWeekChange}
                onPreviousWeek={handlePreviousWeek}
                onNextWeek={handleNextWeek}
              />
            </div>
            <TimeGridCanvas
              days={calendarDays}
              selectedDraftId={selectedDraftId}
              selectedDraftIds={selectedDraftIds}
              onSelectDraft={setSelectedDraftId}
              onToggleSelection={toggleDraftSelection}
              onRegenerate={handleRegenerate}
              onNativeDrop={handleNativeDrop}
            />
          </div>
          <div className="h-full min-w-0 overflow-hidden">
            <WorkspacePanel
              trendTypes={trendTypes}
              trends={trends}
              selectedTrendIds={selectedTrendIds}
              activePlatforms={activePlatforms}
              maxTrendSelections={maxTrendSelections}
              onToggleTrend={(id) => toggleTrend(id, maxTrendSelections)}
              onGenerate={handleGenerateDrafts}
              viewMode="week"
              onViewModeChange={() => {}}
              onAutoSort={handleAutoSort}
              seedCount={seededDraftCount}
            />
          </div>
        </div>
      </CalendarDndContext>
    </div>
  )
}
