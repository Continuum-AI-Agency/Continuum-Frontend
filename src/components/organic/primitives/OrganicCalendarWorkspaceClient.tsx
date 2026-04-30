"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { Cross2Icon } from "@radix-ui/react-icons"
import { AnimatePresence, motion } from "motion/react"
import { useShallow } from "zustand/react/shallow"

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
import { useCalendarDraftPersistence } from "../hooks/useCalendarDraftPersistence"
import { useCalendarPostedContent } from "../hooks/useCalendarPostedContent"
import { useBrandInsightsRefresh } from "@/lib/brand-insights/useBrandInsightsRefresh"
import { BulkActionToolbar } from "./BulkActionToolbar"
import { OrganicDraftPreview } from "./OrganicDraftPreview"
import { Button } from "@/components/ui/button"
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
import { useAiStudioHandoff } from "../hooks/useAiStudioHandoff"
import { AI_STUDIO_LAST_DRAFT_STORAGE_KEY } from "@/lib/organic/ai-studio-bridge"
import { getLocalStorageJSON } from "@/lib/storage"
import { CalendarToolbar } from "./CalendarToolbar"
import { AiStudioHandoffProvider } from "./AiStudioHandoffContext"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { CalendarPostAccountsByPlatform } from "@/lib/organic/calendar-posts"

const OrganicMonthlyCalendar = dynamic(
  () => import("./OrganicMonthlyCalendar").then((m) => m.OrganicMonthlyCalendar)
)
const OrganicListView = dynamic(
  () => import("./OrganicListView").then((m) => m.OrganicListView)
)
const OrganicTrendsDrawer = dynamic(
  () => import("./OrganicTrendsDrawer").then((m) => m.OrganicTrendsDrawer)
)

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
  brandName?: string
  userId?: string
  instagramAccountId?: string
  initialWeekStart?: string | null
  initialSelectedDraftId?: string | null
  initialView?: "week" | "month" | "list"
  postedContentAccountsByPlatform?: CalendarPostAccountsByPlatform
}

const NOOP_STRING = (_id: string) => {}

function isSchedulablePlannerPlatform(
  platform: PlannerPlatformKey | undefined
): platform is OrganicPlatformTag {
  return platform === "instagram" || platform === "linkedin"
}

