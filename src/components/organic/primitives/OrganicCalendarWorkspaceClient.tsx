"use client"

import * as React from "react"
import {
  Cross2Icon,
  LightningBoltIcon,
  RocketIcon,
  TrashIcon,
} from "@radix-ui/react-icons"
import { AnimatePresence, motion } from "framer-motion"

import { useCalendarStore } from "@/lib/organic/store"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCreationStep,
  OrganicEditorSlide,
  OrganicTrendType,
  OrganicPlatformTag,
} from "./types"
import type { Trend } from "@/lib/organic/trends"
import { CalendarDndContext } from "./CalendarDndContext"
import { TimeGridCanvas } from "./TimeGridCanvas"
import { CalendarDraftCard } from "./CalendarDraftCard"
import {
  buildWeekDays,
  formatDayId,
  formatWeekHeading,
  formatWeekRange,
  startOfWeek,
} from "./calendar-utils"
import { useCalendarSelection } from "../hooks/useCalendarSelection"
import { useCalendarDnD } from "../hooks/useCalendarDnD"
import { useDraftGeneration } from "../hooks/useDraftGeneration"
import { BulkActionToolbar } from "./BulkActionToolbar"
import { OrganicDraftPreview } from "./OrganicDraftPreview"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  buildPlannerPlatforms,
  type PlannerPlatformKey,
} from "./planner-platforms"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { TrendWorkbench } from "./TrendWorkbench"

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

function isSchedulablePlannerPlatform(
  platform: PlannerPlatformKey | undefined
): platform is OrganicPlatformTag {
  return Boolean(
    platform && platform !== "youtube" && platform !== "tiktok" && platform !== "x"
  )
}

