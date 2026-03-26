"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Cross2Icon,
  LightningBoltIcon,
  PlusIcon,
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
import { Progress } from "@/components/ui/progress"
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
import {
  AI_STUDIO_LAST_DRAFT_STORAGE_KEY,
  buildAiStudioStorageKey,
  buildPendingApplyStorageKey,
  buildSessionHistoryStorageKey,
  normalizeDraftPostType,
  plannerAiStudioApplyResponseSchema,
  plannerAiStudioHandoffSchema,
  resolveWorkflowConcept,
  type PlannerAiStudioHandoff,
  type PlannerAiStudioRevision,
} from "@/lib/organic/ai-studio-bridge"

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
  initialWeekStart,
  initialSelectedDraftId,
}: OrganicCalendarWorkspaceClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
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
  } = useCalendarStore()

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
  const weekStartId = formatDayId(weekStart)
  const weekCacheRef = React.useRef<Record<string, OrganicCalendarDay[]>>({})

  React.useEffect(() => {
    setPersistedWeekStartId(weekStartId)
  }, [setPersistedWeekStartId, weekStartId])

  React.useEffect(() => {
    if (calendarDays.length > 0) {
      weekCacheRef.current[weekStartId] = calendarDays
      return
    }

    const cachedWeek = weekCacheRef.current[weekStartId]
    const fallbackDays =
      cachedWeek ??
      (weekStartId === resolvedInitialWeekStartId
        ? initialDays
        : buildWeekDays(weekStart))
    setCalendarDays(fallbackDays)
    weekCacheRef.current[weekStartId] = fallbackDays
  }, [
    calendarDays,
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
    () => calendarDays.flatMap((day) => day.slots),
    [calendarDays]
  )

  const selectedDraft = React.useMemo(() => {
    if (!selectedId) return null
    return drafts.find((draft) => draft.id === selectedId) ?? null
  }, [drafts, selectedId])

  const allDraftIds = React.useMemo(() => new Set(drafts.map((draft) => draft.id)), [drafts])

  React.useEffect(() => {
    if (selectedId && !allDraftIds.has(selectedId)) {
      setSelectedDraftId(null)
    }

    const nextSelectedIds = selectedIds.filter((id) => allDraftIds.has(id))
    if (nextSelectedIds.length !== selectedIds.length) {
      setSelectedDraftIds(nextSelectedIds)
    }
  }, [allDraftIds, selectedId, selectedIds, setSelectedDraftId, setSelectedDraftIds])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (selectedId) return

    const preferredDraftId =
      initialSelectedDraftId ??
      window.localStorage.getItem(AI_STUDIO_LAST_DRAFT_STORAGE_KEY)
    if (!preferredDraftId || !allDraftIds.has(preferredDraftId)) return

    setSelectedDraftId(preferredDraftId)
  }, [
    allDraftIds,
    initialSelectedDraftId,
    selectedId,
    setSelectedDraftId,
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
    }) => {
      const createdDraftId = createQuickDraft({
        dayId: context?.dayId,
        platform: context?.platform,
        status: "placeholder",
        trendId: context?.trendId,
      })
      if (!createdDraftId) return
    },
    [createQuickDraft]
  )

  const handleGenerateSelectedDrafts = React.useCallback(() => {
    void handleGenerateDrafts()
  }, [handleGenerateDrafts])

  const deriveAiStudioPrompts = React.useCallback((draft: OrganicCalendarDraft) => {
    const creativeDirectionPrompt =
      draft.creativeDirectionPrompt?.trim() ||
      draft.creativeIdea?.trim() ||
      draft.summary?.trim() ||
      draft.title.trim()

    const thumbnailPrompt =
      draft.thumbnailPrompt?.trim() ||
      draft.mediaSuggestion?.prompt?.trim() ||
      draft.assetHints?.[0]?.suggestion?.trim() ||
      ""

    return {
      creativeDirectionPrompt,
      thumbnailPrompt,
    }
  }, [])

  const buildAiStudioContext = React.useCallback(
    (draft: OrganicCalendarDraft): PlannerAiStudioHandoff => {
      const prompts = deriveAiStudioPrompts(draft)
      const postType = normalizeDraftPostType(draft.format)
      const platform = draft.platforms[0] === "linkedin" ? "linkedin" : "instagram"
      const workflowConcept = resolveWorkflowConcept({
        platform,
        postType,
      })
      return {
        schemaVersion: "planner_ai_handoff_v1",
        draftId: draft.id,
        brandProfileId: brandProfileId ?? "",
        weekStartId,
        platform,
        postType,
        workflowConcept,
        format: draft.format,
        authoritativeCount:
          postType === "carousel" ? Math.max(1, draft.slideCount ?? draft.mediaCount ?? 1) : 1,
        title: draft.title,
        summary: draft.summary,
        captionPreview: draft.captionPreview,
        seedTrendId: draft.seedTrendId,
        creativeDirectionPrompt: prompts.creativeDirectionPrompt,
        thumbnailPrompt: prompts.thumbnailPrompt,
        mediaSuggestion: draft.mediaSuggestion
          ? {
              assetUrl:
                typeof draft.mediaSuggestion.assetUrl === "string"
                  ? draft.mediaSuggestion.assetUrl
                  : undefined,
              assetBase64:
                typeof draft.mediaSuggestion.assetBase64 === "string"
                  ? draft.mediaSuggestion.assetBase64
                  : undefined,
              generationContext: draft.mediaSuggestion.generationContext,
            }
          : undefined,
        assetHints: draft.assetHints,
        updatedAt: new Date().toISOString(),
      }
    },
    [brandProfileId, deriveAiStudioPrompts, weekStartId]
  )

  React.useEffect(() => {
    if (typeof window === "undefined" || !selectedDraft) return
    const parsed = plannerAiStudioHandoffSchema.safeParse(buildAiStudioContext(selectedDraft))
    if (!parsed.success) return
    const payload = parsed.data
    window.localStorage.setItem(
      buildAiStudioStorageKey(selectedDraft.id),
      JSON.stringify(payload)
    )
    window.localStorage.setItem(AI_STUDIO_LAST_DRAFT_STORAGE_KEY, selectedDraft.id)
  }, [buildAiStudioContext, selectedDraft])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const draftId = searchParams.get("draftId")
    if (!draftId) return

    const key = buildPendingApplyStorageKey(draftId)
    const raw = window.localStorage.getItem(key)
    if (!raw) return

    let parsedPayload: unknown
    try {
      parsedPayload = JSON.parse(raw)
    } catch {
      return
    }

    const parsed = plannerAiStudioApplyResponseSchema.safeParse(parsedPayload)
    if (!parsed.success) return
    const applyPayload = parsed.data

    updateDraftById(applyPayload.draftId, (draft) => ({
      ...draft,
      title: applyPayload.contentPatch.title ?? draft.title,
      summary: applyPayload.contentPatch.summary ?? draft.summary,
      captionPreview: applyPayload.contentPatch.captionPreview ?? draft.captionPreview,
      creativeDirectionPrompt:
        applyPayload.contentPatch.creativeDirectionPrompt ?? draft.creativeDirectionPrompt,
      thumbnailPrompt: applyPayload.contentPatch.thumbnailPrompt ?? draft.thumbnailPrompt,
      creativeIdea: applyPayload.contentPatch.creativeIdea ?? draft.creativeIdea,
      publishingAssets: applyPayload.assets.map((asset) => ({
        role: asset.role,
        kind: asset.kind,
        slideIndex: asset.slideIndex,
        storagePath: asset.storagePath,
        storageUrl: asset.storageUrl,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        generationContext: asset.generationContext,
      })),
      mediaSuggestion:
        applyPayload.assets[0]?.kind === "image"
          ? {
              ...(draft.mediaSuggestion ?? {}),
              assetUrl: applyPayload.assets[0].storageUrl,
              assetBase64: null,
              generationContext: applyPayload.assets[0].generationContext as
                | NonNullable<NonNullable<OrganicCalendarDraft["mediaSuggestion"]>["generationContext"]>
                | null
                | undefined,
            }
          : draft.mediaSuggestion,
      mediaCount: Math.max(
        1,
        applyPayload.assets.filter((asset) => asset.kind === "image").length || draft.mediaCount
      ),
      status: "draft",
      generationError: undefined,
    }))

    setSelectedDraftId(applyPayload.draftId)
    window.localStorage.removeItem(key)

    const historyKey = buildSessionHistoryStorageKey(applyPayload.draftId)
    const historyRaw = window.sessionStorage.getItem(historyKey)
    let history: PlannerAiStudioRevision[] = []
    if (historyRaw) {
      try {
        history = JSON.parse(historyRaw) as PlannerAiStudioRevision[]
      } catch {
        history = []
      }
    }

    const seedRaw = window.localStorage.getItem(buildAiStudioStorageKey(applyPayload.draftId))
    let before: PlannerAiStudioHandoff | null = null
    if (seedRaw) {
      try {
        const parsedSeed = plannerAiStudioHandoffSchema.safeParse(JSON.parse(seedRaw))
        if (parsedSeed.success) {
          before = parsedSeed.data
        }
      } catch {
        before = null
      }
    }

    if (before) {
      const revision: PlannerAiStudioRevision = {
        revisionId:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `revision-${Date.now()}`,
        draftId: applyPayload.draftId,
        createdAt: new Date().toISOString(),
        before,
        applied: applyPayload,
      }
      history.push(revision)
      window.sessionStorage.setItem(historyKey, JSON.stringify(history.slice(-10)))
    }
  }, [searchParams, setSelectedDraftId, updateDraftById])

  const handleOpenInAiStudio = React.useCallback(() => {
    if (!selectedDraft || !brandProfileId) return
    const parsed = plannerAiStudioHandoffSchema.safeParse(buildAiStudioContext(selectedDraft))
    if (!parsed.success) return
    window.localStorage.setItem(
      buildAiStudioStorageKey(selectedDraft.id),
      JSON.stringify(parsed.data)
    )
    window.localStorage.setItem(AI_STUDIO_LAST_DRAFT_STORAGE_KEY, selectedDraft.id)
    router.push(
      `/ai-studio?mode=canvas&source=organic-planner&draftId=${encodeURIComponent(
        selectedDraft.id
      )}`
    )
  }, [brandProfileId, buildAiStudioContext, router, selectedDraft])

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
                  <div className="rounded-lg bg-card/70 px-2.5 py-1.5 ring-1 ring-border/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                          {selectedTrendIds.length}
                          {typeof maxTrendSelections === "number"
                            ? `/${maxTrendSelections}`
                            : ""}{" "}
                          trends
                        </Badge>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                          {seededDraftCount} placeholders
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          aria-label="Add placeholder"
                          disabled={isGenerating}
                          onClick={() => {
                            handleGoDraft()
                          }}
                        >
                          <PlusIcon className={isGenerating ? "h-3.5 w-3.5 animate-pulse" : "h-3.5 w-3.5"} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          disabled={isGenerating || seededDraftCount === 0}
                          onClick={handleGenerateSelectedDrafts}
                        >
                          {isGenerating ? (
                            <LightningBoltIcon className="mr-1 h-3.5 w-3.5 animate-pulse" />
                          ) : (
                            <RocketIcon className="mr-1 h-3.5 w-3.5" />
                          )}
                          Generate
                        </Button>
                      </div>
                    </div>

                    {slotProgress ? (
                      <div className="mt-2 space-y-1">
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-medium text-muted-foreground">
                            {slotProgress.completed}/{slotProgress.total} completed
                            {slotProgress.failed > 0 ? ` • ${slotProgress.failed} failed` : ""}
                          </p>
                          {gridProgress.stage ? (
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                              {gridProgress.stage}
                            </p>
                          ) : null}
                          {gridProgress.message ? (
                            <p className="line-clamp-2 text-[11px] text-muted-foreground/80">
                              {gridProgress.message}
                            </p>
                          ) : null}
                        </div>
                        <Progress value={gridProgress.percent} className="h-1.5 bg-muted/70" />
                      </div>
                    ) : null}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuLabel>Weekly Actions</ContextMenuLabel>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => {
                      handleGoDraft()
                    }}
                  >
                    Plus
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={seededDraftCount === 0}
                    onSelect={handleGenerateSelectedDrafts}
                  >
                    Generate placeholders
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
                className="h-[55dvh] min-h-[22rem] overflow-hidden rounded-lg bg-card/80 p-2 ring-1 ring-border/45 lg:h-full lg:w-[42rem] lg:shrink-0 xl:w-[46rem]"
              >
                <div className="mb-2 flex items-center justify-between pb-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Post Preview
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!brandProfileId}
                      onClick={handleOpenInAiStudio}
                    >
                      Open in AI Studio
                    </Button>
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

                <div className="h-[calc(100%-2rem)] overflow-hidden rounded-md bg-background/85">
                  <div className="h-full min-h-0 overflow-hidden rounded-md border border-border/45 bg-background/80">
                    <OrganicDraftPreview draft={selectedDraft} />
                  </div>
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