export function OrganicCalendarWorkspaceClient({
  days: initialDays,
  trendTypes,
  trends = [],
  activePlatforms = [],
  platformAccountIds = {},
  maxTrendSelections,
  brandProfileId,
  brandName,
  instagramAccountId,
  initialWeekStart,
  initialSelectedDraftId,
  initialView,
  postedContentAccountsByPlatform,
}: OrganicCalendarWorkspaceClientProps) {
  const {
    days: calendarDays,
    setDays: setCalendarDays,
    persistedWeekStartId,
    setPersistedWeekStartId,
    toggleTrend,
    bulkMoveDrafts,
    bulkDeleteDrafts,
    clearCalendar,
    setSelectedDraftId,
    setSelectedDraftIds,
    selectedTrendIds,
    gridProgress,
    viewMode,
    setViewMode,
    addDraft,
    updateDraft: updateDraftById,
    backlogDrafts,
    addBacklogDraft,
    deleteBacklogDraft,
    promoteBacklogDraft,
    setAccountContext,
    gridError,
    weekCache,
    setWeekCache,
  } = useCalendarStore(
    useShallow((state) => ({
      days: state.days,
      setDays: state.setDays,
      persistedWeekStartId: state.persistedWeekStartId,
      setPersistedWeekStartId: state.setPersistedWeekStartId,
      toggleTrend: state.toggleTrend,
      bulkMoveDrafts: state.bulkMoveDrafts,
      bulkDeleteDrafts: state.bulkDeleteDrafts,
      clearCalendar: state.clearCalendar,
      setSelectedDraftId: state.setSelectedDraftId,
      setSelectedDraftIds: state.setSelectedDraftIds,
      selectedTrendIds: state.selectedTrendIds,
      gridProgress: state.gridProgress,
      viewMode: state.viewMode,
      setViewMode: state.setViewMode,
      addDraft: state.addDraft,
      updateDraft: state.updateDraft,
      backlogDrafts: state.backlogDrafts,
      addBacklogDraft: state.addBacklogDraft,
      deleteBacklogDraft: state.deleteBacklogDraft,
      promoteBacklogDraft: state.promoteBacklogDraft,
      setAccountContext: state.setAccountContext,
      gridError: state.gridError,
      weekCache: state.weekCache,
      setWeekCache: state.setWeekCache,
    }))
  )

  React.useEffect(() => {
    const igAccountId = instagramAccountId ?? platformAccountIds.instagram ?? null
    setAccountContext({ igAccountId, brandId: brandProfileId ?? null })
  }, [instagramAccountId, platformAccountIds, brandProfileId, setAccountContext])

  const {
    selectedId,
    selectedIds,
    handleSelect,
    clearAll,
    handleKeyDown,
  } = useCalendarSelection(calendarDays)

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
    if (persistedWeekStartId) {
      const parsed = new Date(persistedWeekStartId)
      if (!Number.isNaN(parsed.getTime())) {
        return startOfWeek(parsed)
      }
    }
    return startOfWeek(new Date())
  }, [initialWeekStart, persistedWeekStartId])
  const resolvedInitialWeekStartId = React.useMemo(
    () => formatDayId(resolvedInitialWeekStart),
    [resolvedInitialWeekStart]
  )

  const [weekStart, setWeekStart] = React.useState<Date>(resolvedInitialWeekStart)
  const [monthAnchorDate, setMonthAnchorDate] = React.useState<Date>(resolvedInitialWeekStart)
  const [localGridViewMode, setLocalGridViewMode] = React.useState<"day" | "week">("week")
  const [trendsDrawerOpen, setTrendsDrawerOpen] = React.useState(false)

  // Apply initialView from URL search param on mount (once)
  React.useEffect(() => {
    if (initialView) setViewMode(initialView)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const weekStartId = formatDayId(weekStart)

  useCalendarDraftPersistence({
    brandProfileId,
    weekStartId,
    calendarDays,
    setCalendarDays,
    updateDraftById,
    platformAccountIds,
  })

  const postedContentAccounts = React.useMemo<CalendarPostAccountsByPlatform>(
    () => ({
      instagram: postedContentAccountsByPlatform?.instagram ?? [],
      facebook: postedContentAccountsByPlatform?.facebook ?? [],
      tiktok: postedContentAccountsByPlatform?.tiktok ?? [],
    }),
    [postedContentAccountsByPlatform]
  )

  const {
    posts: postedContent,
    isFetchingExternal: isFetchingPostedContent,
    fetchExternalPosts,
  } = useCalendarPostedContent({
    brandProfileId,
    viewMode,
    weekStart,
    monthAnchorDate,
    accountsByPlatform: postedContentAccounts,
  })

  React.useEffect(() => {
    setPersistedWeekStartId(weekStartId)
  }, [setPersistedWeekStartId, weekStartId])

  // Keep the store's week cache in sync with the current week's days.
  // Runs after render so it never triggers a synchronous re-render loop.
  React.useEffect(() => {
    if (calendarDays.length > 0) {
      setWeekCache(weekStartId, calendarDays)
    }
  }, [calendarDays, weekStartId, setWeekCache])

  // Populate calendar days when the store is empty for the current week.
  React.useEffect(() => {
    if (calendarDays.length > 0) return

    const cachedWeek = weekCache[weekStartId]
    const fallbackDays =
      cachedWeek ??
      (weekStartId === resolvedInitialWeekStartId
        ? initialDays
        : buildWeekDays(weekStart))
    setCalendarDays(fallbackDays)
  }, [
    calendarDays.length,
    weekCache,
    initialDays,
    resolvedInitialWeekStartId,
    setCalendarDays,
    weekStart,
    weekStartId,
  ])

  const handleWeekChange = React.useCallback(
    (date: Date) => {
      const nextWeekStart = startOfWeek(date)
      const nextWeekId = formatDayId(nextWeekStart)
      if (nextWeekId === weekStartId) return
      setWeekCache(weekStartId, calendarDays)
      const nextDays = weekCache[nextWeekId] ?? buildWeekDays(nextWeekStart)
      setCalendarDays(nextDays)
      clearAll()
      setWeekStart(nextWeekStart)
    },
    [calendarDays, clearAll, setCalendarDays, setWeekCache, weekCache, weekStartId]
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

  const handlePreviousMonth = React.useCallback(() => {
    const prev = new Date(monthAnchorDate)
    prev.setDate(1)
    prev.setMonth(prev.getMonth() - 1)
    setMonthAnchorDate(prev)
  }, [monthAnchorDate])

  const handleNextMonth = React.useCallback(() => {
    const next = new Date(monthAnchorDate)
    next.setDate(1)
    next.setMonth(next.getMonth() + 1)
    setMonthAnchorDate(next)
  }, [monthAnchorDate])

  const drafts = React.useMemo(
    () => calendarDays.flatMap((day) => day.slots),
    [calendarDays]
  )

  const selectedDraft = React.useMemo(() => {
    if (!selectedId) return null
    return drafts.find((draft) => draft.id === selectedId) ?? null
  }, [drafts, selectedId])

  const allDraftIds = React.useMemo(() => new Set(drafts.map((draft) => draft.id)), [drafts])

  // Unified selection sync: prune stale selections and restore preferred
  // draft in a single pass to avoid cascading renders.
  React.useEffect(() => {
    // Prune multi-selection IDs that no longer exist
    const nextSelectedIds = selectedIds.filter((id) => allDraftIds.has(id))
    if (nextSelectedIds.length !== selectedIds.length) {
      setSelectedDraftIds(nextSelectedIds)
    }

    // Resolve the active single-selection draft
    if (selectedId && !allDraftIds.has(selectedId)) {
      // Current selection is stale -- attempt to restore a preferred draft
      // instead of nulling out then re-selecting on the next render cycle.
      if (typeof window !== "undefined") {
        const preferredDraftId =
          initialSelectedDraftId ??
          getLocalStorageJSON<string | null>(AI_STUDIO_LAST_DRAFT_STORAGE_KEY, null)
        if (preferredDraftId && allDraftIds.has(preferredDraftId)) {
          setSelectedDraftId(preferredDraftId)
          return
        }
      }
      setSelectedDraftId(null)
      return
    }

    // No current selection -- try to restore from initial prop / localStorage
    if (!selectedId && typeof window !== "undefined") {
      const preferredDraftId =
        initialSelectedDraftId ??
        getLocalStorageJSON<string | null>(AI_STUDIO_LAST_DRAFT_STORAGE_KEY, null)
      if (preferredDraftId && allDraftIds.has(preferredDraftId)) {
        setSelectedDraftId(preferredDraftId)
      }
    }
  }, [
    allDraftIds,
    initialSelectedDraftId,
    selectedId,
    selectedIds,
    setSelectedDraftId,
    setSelectedDraftIds,
  ])

  const {
    activeDragDraft,
    handleDragStart,
    handleDragEnd,
    handleNativeDrop,
  } = useCalendarDnD(calendarDays, drafts, platformAccountIds)

  const {
    seededDraftCount,
    gridStatus,
    handleGenerateDrafts,
    handleRegenerate,
    handleClearFailure,
  } = useDraftGeneration({
    brandProfileId,
    calendarDays,
    drafts,
    selectedTrendIds,
    platformAccountIds,
    activePlatforms,
    weekStartId,
  })

  const { refresh: refreshTrends, isFetching: isFetchingTrends } = useBrandInsightsRefresh(brandProfileId ?? "")

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
          ["instagram", "linkedin"].includes(platform)
        ) as OrganicPlatformTag | undefined) ||
        "instagram"

      const targetDay = context?.dayId
        ? calendarDays.find((day) => day.id === context.dayId) ?? null
        : (calendarDays[0] ?? null)
      if (!targetDay) return null
      const requestedStatus = context?.status ?? "draft"
      const status = requestedStatus
      const trendTag = context?.trendId
      const targetAccountId = platformAccountIds[selectedPlatform as OrganicPlatformKey]

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
        summary: "",
        timeLabel: targetDay?.suggestedTimes[0] ?? "9:00 AM",
        dateLabel: `${targetDay.label}, ${targetDay.dateLabel}`,
        status,
        platforms: [selectedPlatform],
        format: "Post",
        objective: "Draft",
        creativeIdea: "",
        captionPreview: "",
        tags: [],
        mediaCount: 1,
        seedTrendId: status === "placeholder" ? trendTag : undefined,
        targetAccountId,
      }

      addDraft(targetDay.id, nextDraft)
      handleSelect(draftId, false)
      return draftId
    },
    [activePlatforms, addDraft, calendarDays, handleSelect, platformAccountIds]
  )

  const handleGoDraft = React.useCallback(
    (context?: {
      dayId?: string
      platform?: PlannerPlatformKey
      trendId?: string
      status?: "draft" | "scheduled" | "placeholder"
    }) => {
      const createdDraftId = createQuickDraft({
        dayId: context?.dayId,
        platform: context?.platform,
        status: context?.status ?? "placeholder",
        trendId: context?.trendId,
      })
      if (!createdDraftId) return
    },
    [createQuickDraft]
  )

  const handleGenerateSelectedDrafts = React.useCallback(() => {
    void handleGenerateDrafts()
  }, [handleGenerateDrafts])

  const { handleOpenInAiStudio, handleOpenDraftInAiStudio } = useAiStudioHandoff({
    brandProfileId,
    weekStartId,
    selectedDraft,
    updateDraftById,
    setSelectedDraftId,
  })

  const handleOpenDraftInStudio = React.useCallback(
    (draftId: string) => {
      let found: OrganicCalendarDraft | undefined
      for (const day of calendarDays) {
        found = day.slots.find((d: OrganicCalendarDraft) => d.id === draftId)
        if (found) break
      }
      if (!found) return
      handleOpenDraftInAiStudio(found)
    },
    [calendarDays, handleOpenDraftInAiStudio]
  )

  const handleBulkApprove = React.useCallback(() => {
    selectedIds.forEach((id) => updateDraftById(id, (d) => ({ ...d, status: "scheduled" as const })))
    clearAll()
  }, [selectedIds, updateDraftById, clearAll])

  const handleBulkDelete = React.useCallback(() => {
    bulkDeleteDrafts(selectedIds)
    clearAll()
  }, [bulkDeleteDrafts, selectedIds, clearAll])

  const handleBulkMove = React.useCallback(() => {
    bulkMoveDrafts(selectedIds, calendarDays[0]?.id)
    clearAll()
  }, [bulkMoveDrafts, selectedIds, calendarDays, clearAll])

  const isGenerating = gridStatus === "running"
  const slotProgress = React.useMemo(() => {
    const completed = gridProgress.completed
    const total = gridProgress.total
    if (typeof completed !== "number" || typeof total !== "number" || total <= 0) {
      return null
    }
    const failed = typeof gridProgress.failed === "number" ? Math.max(0, gridProgress.failed) : 0
    return {
      completed: Math.max(0, Math.min(completed, total)),
      total,
      failed,
    }
  }, [gridProgress.completed, gridProgress.failed, gridProgress.total])

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
    <AiStudioHandoffProvider onOpen={brandProfileId ? handleOpenDraftInStudio : null}>
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
            <div className="w-[220px] cursor-grabbing opacity-60">
              <CalendarDraftCard
                draft={activeDragDraft}
                isSelected={false}
                isMultiSelected={false}
                onSelect={NOOP_STRING}
                onToggleSelection={NOOP_STRING}
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
              <CalendarToolbar
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                selectedTrendCount={selectedTrendIds.length}
                maxTrendSelections={maxTrendSelections}
                seededDraftCount={seededDraftCount}
                isGenerating={isGenerating}
                onOpenTrends={() => setTrendsDrawerOpen(true)}
                onAddPlaceholder={() => handleGoDraft()}
                onGenerate={handleGenerateSelectedDrafts}
                onClear={clearCalendar}
                draftsCount={drafts.length}
                slotProgress={slotProgress}
                gridProgress={gridProgress}
                gridStatus={gridStatus}
                gridError={gridError}
                postedContentCount={postedContent.length}
                isFetchingPostedContent={isFetchingPostedContent}
                onFetchPostedContent={fetchExternalPosts}
              />
            </motion.div>

            <motion.div layout transition={layoutTransition} className="min-h-0 flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                {viewMode === "week" && (
                  <motion.div
                    key="view-week"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="h-full"
                  >
                    <ResizablePanelGroup orientation="vertical" className="gap-0">
                      <ResizablePanel defaultSize={74} minSize={48}>
                        <div className="h-full overflow-hidden">
                          <TimeGridCanvas
                            days={calendarDays}
                            platforms={plannerPlatforms}
                            selectedDraftId={selectedId}
                            selectedDraftIds={selectedIds}
                            rangeTitle={weekTitle}
                            rangeSubtitle={weekSubtitle}
                            viewMode={localGridViewMode}
                            onViewModeChange={setLocalGridViewMode}
                            onPreviousWeek={handlePreviousWeek}
                            onNextWeek={handleNextWeek}
                            onCreatePost={(context) =>
                              handleGoDraft({
                                dayId: context?.dayId,
                                platform: context?.platform,
                              })
                            }
                            onSelectDraft={(id) => handleSelect(id, false)}
                            onToggleSelection={(id) => handleSelect(id, true)}
                            onRegenerate={handleRegenerate}
                            onClearFailure={handleClearFailure}
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
                            onToggleTrend={(id) => toggleTrend(id, maxTrendSelections)}
                          />
                        </div>
                      </ResizablePanel>
                    </ResizablePanelGroup>
                  </motion.div>
                )}

                {viewMode === "month" && (
                  <motion.div
                    key="view-month"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="h-full"
                  >
                    <OrganicMonthlyCalendar
                      days={calendarDays}
                      monthAnchorDate={monthAnchorDate}
                      platforms={plannerPlatforms}
                      postedContent={postedContent}
                      selectedDraftId={selectedId}
                      onSelectDraft={(id) => handleSelect(id, false)}
                      onCreatePost={({ dayId, platformKey }) =>
                        handleGoDraft({ dayId, platform: platformKey as PlannerPlatformKey | undefined })
                      }
                      onPreviousMonth={handlePreviousMonth}
                      onNextMonth={handleNextMonth}
                      onRegenerate={handleRegenerate}
                      onDeleteDraft={(id) => bulkDeleteDrafts([id])}
                    />
                  </motion.div>
                )}

                {viewMode === "list" && (
                  <motion.div
                    key="view-list"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="h-full"
                  >
                    <OrganicListView
                      days={calendarDays}
                      platforms={plannerPlatforms}
                      selectedDraftId={selectedId}
                      selectedDraftIds={selectedIds}
                      onSelectDraft={(id) => handleSelect(id, false)}
                      onToggleSelection={(id) => handleSelect(id, true)}
                      onRegenerate={handleRegenerate}
                      onCreatePost={({ dayId, platformKey, status }) =>
                        handleGoDraft({ dayId, platform: platformKey as PlannerPlatformKey | undefined, status })
                      }
                      brandProfileId={brandProfileId}
                      backlogDrafts={backlogDrafts}
                      onAddBacklogDraft={addBacklogDraft}
                      onDeleteBacklogDraft={deleteBacklogDraft}
                      onPromoteBacklogDraft={promoteBacklogDraft}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            <OrganicTrendsDrawer
              open={trendsDrawerOpen}
              onOpenChange={setTrendsDrawerOpen}
              trends={resolvedTrends}
              selectedTrendIds={selectedTrendIds}
              activePlatforms={activePlatforms}
              maxSelections={maxTrendSelections}
              onToggleTrend={(id) => toggleTrend(id, maxTrendSelections)}
              onFetch={brandProfileId ? refreshTrends : undefined}
              isFetching={isFetchingTrends}
            />
          </motion.section>

          <AnimatePresence initial={false}>
            {selectedDraft ? (
              <motion.aside
                key="preview-panel"
                layout
                role="complementary"
                aria-label="Draft preview"
                tabIndex={-1}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Escape") clearAll()
                }}
                initial={{ opacity: 0, x: 28, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.98 }}
                transition={previewTransition}
                className="flex h-[65dvh] min-h-[28rem] flex-col overflow-hidden rounded-lg bg-card/80 p-2 ring-1 ring-border/45 lg:h-full lg:w-[42rem] lg:shrink-0 xl:w-[46rem]"
              >
                <div className="mb-2 flex shrink-0 items-center justify-between pb-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Post Preview
                  </p>
                  <div className="flex items-center gap-1.5">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={!brandProfileId}
                              onClick={handleOpenInAiStudio}
                              style={!brandProfileId ? { pointerEvents: "none" } : undefined}
                            >
                              Open in AI Studio
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {!brandProfileId ? (
                          <TooltipContent>Select a brand to use AI Studio</TooltipContent>
                        ) : null}
                      </Tooltip>
                    </TooltipProvider>
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
                </div>

                <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border/45 bg-background/80">
                  <OrganicDraftPreview
                    draft={selectedDraft}
                    brandName={brandName}
                    brandProfileId={brandProfileId}
                    onApprove={(draftId) =>
                      updateDraftById(draftId, (d) => ({ ...d, status: "scheduled" as const }))
                    }
                  />
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
        onApprove={handleBulkApprove}
      />
    </div>
    </AiStudioHandoffProvider>
  )
}