export function OrganicCalendarWorkspaceClient({
  days: initialDays,
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
    toggleTrend,
    bulkMoveDrafts,
    bulkDeleteDrafts,
    clearCalendar,
    selectedTrendIds,
    viewMode,
    setViewMode,
    addDraft,
  } = useCalendarStore()

  const {
    selectedId,
    selectedIds,
    handleSelect,
    clearAll,
    handleKeyDown,
  } = useCalendarSelection(calendarDays, unscheduledDrafts)

  const resolvedTrends = React.useMemo(() => {
    const merged = [
      ...trends,
      ...trendTypes.flatMap((trendType) =>
        trendType.groups.flatMap((group) => group.trends)
      ),
    ]

    const deduped = new Map<string, Trend>()
    merged.forEach((item) => {
      if (!deduped.has(item.id)) {
        deduped.set(item.id, item)
      }
    })

    return Array.from(deduped.values())
  }, [trendTypes, trends])

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
      clearAll()
      setWeekStart(nextWeekStart)
    },
    [calendarDays, clearAll, setCalendarDays, weekStartId]
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

  const selectedDraft = React.useMemo(() => {
    if (!selectedId) return null
    return drafts.find((draft) => draft.id === selectedId) ?? null
  }, [drafts, selectedId])

  const {
    activeDragDraft,
    handleDragStart,
    handleDragEnd,
    handleNativeDrop,
  } = useCalendarDnD(calendarDays, drafts, platformAccountIds)

  const {
    seededDraftCount,
    gridStatus,
    handleAutoSort,
    handleGenerateGridJob,
    handleRegenerate,
  } = useDraftGeneration({
    brandProfileId,
    calendarDays,
    drafts,
    selectedTrendIds,
    trends: resolvedTrends,
    platformAccountIds,
    activePlatforms,
    weekStartId,
  })

  const plannerPlatforms = React.useMemo(
    () => buildPlannerPlatforms(activePlatforms, calendarDays),
    [activePlatforms, calendarDays]
  )

  const schedulableChannels = React.useMemo(
    () => plannerPlatforms.filter((platform) => !platform.comingSoon).length,
    [plannerPlatforms]
  )

  const weekTitle = React.useMemo(() => formatWeekHeading(weekStart), [weekStart])
  const weekSubtitle = React.useMemo(
    () => `${formatWeekRange(weekStart)} • ${schedulableChannels} scheduling channels`,
    [schedulableChannels, weekStart]
  )

  const createQuickDraft = React.useCallback(
    (context?: {
      dayId?: string
      platform?: PlannerPlatformKey
      status?: "draft" | "scheduled" | "placeholder"
      trendId?: string
    }) => {
      const selectedPlatform =
        (isSchedulablePlannerPlatform(context?.platform) && context?.platform) ||
        (activePlatforms.find((platform) =>
          ["instagram", "facebook", "linkedin"].includes(platform)
        ) as OrganicPlatformTag | undefined) ||
        "instagram"

      const targetDay = context?.dayId
        ? calendarDays.find((day) => day.id === context.dayId) ?? null
        : null
      const status = context?.status ?? "draft"
      const trendTag = context?.trendId ?? selectedTrendIds[0]

      const draftId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? `draft-${crypto.randomUUID()}`
          : `draft-${Date.now()}`

      const nextDraft: OrganicCalendarDraft = {
        id: draftId,
        title:
          status === "placeholder"
            ? "Content idea"
            : `New ${selectedPlatform[0].toUpperCase()}${selectedPlatform.slice(1)} post`,
        summary: "Quick draft created from planner.",
        timeLabel: targetDay?.suggestedTimes[0] ?? "9:00 AM",
        dateLabel: targetDay ? `${targetDay.label}, ${targetDay.dateLabel}` : "Unscheduled",
        status,
        platforms: [selectedPlatform],
        format: "Post",
        objective: "Engagement",
        captionPreview:
          status === "placeholder"
            ? "Use this as a seed before generation."
            : "Draft your hook, value, and CTA.",
        tags: [],
        mediaCount: 1,
        seedTrendId: status === "placeholder" ? trendTag : undefined,
      }

      addDraft(targetDay?.id ?? "unscheduled", nextDraft)
      handleSelect(draftId, false)
    },
    [activePlatforms, addDraft, calendarDays, handleSelect, selectedTrendIds]
  )

  const handleSeedAndFill = React.useCallback(async () => {
    await handleAutoSort()
    await handleGenerateGridJob({
      language: "English",
      userPrompt: "Fill the week from selected trends.",
    })
  }, [handleAutoSort, handleGenerateGridJob])

  const setTrendSelection = React.useCallback(
    (trendIds: string[]) => {
      const next = new Set(trendIds)
      selectedTrendIds.forEach((trendId) => {
        if (!next.has(trendId)) {
          toggleTrend(trendId, maxTrendSelections)
        }
      })
      trendIds.forEach((trendId) => {
        if (!selectedTrendIds.includes(trendId)) {
          toggleTrend(trendId, maxTrendSelections)
        }
      })
    },
    [maxTrendSelections, selectedTrendIds, toggleTrend]
  )

  const resolveTrendPlatform = React.useCallback(
    (trend: Trend): PlannerPlatformKey | undefined => {
      const firstSupported = trend.platforms.find(
        (platform): platform is OrganicPlatformTag =>
          platform === "instagram" || platform === "linkedin" || platform === "facebook"
      )
      if (firstSupported) return firstSupported

      const fallback = activePlatforms.find(
        (platform): platform is OrganicPlatformTag =>
          platform === "instagram" || platform === "linkedin" || platform === "facebook"
      )
      return fallback
    },
    [activePlatforms]
  )

  const handleSeedSingleTrend = React.useCallback(
    (trend: Trend) => {
      setTrendSelection([trend.id])
      createQuickDraft({
        dayId: calendarDays[0]?.id,
        platform: resolveTrendPlatform(trend),
        status: "placeholder",
        trendId: trend.id,
      })
    },
    [calendarDays, createQuickDraft, resolveTrendPlatform, setTrendSelection]
  )

  const handleSeedAndFillFromTrend = React.useCallback(
    async (trend: Trend) => {
      setTrendSelection([trend.id])
      await handleAutoSort()
      await handleGenerateGridJob({
        language: "English",
        userPrompt: `Fill the week prioritizing trend: ${trend.title}`,
      })
    },
    [handleAutoSort, handleGenerateGridJob, setTrendSelection]
  )

  const handleBulkDelete = React.useCallback(() => {
    bulkDeleteDrafts(selectedIds)
    clearAll()
  }, [bulkDeleteDrafts, selectedIds, clearAll])

  const handleBulkMove = React.useCallback(() => {
    bulkMoveDrafts(selectedIds, calendarDays[0]?.id)
    clearAll()
  }, [bulkMoveDrafts, selectedIds, calendarDays, clearAll])

  const isGenerating = gridStatus === "running"
  const layoutTransition = React.useMemo(
    () => ({
      duration: 0.28,
      ease: [0.2, 0.8, 0.2, 1] as const,
    }),
    []
  )
  const previewTransition = React.useMemo(
    () => ({
      duration: 0.24,
      ease: [0.16, 1, 0.3, 1] as const,
    }),
    []
  )

  return (
    <div
      className="h-full min-h-0 w-full overflow-hidden focus:outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <CalendarDndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        dragOverlay={
          activeDragDraft ? (
            <div className="w-[220px] cursor-grabbing opacity-85">
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
        <motion.div
          layout
          transition={layoutTransition}
          className="flex h-full min-h-0 w-full flex-col gap-2 lg:flex-row"
        >
          <motion.section
            layout
            transition={layoutTransition}
            className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden"
          >
            <motion.div layout transition={layoutTransition}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card/70 px-2.5 py-1.5 ring-1 ring-border/40">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        {selectedTrendIds.length}
                        {typeof maxTrendSelections === "number"
                          ? `/${maxTrendSelections}`
                          : ""}{" "}
                        trends
                      </Badge>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        {seededDraftCount} seeded
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="bg-orange-500 text-white hover:bg-orange-500/90"
                        disabled={isGenerating}
                        onClick={() => {
                          void handleSeedAndFill()
                        }}
                      >
                        {isGenerating ? (
                          <LightningBoltIcon className="mr-1 h-3.5 w-3.5 animate-pulse" />
                        ) : (
                          <RocketIcon className="mr-1 h-3.5 w-3.5" />
                        )}
                        Seed / Fill Posts
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isGenerating}
                        onClick={() => {
                          void handleAutoSort()
                        }}
                      >
                        Seed only
                      </Button>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuLabel>Weekly Actions</ContextMenuLabel>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => {
                      void handleSeedAndFill()
                    }}
                  >
                    Seed + fill posts
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => {
                      void handleAutoSort()
                    }}
                  >
                    Seed placeholders only
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={clearCalendar}
                  >
                    <TrashIcon className="mr-2 h-3.5 w-3.5" />
                    Clear current week
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </motion.div>

            <motion.div layout transition={layoutTransition} className="min-h-0 flex-1 overflow-hidden">
              <ResizablePanelGroup orientation="vertical" className="gap-0">
                <ResizablePanel defaultSize={74} minSize={48}>
                  <div className="h-full overflow-hidden">
                    <TimeGridCanvas
                      days={calendarDays}
                      selectedDraftId={selectedId}
                      selectedDraftIds={selectedIds}
                      activePlatforms={activePlatforms}
                      rangeTitle={weekTitle}
                      rangeSubtitle={weekSubtitle}
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                      onPreviousWeek={handlePreviousWeek}
                      onNextWeek={handleNextWeek}
                      onCreatePost={(context) =>
                        createQuickDraft({
                          dayId: context?.dayId,
                          platform: context?.platform,
                          status: context?.status,
                        })
                      }
                      onSelectDraft={(id) => handleSelect(id, false)}
                      onToggleSelection={(id) => handleSelect(id, true)}
                      onRegenerate={handleRegenerate}
                      onNativeDrop={handleNativeDrop}
                    />
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle className="my-1 h-1 cursor-row-resize rounded-md" />

                <ResizablePanel defaultSize={26} minSize={18}>
                  <div className="h-full min-h-0 overflow-hidden">
                    <TrendWorkbench
                      trends={resolvedTrends}
                      selectedTrendIds={selectedTrendIds}
                      activePlatforms={activePlatforms}
                      maxSelections={maxTrendSelections}
                      isGenerating={isGenerating}
                      onToggleTrend={(id) => toggleTrend(id, maxTrendSelections)}
                      onSeedSelected={() => {
                        void handleAutoSort()
                      }}
                      onSeedAndFill={() => {
                        void handleSeedAndFill()
                      }}
                      onSeedSingleTrend={handleSeedSingleTrend}
                      onSeedAndFillFromTrend={(trend) => {
                        void handleSeedAndFillFromTrend(trend)
                      }}
                    />
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </motion.div>
          </motion.section>

          <AnimatePresence initial={false}>
            {selectedDraft ? (
              <motion.aside
                key="preview-panel"
                layout
                initial={{ opacity: 0, x: 28, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.98 }}
                transition={previewTransition}
                className="h-[50dvh] min-h-[20rem] overflow-hidden rounded-lg bg-card/80 p-2 ring-1 ring-border/45 lg:h-full lg:w-[28rem] lg:shrink-0"
              >
                <div className="mb-2 flex items-center justify-between pb-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Post Preview
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Close preview"
                    onClick={clearAll}
                  >
                    <Cross2Icon className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="h-[calc(100%-2rem)] overflow-hidden rounded-md bg-background/85">
                  <OrganicDraftPreview draft={selectedDraft} />
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </CalendarDndContext>

      <BulkActionToolbar
        selectedCount={selectedIds.length}
        onClear={clearAll}
        onDelete={handleBulkDelete}
        onMove={handleBulkMove}
      />
    </div>
  )
}
