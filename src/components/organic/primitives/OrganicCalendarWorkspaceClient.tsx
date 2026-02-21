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
import { GenerationProgressPanel } from "./GenerationProgressPanel"
import { EventStreamPanel } from "./EventStreamPanel"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

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
    gridProgress,
    gridError,
    eventHistory,
    clearEventHistory,
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
      className="h-[calc(100vh-6rem)] overflow-hidden focus:outline-none"
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
        <ResizablePanelGroup direction="horizontal" className="h-full gap-2 p-2">
          <ResizablePanel defaultSize={68} minSize={52}>
            <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800/80 bg-gradient-to-b from-slate-950 to-slate-900 p-2">
            <div className="flex items-center justify-between gap-4 px-1 pb-3">
              <div className="space-y-1">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-300">
                  Week Planning
                </p>
                <p className="text-xs text-slate-400">
                  Weekly calendar placement for Instagram, Facebook, and LinkedIn.
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
              selectedDraftId={selectedId}
              selectedDraftIds={selectedIds}
              onSelectDraft={(id) => handleSelect(id, false)}
              onToggleSelection={(id) => handleSelect(id, true)}
              onRegenerate={handleRegenerate}
              onNativeDrop={handleNativeDrop}
            />

            <div className="mt-3 space-y-3">
              <GenerationProgressPanel
                status={gridStatus}
                percent={gridProgress.percent}
                message={gridProgress.message}
                error={gridError}
              />

              {eventHistory.length > 0 && (
                <EventStreamPanel
                  events={eventHistory}
                  onClear={clearEventHistory}
                  onPlacementSelect={(id) => handleSelect(id, false)}
                />
              )}
            </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={32} minSize={24} maxSize={42}>
            <aside className="h-full rounded-xl border border-slate-800/80 bg-slate-950/80">
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
              />
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
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
