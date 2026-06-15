"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { Cross2Icon } from "@radix-ui/react-icons"
import { AnimatePresence, motion } from "motion/react"
import { useShallow } from "zustand/react/shallow"
import { DEFAULT_REEL_VIDEO_BATCH_MAX } from "@continuum/contracts"

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
import { useCalendarRealtimeSync } from "../hooks/useCalendarRealtimeSync"
import { useCalendarPostedContent } from "../hooks/useCalendarPostedContent"
import { useBrandInsightsRefresh } from "@/lib/brand-insights/useBrandInsightsRefresh"
import { BulkActionToolbar } from "./BulkActionToolbar"
import { useGenerateReelVideos } from "@/components/organic/hooks/useGenerateReelVideos"
import { useGenerateDraftMedia } from "@/components/organic/hooks/useGenerateDraftMedia"
import { OrganicCreativesPicker } from "./OrganicCreativesPicker"
import { OrganicDraftPreview } from "./OrganicDraftPreview"
import { Button } from "@/components/ui/button"
import {
  buildPlannerPlatforms,
  type CreatePostMode,
  type PlannerPlatformKey,
} from "./planner-platforms"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TrendWorkbench } from "./TrendWorkbench"
import { useAiStudioHandoff } from "../hooks/useAiStudioHandoff"
import { brandStorageKeyAiStudioLastDraft } from "@/lib/organic/ai-studio-bridge"
import { getLocalStorageJSON } from "@/lib/storage"
import { CalendarToolbar } from "./CalendarToolbar"
import { AiStudioHandoffProvider } from "./AiStudioHandoffContext"
import { ORGANIC_PLANNER_TOUR_VIEWPORT_ID } from "@/components/onboarding/v2/tour/config"
import { useTourTabStore } from "@/components/onboarding/v2/tour/tourTabStore"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { CalendarPostAccountsByPlatform } from "@/lib/organic/calendar-posts"
import { evaluateDraftReadiness } from "@/lib/organic/draftReadiness"

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

  // The tour provider requests a calendar viewMode via the shared store on
  // step change (e.g. step 2 needs the list view). Depend on requestId so a
  // repeated request for the same view still fires.
  const requestedTourCalendarView = useTourTabStore((state) => state.organicCalendarView)
  const tourRequestId = useTourTabStore((state) => state.requestId)
  React.useEffect(() => {
    if (!requestedTourCalendarView || requestedTourCalendarView === viewMode) return
    setViewMode(requestedTourCalendarView)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTourCalendarView, tourRequestId])

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

  const { refetch: refetchCalendarDrafts } = useCalendarDraftPersistence({
    brandProfileId,
    weekStartId,
    calendarDays,
    setCalendarDays,
    updateDraftById,
    platformAccountIds,
  })

  // Server-authoritative freshness: subscribe to Realtime draft writes for this
  // brand so out-of-band agent drafts (chat tools, Stage-2 blueprint worker) hit
  // the planner instantly via the same nonce-refetch path below.
  useCalendarRealtimeSync({ brandProfileId })

  // Reconcile against the backend when agent-side work completes (bulk run done,
  // single draft ready) so en-masse generated drafts appear without a manual reload.
  const calendarRefetchNonce = useCalendarStore((state) => state.calendarRefetchNonce)
  React.useEffect(() => {
    if (calendarRefetchNonce === 0) return
    // Debounce so a burst of completions (a bulk run's per-item signals) coalesces
    // into a single reconcile.
    const timer = setTimeout(() => {
      void refetchCalendarDrafts().catch(() => {
        // Best-effort reconcile; the local store remains usable.
      })
    }, 600)
    return () => clearTimeout(timer)
  }, [calendarRefetchNonce, refetchCalendarDrafts])

  const postedContentAccounts = React.useMemo<CalendarPostAccountsByPlatform>(
    () => ({
      instagram: postedContentAccountsByPlatform?.instagram ?? [],
      facebook: postedContentAccountsByPlatform?.facebook ?? [],
      tiktok: postedContentAccountsByPlatform?.tiktok ?? [],
      youtube: postedContentAccountsByPlatform?.youtube ?? [],
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

  // "Planned" calendar lens: when off, hide bulk-plan drafts from the week/month
  // grids (the list view still shows them, tagged). Default on.
  const showPlanned = useCalendarStore((state) => state.showPlanned)
  const gridDays = React.useMemo(
    () =>
      showPlanned
        ? calendarDays
        : calendarDays.map((day) => ({
            ...day,
            slots: day.slots.filter((slot) => !slot.contentPlanId),
          })),
    [calendarDays, showPlanned]
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
    const lastDraftKey = brandProfileId
      ? brandStorageKeyAiStudioLastDraft(brandProfileId)
      : null

    if (selectedId && !allDraftIds.has(selectedId)) {
      // Current selection is stale -- attempt to restore a preferred draft
      // instead of nulling out then re-selecting on the next render cycle.
      if (typeof window !== "undefined") {
        const preferredDraftId =
          initialSelectedDraftId ??
          (lastDraftKey ? getLocalStorageJSON<string | null>(lastDraftKey, null) : null)
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
        (lastDraftKey ? getLocalStorageJSON<string | null>(lastDraftKey, null) : null)
      if (preferredDraftId && allDraftIds.has(preferredDraftId)) {
        setSelectedDraftId(preferredDraftId)
      }
    }
  }, [
    allDraftIds,
    brandProfileId,
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
    handleAutoSort,
    handleGenerateGridJob,
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
      mode?: CreatePostMode
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
      const isManual = context?.mode === "manual"
      const status = context?.status ?? "draft"
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
        objective: isManual ? "Manual" : "Draft",
        origin: isManual ? "manual" : undefined,
        creativeIdea: "",
        captionPreview: "",
        tags: [],
        mediaCount: isManual ? 0 : 1,
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
      mode?: CreatePostMode
    }) => {
      const mode = context?.mode ?? "ai"
      const status = context?.status ?? (mode === "manual" ? "draft" : "placeholder")
      const createdDraftId = createQuickDraft({
        dayId: context?.dayId,
        platform: context?.platform,
        status,
        trendId: context?.trendId,
        mode,
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
    // Only schedule drafts that meet the bare minimum (caption + media); leave the
    // rest as drafts so the readiness gate can't be bypassed in bulk.
    selectedIds.forEach((id) =>
      updateDraftById(id, (d) =>
        evaluateDraftReadiness(d).ready ? { ...d, status: "scheduled" as const } : d
      )
    )
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

  const { generate: generateReelVideos, isGenerating: isGeneratingReels } = useGenerateReelVideos()

  // Selected reel drafts that carry a persisted storyboard and have not yet been
  // rendered to video — the eligible set for the gated "Generate videos" batch.
  const reelTargets = React.useMemo(() => {
    const selected = new Set(selectedIds)
    return drafts
      .filter((d) => selected.has(d.id))
      .filter((d) => {
        const format = (d.format ?? "").toLowerCase()
        const reel = d.mediaSuggestion?.reel
        const hasStoryboard = Array.isArray(reel?.scenes) && reel.scenes.length > 0
        return (
          (format === "reel" || format === "video") &&
          hasStoryboard &&
          reel?.generated !== true &&
          Boolean(d.backendDraftId)
        )
      })
      .map((d) => ({ id: d.id, backendDraftId: d.backendDraftId as string }))
  }, [drafts, selectedIds])

  const handleGenerateReels = React.useCallback(() => {
    if (!brandProfileId || reelTargets.length === 0) return
    // Cap the batch client-side (the backend also enforces this) so the user
    // gets clear feedback instead of an opaque 400.
    const capped = reelTargets.slice(0, DEFAULT_REEL_VIDEO_BATCH_MAX)
    if (typeof window !== "undefined") {
      const approxClips = capped.length * 4
      const overflowNote =
        reelTargets.length > capped.length
          ? ` Only the first ${capped.length} of ${reelTargets.length} selected will render (max ${DEFAULT_REEL_VIDEO_BATCH_MAX} per batch).`
          : ""
      const confirmed = window.confirm(
        `Generate ${capped.length} reel video${capped.length === 1 ? "" : "s"}? ` +
          `This renders ~${approxClips} AI video clips and may take a few minutes.${overflowNote}`
      )
      if (!confirmed) return
    }
    void generateReelVideos(brandProfileId, capped)
  }, [brandProfileId, reelTargets, generateReelVideos])

  // Bulk "Generate media" — opt-in Step-3 realization for image/carousel/reel drafts.
  const { generateDraftMedia, isGenerating: isGeneratingMedia } = useGenerateDraftMedia()

  const mediaGenerationTargets = React.useMemo(() => {
    const selected = new Set(selectedIds)
    return drafts
      .filter((d) => selected.has(d.id) && Boolean(d.backendDraftId))
      .filter((d) => {
        // Only include drafts pending media generation (not already ready or user-supplied).
        const ms = d.mediaSuggestion?.mediaStatus
        return !ms || ms === "pending" || ms === "generating"
      })
      .map((d) => ({ feId: d.id, backendDraftId: d.backendDraftId as string, format: d.format ?? "" }))
  }, [drafts, selectedIds])

  const handleBulkGenerateMedia = React.useCallback(() => {
    if (!brandProfileId || mediaGenerationTargets.length === 0) return
    void generateDraftMedia(brandProfileId, mediaGenerationTargets)
  }, [brandProfileId, mediaGenerationTargets, generateDraftMedia])

  // Bulk "Attach creative…" — open a library picker once, apply the selection to
  // all selected drafts. The picker's onAttach gives us a resolved PublishingAsset[]
  // that we spread onto every target draft.
  const [attachPickerOpen, setAttachPickerOpen] = React.useState(false)

  const attachTargetDraftIds = React.useMemo(() => {
    return selectedIds.filter((id) => drafts.some((d) => d.id === id && Boolean(d.backendDraftId)))
  }, [drafts, selectedIds])

  const handlePickerAttach = React.useCallback(
    (publishingAssets: OrganicCalendarDraft["publishingAssets"]) => {
      if (!publishingAssets?.length || attachTargetDraftIds.length === 0) return
      // Derive a mediaSuggestion patch from the publishing assets so
      // assertPublishable + stageMediaForPublish both see consistent data.
      const primary = publishingAssets[0]
      const mediaPatch: OrganicCalendarDraft["mediaSuggestion"] = {
        mediaStatus: "user_supplied",
        kind: primary?.kind ?? undefined,
        bucket: primary?.bucket ?? undefined,
        url: primary?.storagePath ?? undefined,
      }
      for (const draftId of attachTargetDraftIds) {
        updateDraftById(draftId, (draft) => ({
          ...draft,
          publishingAssets,
          mediaSuggestion: { ...draft.mediaSuggestion, ...mediaPatch },
        }))
      }
      setAttachPickerOpen(false)
    },
    [attachTargetDraftIds, updateDraftById],
  )

  const handleBulkAttachCreative = React.useCallback(() => {
    if (attachTargetDraftIds.length === 0 || !brandProfileId) return
    setAttachPickerOpen(true)
  }, [attachTargetDraftIds, brandProfileId])

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
      className="@container/organic h-full min-h-0 w-full overflow-hidden focus:outline-none"
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
          className="flex h-full min-h-0 w-full flex-col gap-[var(--shell-gutter-tight)] @[64rem]/organic:flex-row"
        >
          <motion.section
            layout
            transition={layoutTransition}
            id={ORGANIC_PLANNER_TOUR_VIEWPORT_ID}
            className="relative flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden"
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

            <motion.div
              layout
              transition={layoutTransition}
              data-tour-id="organic-list-content"
              className="min-h-0 flex-1 overflow-hidden"
            >
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
                        <div data-tour-id="organic-calendar" className="h-full overflow-hidden">
                          <TimeGridCanvas
                            days={gridDays}
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
                                status: context?.status,
                                mode: context?.mode,
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
                            brandProfileId={brandProfileId}
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
                      days={gridDays}
                      monthAnchorDate={monthAnchorDate}
                      platforms={plannerPlatforms}
                      postedContent={postedContent}
                      selectedDraftId={selectedId}
                      onSelectDraft={(id) => handleSelect(id, false)}
                      onCreatePost={({ dayId, platformKey, status, mode }) =>
                        handleGoDraft({ dayId, platform: platformKey as PlannerPlatformKey | undefined, status, mode })
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
                      days={gridDays}
                      platforms={plannerPlatforms}
                      selectedDraftId={selectedId}
                      selectedDraftIds={selectedIds}
                      onSelectDraft={(id) => handleSelect(id, false)}
                      onToggleSelection={(id) => handleSelect(id, true)}
                      onRegenerate={handleRegenerate}
                      onCreatePost={({ dayId, platformKey, status, mode }) =>
                        handleGoDraft({ dayId, platform: platformKey as PlannerPlatformKey | undefined, status, mode })
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
                className="flex h-[65dvh] min-h-[28rem] flex-col overflow-hidden rounded-lg bg-card/80 p-2 ring-1 ring-border/45 @[64rem]/organic:h-full @[64rem]/organic:w-[clamp(28rem,34cqi,46rem)] @[64rem]/organic:shrink-0"
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
        reelCount={reelTargets.length}
        onGenerateReels={brandProfileId ? handleGenerateReels : undefined}
        isGeneratingReels={isGeneratingReels}
        onAttachCreative={brandProfileId && attachTargetDraftIds.length > 0 ? handleBulkAttachCreative : undefined}
        onGenerateMedia={brandProfileId && mediaGenerationTargets.length > 0 ? handleBulkGenerateMedia : undefined}
        isGeneratingMedia={isGeneratingMedia}
      />
      {/* Bulk attach creative — one picker selection applied to all selected drafts. */}
      {brandProfileId && (
        <Dialog open={attachPickerOpen} onOpenChange={setAttachPickerOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                Attach creative to {attachTargetDraftIds.length} draft{attachTargetDraftIds.length === 1 ? "" : "s"}
              </DialogTitle>
            </DialogHeader>
            <OrganicCreativesPicker
              brandProfileId={brandProfileId}
              draftId=""
              attached={[]}
              onAttach={handlePickerAttach}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
    </AiStudioHandoffProvider>
  )
}
