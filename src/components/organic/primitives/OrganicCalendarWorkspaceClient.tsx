"use client"

import * as React from "react"
import { useCalendarStore } from "@/lib/organic/store"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import type {
  OrganicCalendarDay,
  OrganicCreationStep,
  OrganicEditorSlide,
  OrganicTrendType,
} from "./types"
import type { Trend } from "@/lib/organic/trends"
import { CalendarDndContext } from "./CalendarDndContext"
import { TimeGridCanvas } from "./TimeGridCanvas"
import { WorkspacePanel } from "./WorkspacePanel"
import { CalendarDraftCard } from "./CalendarDraftCard"
import {
  buildWeekDays,
  formatDayId,
  formatWeekRange,
  startOfWeek,
} from "./calendar-utils"
import { WeekPicker } from "./WeekPicker"
import { useCalendarSelection } from "../hooks/useCalendarSelection"
import { useCalendarDnD } from "../hooks/useCalendarDnD"
import { useDraftGeneration } from "../hooks/useDraftGeneration"
import { BulkActionToolbar } from "./BulkActionToolbar"
import { OrganicDraftPreview } from "./OrganicDraftPreview"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

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
  } = useCalendarStore()

  const {
    selectedId,
    selectedIds,
    handleSelect,
    clearAll,
    handleKeyDown,
  } = useCalendarSelection(calendarDays, unscheduledDrafts)

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
  const assignmentDays = React.useMemo(
    () =>
      calendarDays.map((day) => ({
        id: day.id,
        label: day.label,
        dateLabel: day.dateLabel,
        draftCount: day.slots.length,
      })),
    [calendarDays]
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
    trends,
    platformAccountIds,
    activePlatforms,
    weekStartId,
  })

  const handleBulkDelete = React.useCallback(() => {
    bulkDeleteDrafts(selectedIds)
    clearAll()
  }, [bulkDeleteDrafts, selectedIds, clearAll])

  const handleBulkMove = React.useCallback(() => {
    bulkMoveDrafts(selectedIds, calendarDays[0]?.id)
    clearAll()
  }, [bulkMoveDrafts, selectedIds, calendarDays, clearAll])

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
        <div className="grid h-full min-h-0 w-full gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/30 p-2">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-2">
              <div className="min-w-0 space-y-1">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-800">
                  Weekly Calendar
                </p>
                <p className="text-xs text-slate-700">
                  Drag selected trends into day columns to seed generation targets.
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
            <div className="min-h-0 flex-1">
              <TimeGridCanvas
                days={calendarDays}
                selectedDraftId={selectedId}
                selectedDraftIds={selectedIds}
                onSelectDraft={(id) => handleSelect(id, false)}
                onToggleSelection={(id) => handleSelect(id, true)}
                onRegenerate={handleRegenerate}
                onNativeDrop={handleNativeDrop}
              />
            </div>
          </section>

          <aside className="h-full min-h-0 rounded-xl border border-slate-700/70 bg-slate-950/30 py-2">
            <WorkspacePanel
              trendTypes={trendTypes}
              trends={trends}
              selectedTrendIds={selectedTrendIds}
              activePlatforms={activePlatforms}
              maxTrendSelections={maxTrendSelections}
              onToggleTrend={(id) => toggleTrend(id, maxTrendSelections)}
              onGenerateGrid={handleGenerateGridJob}
              onAutoSort={handleAutoSort}
              onClearAll={clearCalendar}
              onSelectDraft={(id) => handleSelect(id, false)}
              onToggleSelection={(id) => handleSelect(id, true)}
              selectedDraftId={selectedId}
              selectedDraftIds={selectedIds}
              unscheduledDrafts={unscheduledDrafts}
              allDrafts={drafts}
              seedCount={seededDraftCount}
              gridStatus={gridStatus}
              mode="generation"
              assignmentDays={assignmentDays}
            />
          </aside>
        </div>

        <Sheet
          open={Boolean(selectedDraft)}
          onOpenChange={(open) => {
            if (!open) {
              clearAll()
            }
          }}
        >
          <SheetContent
            side="right"
            className="w-[min(96vw,56rem)] gap-0 border-slate-300 bg-white p-0 sm:max-w-[56rem]"
          >
            {selectedDraft ? (
              <>
                <SheetHeader className="border-b border-slate-300 px-5 py-4">
                  <SheetTitle className="text-slate-900">Post Editor</SheetTitle>
                  <SheetDescription className="text-slate-700">
                    Refine copy, platform, format, and CTA for the selected card.
                  </SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 p-4">
                  <OrganicDraftPreview draft={selectedDraft} />
                </div>
              </>
            ) : null}
          </SheetContent>
        </Sheet>
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
