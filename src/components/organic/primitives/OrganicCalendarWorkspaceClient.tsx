"use client"

import * as React from "react"
import {
  CheckIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  LightningBoltIcon,
  MixerHorizontalIcon,
  RocketIcon,
} from "@radix-ui/react-icons"
import * as AccordionPrimitive from "@radix-ui/react-accordion"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Progress } from "@/components/ui/progress"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import { GlassPanel } from "@/components/ui/GlassPanel"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs } from "@/components/ui/StableTabs"
import { cn } from "@/lib/utils"
import { TrendSelector } from "@/components/organic/TrendSelector"
import type { Trend } from "@/lib/organic/trends"
import { ORGANIC_PLATFORM_KEYS, type OrganicPlatformKey } from "@/lib/organic/platforms"
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCreationStep,
  OrganicDraftCreateRequest,
  OrganicEditorSlide,
  OrganicPlatformTag,
  OrganicTrendType,
} from "./types"
import { useCalendarStore, type GridSlot, type GridStatus, type WeeklyGrid } from "@/lib/organic/store"
import { moveDraftToDay } from "./calendar-utils"

type WorkspaceMode = "week" | "month"

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

const platformStyles: Record<OrganicPlatformTag, string> = {
  instagram: "border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-100",
  linkedin: "border-sky-500/30 bg-sky-500/15 text-sky-100",
}

const statusStyles: Record<OrganicCalendarDraft["status"], string> = {
  draft: "border-muted bg-muted/60 text-muted-foreground",
  scheduled: "border-emerald-500/30 bg-emerald-500/15 text-emerald-100",
  streaming: "border-amber-500/30 bg-amber-500/15 text-amber-100",
  placeholder: "border-indigo-500/30 bg-indigo-500/15 text-indigo-100",
}

const statusLabels: Record<OrganicCalendarDraft["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  streaming: "Streaming",
  placeholder: "Queued",
}

const workflowStepOrder = ["trends", "competitors", "agent", "composer"] as const

type WorkflowStepId = (typeof workflowStepOrder)[number]

type WorkflowStepState = {
  id: WorkflowStepId
  title: string
  detail: string
  status: "complete" | "active" | "upcoming"
}

type MonthCell = {
  id: string
  label: string
  isCurrentMonth: boolean
  drafts: OrganicCalendarDraft[]
}

type DetailedPostTemplate = {
  slotId: string
  schedule: GridSlot["schedule"]
  platform: GridSlot["platform"]
  strategy: GridSlot["strategy"]
  contentPlan: GridSlot["contentPlan"]
  creative?: {
    creativeIdea?: string | null
    narrative?: {
      hook?: string | null
      interrupt?: string | null
      context?: string | null
      openLoop?: string | null
      explanation?: string | null
      value?: string | null
      cta?: string | null
      slideBySlideBreakdown?: string[] | null
    } | null
  } | null
  copy?: {
    caption?: string | null
    hashtags?: {
      high?: string[] | null
      medium?: string[] | null
      low?: string[] | null
    } | null
  } | null
  localization?: {
    language?: string | null
  } | null
}

type GridProgressPayload = {
  status?: string
  message?: string
  completed?: number
  failed?: number
  running?: number
  total?: number
  percent?: number
}

const DEFAULT_PROMPT = {
  id: "organic-default",
  name: "Organic default",
  description: "Continuum organic planning prompt.",
  content: "Generate a week of organic social drafts for the connected platforms.",
  source: "default",
} as const

function formatDateId(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

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

function getMonthContext(days: OrganicCalendarDay[]) {
  const fallback = new Date(2026, 0, 1)
  const first = days[0]?.id ? new Date(`${days[0].id}T00:00:00`) : fallback
  return {
    year: first.getFullYear(),
    month: first.getMonth(),
  }
}

function buildMonthGrid(days: OrganicCalendarDay[]): MonthCell[] {
  const { year, month } = getMonthContext(days)
  const firstOfMonth = new Date(year, month, 1)
  const startDay = firstOfMonth.getDay()
  const gridStart = new Date(year, month, 1 - startDay)
  const draftsByDate = days.reduce<Record<string, OrganicCalendarDraft[]>>((acc, day) => {
    acc[day.id] = day.slots
    return acc
  }, {})

  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    const id = formatDateId(date)
    return {
      id,
      label: String(date.getDate()),
      isCurrentMonth: date.getMonth() === month,
      drafts: draftsByDate[id] ?? [],
    }
  })
}

function PlatformBadge({ platform }: { platform: OrganicPlatformTag }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        platformStyles[platform]
      )}
    >
      {platform === "instagram" ? "IG" : "LinkedIn"}
    </span>
  )
}

function StatusBadge({ status }: { status: OrganicCalendarDraft["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        statusStyles[status]
      )}
    >
      {statusLabels[status]}
    </span>
  )
}

function PeekModal({
  draft,
  onClose,
}: {
  draft: OrganicCalendarDraft
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <GlassPanel className="p-0 overflow-hidden shadow-2xl border-brand-primary/20">
          <div className="flex flex-col md:flex-row">
            <div className="md:w-1/2 aspect-square bg-slate-900 flex items-center justify-center">
              {draft.mediaCount > 0 ? (
                <div className="w-full h-full bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 flex items-center justify-center text-secondary">
                  <MixerHorizontalIcon className="w-12 h-12 opacity-20" />
                </div>
              ) : (
                <span className="text-secondary opacity-40">No media</span>
              )}
            </div>
            <div className="md:w-1/2 p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <StatusBadge status={draft.status} />
                <Button variant="ghost" size="icon-sm" onClick={onClose}>
                  <MixerHorizontalIcon className="rotate-45" />
                </Button>
              </div>
              <div>
                <h3 className="text-xl font-bold text-primary">{draft.title}</h3>
                <p className="text-sm text-secondary mt-1">{draft.dateLabel} • {draft.timeLabel}</p>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <p className="text-sm text-primary leading-relaxed whitespace-pre-wrap">
                  {draft.captionPreview}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {draft.tags.map(tag => (
                  <span key={tag} className="text-xs text-brand-primary">#{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </GlassPanel>
      </div>
    </div>
  )
}

function WorkflowStepper({ steps }: { steps: WorkflowStepState[] }) {
  return (
    <div className="grid gap-2 sm:gap-3">
      {steps.map((step) => {
        const isComplete = step.status === "complete"
        const isActive = step.status === "active"
        return (
          <div
            key={step.id}
            className="flex items-start gap-3 rounded-lg border border-subtle bg-surface/60 p-2 sm:p-3"
          >
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border sm:h-8 sm:w-8",
                isComplete && "border-emerald-500/40 bg-emerald-500/20 text-emerald-100",
                isActive && "border-brand-primary/50 bg-brand-primary/20 text-primary",
                !isComplete && !isActive && "border-subtle bg-default text-secondary"
              )}
            >
              {isComplete ? <CheckIcon /> : isActive ? <LightningBoltIcon /> : <ChevronRightIcon />}
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">{step.title}</p>
              <p className="text-xs text-secondary">{step.detail}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DraftHoverCardContent({ draft }: { draft: OrganicCalendarDraft }) {
  return (
    <HoverCardContent side="right" align="start" className="w-[320px]">
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <StatusBadge status={draft.status} />
            <span className="text-xs text-secondary">{draft.dateLabel}</span>
          </div>
          <p className="text-sm font-semibold text-primary">{draft.title}</p>
          <p className="text-xs text-secondary">{draft.summary}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: Math.max(3, draft.mediaCount || 1) }).map((_, index) => (
            <div
              key={`${draft.id}-preview-${index}`}
              className="aspect-square rounded-lg border border-subtle bg-gradient-to-br from-slate-900/70 via-slate-800/60 to-indigo-500/40"
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {draft.platforms.map((platform) => (
            <PlatformBadge key={`${draft.id}-${platform}`} platform={platform} />
          ))}
          <span className="text-xs text-secondary">{draft.format}</span>
          <span className="text-xs text-secondary">Objective: {draft.objective}</span>
        </div>
        {typeof draft.progress === "number" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-secondary">
              <span>Agent reception</span>
              <span>{draft.progress}%</span>
            </div>
            <Progress value={draft.progress} />
          </div>
        ) : null}
      </div>
    </HoverCardContent>
  )
}

function CalendarDraftCard({
  draft,
  isSelected,
  isMultiSelected,
  onSelect,
  onToggleSelection,
  onDragStart,
  onRegenerate,
}: {
  draft: OrganicCalendarDraft
  isSelected: boolean
  isMultiSelected: boolean
  onSelect: (id: string) => void
  onToggleSelection: (id: string) => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, draftId: string) => void
  onRegenerate?: (draftId: string) => void
}) {
  return (
    <HoverCard openDelay={250} closeDelay={120}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <HoverCardTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                if (e.shiftKey) {
                  onToggleSelection(draft.id)
                } else {
                  onSelect(draft.id)
                }
              }}
              draggable
              onDragStart={(event) => onDragStart(event, draft.id)}
              aria-selected={isSelected}
              className={cn(
                "group relative w-full rounded-lg border px-3 py-2 text-left transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                isSelected
                  ? "border-2 border-brand-primary bg-brand-primary/15 shadow-brand-glow"
                  : isMultiSelected
                  ? "border-2 border-brand-primary/50 bg-brand-primary/5"
                  : "border-subtle bg-surface/70 hover:border-brand-primary/50 hover:bg-surface",
                draft.status === "placeholder" && "opacity-80"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-secondary">
                  {draft.timeLabel}
                </span>
                <div className="flex items-center gap-1">
                  {isMultiSelected && (
                    <div className="w-3 h-3 bg-brand-primary rounded-full flex items-center justify-center">
                      <CheckIcon className="w-2 h-2 text-white" />
                    </div>
                  )}
                  {onRegenerate && draft.status !== "streaming" && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRegenerate(draft.id);
                      }}
                    >
                      <LightningBoltIcon className="h-3 w-3" />
                    </Button>
                  )}
                  <StatusBadge status={draft.status} />
                </div>
              </div>
              <p className="mt-1 text-sm font-semibold text-primary line-clamp-2">
                {draft.title}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {draft.platforms.map((platform) => (
                  <PlatformBadge key={`${draft.id}-${platform}`} platform={platform} />
                ))}
              </div>
              {typeof draft.progress === "number" ? (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-secondary">
                    <span>Streaming</span>
                    <span>{draft.progress}%</span>
                  </div>
                  <Progress value={draft.progress} />
                </div>
              ) : null}
            </button>
          </HoverCardTrigger>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>Draft actions</ContextMenuLabel>
          <ContextMenuItem onSelect={() => onSelect(draft.id)}>Open composer</ContextMenuItem>
          <ContextMenuItem>Duplicate draft</ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>Tomorrow</ContextMenuItem>
              <ContextMenuItem>Next week</ContextMenuItem>
              <ContextMenuItem>Backlog</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem className="text-destructive focus:text-destructive">
            Unschedule
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <DraftHoverCardContent draft={draft} />
    </HoverCard>
  )
}

function UnscheduledSidebar({
  drafts,
  selectedDraftId,
  selectedDraftIds,
  onSelectDraft,
  onToggleSelection,
  onMoveDraft,
  onRegenerate,
}: {
  drafts: OrganicCalendarDraft[]
  selectedDraftId: string | null
  selectedDraftIds: string[]
  onSelectDraft: (id: string) => void
  onToggleSelection: (id: string) => void
  onMoveDraft: (draftId: string, targetDayId: string | "unscheduled") => void
  onRegenerate: (draftId: string) => void
}) {
  const [isDragOver, setIsDragOver] = React.useState(false)

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-subtle bg-surface/40 p-3 transition min-h-[200px]",
        isDragOver && "border-brand-primary/50 bg-brand-primary/10"
      )}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
      }}
      onDragEnter={() => setIsDragOver(true)}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragOver(false)
        const draftId = e.dataTransfer.getData("text/plain")
        if (draftId) onMoveDraft(draftId, "unscheduled")
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-secondary font-semibold">Ideas / Unscheduled</p>
        <span className="rounded-full border border-subtle bg-default px-2 py-0.5 text-[10px] text-secondary">
          {drafts.length}
        </span>
      </div>
      <div className="grid gap-3">
        {drafts.map((draft) => (
          <CalendarDraftCard
            key={draft.id}
            draft={draft}
            isSelected={draft.id === selectedDraftId}
            isMultiSelected={selectedDraftIds.includes(draft.id)}
            onSelect={onSelectDraft}
            onToggleSelection={onToggleSelection}
            onDragStart={(event, id) => {
              event.dataTransfer.setData("text/plain", id)
              event.dataTransfer.effectAllowed = "move"
            }}
            onRegenerate={onRegenerate}
          />
        ))}
        {drafts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-subtle rounded-lg opacity-60">
            <p className="text-[11px] text-secondary">No unscheduled drafts.</p>
            <p className="text-[10px] text-secondary">Drag here to unschedule.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function BulkActionBar({
  selectedIds,
  onClear,
  onBulkApprove,
  onBulkExpand,
}: {
  selectedIds: string[]
  onClear: () => void
  onBulkApprove: () => void
  onBulkExpand: () => void
}) {
  if (selectedIds.length === 0) return null

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
      <GlassPanel className="flex items-center gap-4 px-6 py-3 shadow-2xl border-brand-primary/30">
        <div className="flex items-center gap-2 pr-4 border-r border-subtle">
          <span className="text-sm font-bold text-primary">{selectedIds.length}</span>
          <span className="text-xs text-secondary uppercase tracking-wider">Selected</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onBulkExpand}>
            <LightningBoltIcon /> Expand Details
          </Button>
          <Button size="sm" onClick={onBulkApprove}>
            <CheckIcon /> Approve All
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            Cancel
          </Button>
        </div>
      </GlassPanel>
    </div>
  )
}

function CalendarDayColumn({
  day,
  selectedDraftId,
  selectedDraftIds,
  onSelectDraft,
  onToggleSelection,
  onMoveDraft,
  onCreateDraft,
  onGenerateFromTrend,
  onRegenerate,
}: {
  day: OrganicCalendarDay
  selectedDraftId: string | null
  selectedDraftIds: string[]
  onSelectDraft: (id: string) => void
  onToggleSelection: (id: string) => void
  onMoveDraft: (draftId: string, targetDayId: string) => void
  onCreateDraft: (dayId: string, timeOfDay?: string) => void
  onGenerateFromTrend: (dayId: string, trendId: string, timeOfDay?: string) => void
  onRegenerate: (draftId: string) => void
}) {
  const visibleDrafts = day.slots.slice(0, 2)
  const hiddenCount = Math.max(day.slots.length - visibleDrafts.length, 0)
  const [isDragOver, setIsDragOver] = React.useState(false)
  const isSelectedDay = Boolean(selectedDraftId && day.slots.some((draft) => draft.id === selectedDraftId))

  const ghosts = useCalendarStore((s) => s.ghosts[day.id] || 0)

  return (
    <div
      className={cn(
        "relative flex h-full flex-col gap-3 overflow-hidden rounded-lg border border-subtle bg-surface/60 p-3 transition",
        isDragOver && "border-brand-primary/50 bg-brand-primary/10",
        isSelectedDay && "border-brand-primary/40 bg-brand-primary/5"
      )}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
      }}
      onDragEnter={() => setIsDragOver(true)}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setIsDragOver(false)
        
        try {
          const rawData = event.dataTransfer.getData("application/json")
          if (rawData) {
            const data = JSON.parse(rawData)
            if (data.type === "trend") {
              onGenerateFromTrend(day.id, data.trendId)
              return
            }
          }
        } catch (e) {}

        const draftId = event.dataTransfer.getData("text/plain")
        if (draftId) {
          onMoveDraft(draftId, day.id)
        }
      }}
    >
      <div className="absolute inset-3 pointer-events-none rounded-lg border border-dashed border-subtle opacity-40">
        <div className="h-full">
          <div className="h-1/3 border-b border-dashed border-subtle" />
          <div className="h-1/3 border-b border-dashed border-subtle" />
        </div>
      </div>
      <div className="relative z-10 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-primary">{day.label}</p>
          <p className="text-xs text-secondary">{day.dateLabel}</p>
        </div>
        <div className="rounded-full border border-subtle bg-default px-2 py-0.5 text-[10px] text-secondary">
          {day.slots.length} slots
        </div>
      </div>
      <div className="relative z-10 flex flex-wrap gap-1">
        {["morning", "afternoon", "evening"].map((time) => (
          <button
            key={`${day.id}-${time}`}
            onClick={() => onCreateDraft(day.id, time)}
            className="group relative rounded-full border border-subtle bg-default px-2 py-0.5 text-[10px] text-secondary hover:border-brand-primary/50 hover:text-primary transition-colors"
          >
            {time}
            <span className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 bg-brand-primary text-white rounded-full w-3 h-3 flex items-center justify-center text-[8px]">
              +
            </span>
          </button>
        ))}
      </div>
      <div className="relative z-10 flex flex-col gap-3">
        {visibleDrafts.map((draft, index) => {
          const hasConflict = day.slots.some((s, i) => i !== index && s.timeLabel === draft.timeLabel)
          return (
            <div key={draft.id} className="relative">
              <CalendarDraftCard
                draft={draft}
                isSelected={draft.id === selectedDraftId}
                isMultiSelected={selectedDraftIds.includes(draft.id)}
                onSelect={onSelectDraft}
                onToggleSelection={onToggleSelection}
                onDragStart={(event, draftId) => {
                  event.dataTransfer.setData("text/plain", draftId)
                  event.dataTransfer.effectAllowed = "move"
                }}
                onRegenerate={onRegenerate}
              />
              {hasConflict && (
                <div className="absolute -top-1 -right-1 z-20 bg-amber-500 text-white text-[8px] px-1 rounded-full border border-white font-bold animate-pulse">
                  CONFLICT
                </div>
              )}
            </div>
          )
        })}
        {Array.from({ length: ghosts }).map((_, i) => (
          <div key={`ghost-${i}`} className="w-full rounded-lg border border-dashed border-subtle bg-default/20 px-3 py-4 animate-pulse">
            <div className="h-3 w-1/3 bg-subtle rounded mb-2" />
            <div className="h-4 w-3/4 bg-subtle rounded" />
          </div>
        ))}
      </div>
      {hiddenCount > 0 ? (
        <span className="text-xs text-secondary">+{hiddenCount} more drafts</span>
      ) : null}
      <button
        type="button"
        onClick={() => onCreateDraft(day.id)}
        className="relative z-10 mt-auto rounded-lg border border-dashed border-subtle bg-default/30 px-3 py-2 text-xs font-medium text-secondary transition hover:border-brand-primary/50 hover:text-primary"
      >
        Add slot
      </button>
    </div>
  )
}

function WeekCanvas({
  days,
  selectedDraftId,
  selectedDraftIds,
  onSelectDraft,
  onToggleSelection,
  onBuild,
  onMoveDraft,
  onCreateDraft,
  onGenerateFromTrend,
  onRegenerate,
}: {
  days: OrganicCalendarDay[]
  selectedDraftId: string | null
  selectedDraftIds: string[]
  onSelectDraft: (id: string) => void
  onToggleSelection: (id: string) => void
  onBuild: () => void
  onMoveDraft: (draftId: string, targetDayId: string | "unscheduled") => void
  onCreateDraft: (dayId: string, timeOfDay?: string) => void
  onGenerateFromTrend: (dayId: string, trendId: string, timeOfDay?: string) => void
  onRegenerate: (draftId: string) => void
}) {
  const hasDrafts = days.some((day) => day.slots.length > 0)

  return (
    <GlassPanel className="flex h-full flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-secondary">Calendar view</p>
          <h2 className="text-xl font-semibold text-primary">January 2026</h2>
        </div>
      </div>
      {hasDrafts ? (
        <div className="relative flex-1 min-h-0 rounded-lg border border-subtle bg-default/20 p-3">
          <div className="grid h-full gap-3 lg:grid-cols-7">
            {days.map((day) => (
            <CalendarDayColumn
              key={day.id}
              day={day}
              selectedDraftId={selectedDraftId}
              selectedDraftIds={selectedDraftIds}
              onSelectDraft={onSelectDraft}
              onToggleSelection={onToggleSelection}
              onMoveDraft={onMoveDraft}
              onCreateDraft={onCreateDraft}
              onGenerateFromTrend={onGenerateFromTrend}
              onRegenerate={onRegenerate}
            />
          ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-subtle bg-default/30 text-center">
          <p className="text-sm font-semibold text-primary">No drafts scheduled yet</p>
          <p className="mt-2 text-xs text-secondary">
            Build a workflow to generate the first batch of drafts.
          </p>
          <Button className="mt-4" onClick={onBuild}>
            <RocketIcon /> Build
          </Button>
        </div>
      )}
    </GlassPanel>
  )
}

function MonthCanvas({
  days,
  selectedDraftId,
  onSelectDraft,
}: {
  days: OrganicCalendarDay[]
  selectedDraftId: string | null
  onSelectDraft: (id: string) => void
}) {
  const monthCells = React.useMemo(() => buildMonthGrid(days), [days])
  const selectedDay = React.useMemo(
    () => days.find((day) => day.slots.some((draft) => draft.id === selectedDraftId)) ?? null,
    [days, selectedDraftId]
  )
  const { year, month } = getMonthContext(days)
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month, 1))

  return (
    <GlassPanel className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-secondary">Month view</p>
          <h2 className="text-xl font-semibold text-primary">{monthLabel}</h2>
        </div>
        {selectedDay ? (
          <span className="rounded-full border border-brand-primary/40 bg-brand-primary/10 px-2 py-0.5 text-[11px] text-primary">
            Selected: {selectedDay.label} {selectedDay.dateLabel}
          </span>
        ) : null}
      </div>
      <div className="grid flex-1 min-h-0 grid-cols-7 gap-3">
        {monthCells.map((cell) => (
          <div
            key={cell.id}
            className={cn(
              "rounded-lg border border-subtle p-2 text-xs transition",
              cell.isCurrentMonth ? "bg-surface/70" : "bg-default/20 text-secondary",
              selectedDraftId && cell.drafts.some((draft) => draft.id === selectedDraftId)
                ? "border-brand-primary/60 bg-brand-primary/10 shadow-brand-glow"
                : ""
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold">{cell.label}</span>
              {cell.drafts.length > 0 ? (
                <span className="rounded-full border border-subtle bg-default px-2 py-0.5 text-[10px] text-secondary">
                  {cell.drafts.length}
                </span>
              ) : null}
            </div>
            <div className="mt-2 space-y-1">
              {cell.drafts.slice(0, 2).map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => onSelectDraft(draft.id)}
                  className="block w-full truncate rounded-md border border-subtle bg-default/60 px-2 py-1 text-left text-[11px] text-primary hover:border-brand-primary/50"
                >
                  {draft.title}
                </button>
              ))}
              {cell.drafts.length > 2 ? (
                <span className="text-[10px] text-secondary">+{cell.drafts.length - 2} more</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}

function EditorPreview({
  slides,
  compact = false,
}: {
  slides: OrganicEditorSlide[]
  compact?: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg border border-subtle bg-surface/80">
        <Carousel className="w-full">
          <CarouselContent>
            {slides.map((slide) => (
              <CarouselItem key={slide.id}>
                <div
                  className={cn(
                    "w-full bg-gradient-to-br",
                    compact ? "aspect-[3/4] p-3" : "aspect-[4/5] p-4",
                    slide.gradient
                  )}
                >
                  <div className={cn(
                    "flex h-full flex-col justify-between rounded-xl border border-white/10 bg-black/30",
                    compact ? "p-3" : "p-4"
                  )}>
                    <span className="text-xs uppercase tracking-[0.2em] text-white/70">
                      {slide.label}
                    </span>
                    <span className="text-sm text-white">Headline placeholder</span>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="bg-default/70" />
          <CarouselNext className="bg-default/70" />
        </Carousel>
      </div>
      {!compact ? (
        <div className="grid grid-cols-5 gap-2">
          {slides.slice(0, 5).map((slide) => (
            <div
              key={`${slide.id}-thumb`}
              className={cn(
                "aspect-square rounded-lg border border-subtle bg-gradient-to-br",
                slide.gradient
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function DraftDetailPanel({
  draft,
  slides,
}: {
  draft: OrganicCalendarDraft
  slides: OrganicEditorSlide[]
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-brand-primary/40 bg-brand-primary/5 p-3 shadow-brand-glow sm:p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-secondary">Draft details</p>
            <p className="text-lg font-semibold text-primary">{draft.title}</p>
          </div>
          <StatusBadge status={draft.status} />
        </div>
        <p className="mt-2 text-sm text-secondary">{draft.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {draft.platforms.map((platform) => (
            <PlatformBadge key={`${draft.id}-detail-${platform}`} platform={platform} />
          ))}
          <span className="rounded-full border border-subtle bg-default px-2 py-0.5 text-[10px] text-secondary">
            {draft.format}
          </span>
          <span className="rounded-full border border-subtle bg-default px-2 py-0.5 text-[10px] text-secondary">
            {draft.objective}
          </span>
        </div>
      </div>
      <div className="rounded-lg border border-subtle bg-surface/70 p-3 sm:p-4">
        <div className="flex items-center justify-between text-xs text-secondary">
          <span>Schedule</span>
          <span>{draft.timeLabel}</span>
        </div>
        <p className="mt-2 text-sm text-primary">{draft.dateLabel}</p>
        {typeof draft.progress === "number" ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-secondary">
              <span>Agent reception</span>
              <span>{draft.progress}%</span>
            </div>
            <Progress value={draft.progress} />
          </div>
        ) : null}
      </div>
      <div className="rounded-lg border border-subtle bg-surface/70 p-3 sm:p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-secondary">Preview</p>
        <div className="mt-3">
          <EditorPreview slides={slides} compact />
        </div>
      </div>
    </div>
  )
}

const momentumStyles: Record<OrganicTrendType["groups"][number]["trends"][number]["momentum"], string> = {
  rising: "border-emerald-500/30 bg-emerald-500/15 text-emerald-100",
  stable: "border-slate-500/30 bg-slate-500/15 text-slate-100",
  cooling: "border-amber-500/30 bg-amber-500/15 text-amber-100",
}

const momentumLabels: Record<OrganicTrendType["groups"][number]["trends"][number]["momentum"], string> = {
  rising: "Rising",
  stable: "Stable",
  cooling: "Cooling",
}

function TrendRow({ trend }: { trend: OrganicTrendType["groups"][number]["trends"][number] }) {
  return (
    <HoverCard openDelay={200} closeDelay={120}>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-subtle bg-default/40 px-2 py-2">
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="text-left text-xs font-semibold text-primary hover:text-primary/90"
          >
            {trend.title}
          </button>
        </HoverCardTrigger>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <MixerHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Trend actions</DropdownMenuLabel>
            <DropdownMenuItem>Add to plan</DropdownMenuItem>
            <DropdownMenuItem>Pin to top</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              Ignore
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <HoverCardContent side="right" align="start" className="w-[260px]">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-primary">{trend.title}</span>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                momentumStyles[trend.momentum]
              )}
            >
              {momentumLabels[trend.momentum]}
            </span>
          </div>
          <p className="text-xs text-secondary">{trend.summary}</p>
          <div className="flex flex-wrap gap-1">
            {trend.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-subtle bg-default px-2 py-0.5 text-[10px] text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

function TrendsPanel({
  trendTypes,
  trends,
  activePlatforms,
  selectedTrendIds,
  maxTrendSelections,
  onToggleTrend,
}: {
  trendTypes: OrganicTrendType[]
  trends: Trend[]
  activePlatforms: OrganicPlatformKey[]
  selectedTrendIds: string[]
  maxTrendSelections?: number
  onToggleTrend: (trendId: string) => void
}) {
  const defaultTrendTab = trendTypes[0]?.id ?? "industry"
  const [activeTrendTab, setActiveTrendTab] = React.useState(defaultTrendTab)
  const [view, setView] = React.useState<"signals" | "selections">("signals")

  return (
    <div>
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-secondary">Trends</p>
        <p className="text-sm font-semibold text-primary sm:text-base">Signal explorer</p>
      </div>
      <Tabs.Root
        value={view}
        onValueChange={(value) => setView(value as typeof view)}
        activationMode="manual"
        className="mt-3"
      >
        <Tabs.List className="flex flex-wrap gap-2 rounded-full border border-subtle bg-surface/70 p-1">
          <Tabs.Trigger
            value="signals"
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold text-secondary transition",
              "data-[state=active]:bg-brand-primary/20 data-[state=active]:text-primary"
            )}
          >
            Signals
          </Tabs.Trigger>
          <Tabs.Trigger
            value="selections"
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold text-secondary transition",
              "data-[state=active]:bg-brand-primary/20 data-[state=active]:text-primary"
            )}
          >
            Selections
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="signals" className="mt-3">
          {trendTypes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-subtle bg-default/30 p-4 text-xs text-secondary">
              No trend signals yet. Connect sources to surface momentum.
            </div>
          ) : (
            <Tabs.Root
              value={activeTrendTab}
              onValueChange={setActiveTrendTab}
              activationMode="manual"
            >
              <Tabs.List className="flex flex-wrap gap-2 rounded-full border border-subtle bg-surface/70 p-1">
                {trendTypes.map((trendType) => (
                  <Tabs.Trigger
                    key={trendType.id}
                    value={trendType.id}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold text-secondary transition",
                      "data-[state=active]:bg-brand-primary/20 data-[state=active]:text-primary"
                    )}
                  >
                    {trendType.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              {trendTypes.map((trendType) => (
                <Tabs.Content key={trendType.id} value={trendType.id} className="mt-3">
                  <AccordionPrimitive.Root
                    type="multiple"
                    defaultValue={trendType.groups.map((group) => group.id)}
                    className="space-y-2"
                  >
                    {trendType.groups.map((group) => (
                      <AccordionPrimitive.Item
                        key={group.id}
                        value={group.id}
                        className="rounded-lg border border-subtle bg-surface/70"
                      >
                        <AccordionPrimitive.Header>
                          <AccordionPrimitive.Trigger className="group flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-primary">
                            {group.title}
                            <ChevronDownIcon className="transition-transform group-data-[state=open]:rotate-180" />
                          </AccordionPrimitive.Trigger>
                        </AccordionPrimitive.Header>
                        <AccordionPrimitive.Content className="px-3 pb-3">
                          <div className="grid gap-2">
                            {group.trends.map((trend) => (
                              <TrendRow key={trend.id} trend={trend} />
                            ))}
                          </div>
                        </AccordionPrimitive.Content>
                      </AccordionPrimitive.Item>
                    ))}
                  </AccordionPrimitive.Root>
                </Tabs.Content>
              ))}
            </Tabs.Root>
          )}
        </Tabs.Content>

        <Tabs.Content value="selections" className="mt-3">
          <TrendSelector
            trends={trends}
            selectedTrendIds={selectedTrendIds}
            activePlatforms={activePlatforms}
            maxSelections={maxTrendSelections}
            onToggleTrend={onToggleTrend}
            withContainer={false}
            showHeader={false}
            className="space-y-3"
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}

function DraftsDataGrid({
  drafts,
  selectedDraftId,
  onSelectDraft,
}: {
  drafts: OrganicCalendarDraft[]
  selectedDraftId: string | null
  onSelectDraft: (id: string) => void
}) {
  const visibleDrafts = drafts.slice(0, 6)

  return (
    <div className="rounded-lg border border-subtle bg-default/40 p-2 sm:p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-secondary">All drafts</p>
          <p className="text-sm font-semibold text-primary">{drafts.length} items</p>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-subtle bg-surface/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase tracking-wide text-secondary">Draft</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wide text-secondary">Status</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wide text-secondary">Platforms</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wide text-secondary">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleDrafts.map((draft) => (
              <TableRow
                key={draft.id}
                className={cn(
                  "cursor-pointer hover:bg-default/60",
                  draft.id === selectedDraftId && "bg-brand-primary/10"
                )}
                aria-selected={draft.id === selectedDraftId}
                onClick={() => onSelectDraft(draft.id)}
              >
                <TableCell
                  className={cn(
                    draft.id === selectedDraftId && "border-l-2 border-brand-primary pl-3"
                  )}
                >
                  <p className="text-xs font-semibold text-primary line-clamp-1">
                    {draft.title}
                  </p>
                  <p className="text-[11px] text-secondary line-clamp-1">
                    {draft.summary}
                  </p>
                </TableCell>
                <TableCell>
                  <StatusBadge status={draft.status} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {draft.platforms.map((platform) => (
                      <PlatformBadge key={`${draft.id}-grid-${platform}`} platform={platform} />
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-xs text-primary">{draft.timeLabel}</p>
                  <p className="text-[11px] text-secondary">{draft.dateLabel}</p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {drafts.length > visibleDrafts.length ? (
        <p className="mt-2 text-xs text-secondary">+{drafts.length - visibleDrafts.length} more drafts</p>
      ) : null}
    </div>
  )
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
    clearDraftSelection,
    selectedTrendIds,
    gridStatus,
    setGridStatus,
    gridProgress,
    setGridProgress,
    gridError,
    setGridError,
    gridJobId,
    setGridJobId,
    addDraft,
    moveDraft,
    updateDraft: updateDraftById,
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
  const hasDrafts = drafts.length > 0
  const [mode, setMode] = React.useState<WorkspaceMode>("week")

  const [activeStepIndex, setActiveStepIndex] = React.useState(() =>
    hasDrafts ? 2 : 0
  )
  const [gridSlots, setGridSlots] = React.useState<GridSlot[]>([])
  const [detailsStatus, setDetailsStatus] = React.useState<"idle" | "running" | "complete" | "error">("idle")
  const eventSourceRef = React.useRef<EventSource | null>(null)

  const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId) ?? null

  const workflowSteps = React.useMemo<WorkflowStepState[]>(
    () =>
      steps.map((step) => {
        const index = workflowStepOrder.indexOf(step.id as WorkflowStepId)
        const status =
          index < activeStepIndex
            ? "complete"
            : index === activeStepIndex
            ? "active"
            : "upcoming"
        return {
          id: step.id as WorkflowStepId,
          title: step.title,
          detail: step.detail,
          status,
        }
      }),
    [steps, activeStepIndex]
  )

  React.useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
      eventSourceRef.current = null
    }
  }, [])

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

  const applyTemplateToDraft = React.useCallback(
    (draft: OrganicCalendarDraft, template: DetailedPostTemplate): OrganicCalendarDraft => {
      const day = resolveDayMeta(template.schedule.dayId)
      const timeLabel = resolveTimeLabel(template.schedule.timeOfDay ?? null, day?.suggestedTimes ?? [])
      const dateLabel = day ? `${day.label}, ${day.dateLabel}` : draft.dateLabel

      return {
        ...draft,
        title: template.contentPlan.titleTopic ?? draft.title,
        summary: template.creative?.creativeIdea ?? draft.summary,
        timeLabel,
        dateLabel,
        status: "draft",
        format: template.contentPlan.format ?? draft.format,
        objective: template.strategy.objective ?? draft.objective,
        captionPreview: template.copy?.caption ?? draft.captionPreview,
        tags: template.copy?.hashtags?.high ?? draft.tags,
        mediaCount: template.contentPlan.numSlides ?? draft.mediaCount,
      }
    },
    [resolveDayMeta]
  )

  const reservePlaceholders = React.useCallback(() => {
    setCalendarDays(calendarDays.map((day) => {
        if (day.slots.some((draft) => draft.status === "placeholder")) return day
        const placeholder: OrganicCalendarDraft = {
          id: `placeholder-${day.id}-${Date.now()}`,
          title: "Reserved slot",
          summary: "Agent reception is preparing this draft.",
          timeLabel: day.suggestedTimes[0] ?? "9:00 AM",
          dateLabel: `${day.label}, ${day.dateLabel}`,
          status: "placeholder",
          platforms: ["instagram"],
          format: "Draft",
          objective: "Draft",
          captionPreview: "Awaiting generated content.",
          tags: [],
          mediaCount: 0,
        }
        return { ...day, slots: [...day.slots, placeholder] }
      })
    )
  }, [calendarDays, setCalendarDays])

  const replacePlaceholderWithSlot = React.useCallback(
    (slot: GridSlot) => {
      setCalendarDays(calendarDays.map((day) => {
          if (day.id !== slot.schedule.dayId) return day
          const draftFromSlot = buildDraftFromSlot(slot)
          const existingIndex = day.slots.findIndex((draft) => draft.id === slot.slotId)
          if (existingIndex !== -1) {
            const nextSlots = [...day.slots]
            nextSlots[existingIndex] = draftFromSlot
            return { ...day, slots: nextSlots }
          }
          const placeholderIndex = day.slots.findIndex((draft) => draft.status === "placeholder")
          if (placeholderIndex !== -1) {
            const nextSlots = [...day.slots]
            nextSlots[placeholderIndex] = draftFromSlot
            return { ...day, slots: nextSlots }
          }
          return { ...day, slots: [...day.slots, draftFromSlot] }
        })
      )
    },
    [calendarDays, setCalendarDays, buildDraftFromSlot]
  )

  const handleSelectDraft = React.useCallback(
    (id: string) => {
      setSelectedDraftId(id)
      setActiveStepIndex(3)
    },
    [setSelectedDraftId]
  )

  const handleMoveDraft = React.useCallback((draftId: string, targetDayId: string | "unscheduled") => {
    moveDraft(draftId, targetDayId)
  }, [moveDraft])

  const handleCreateDraft = React.useCallback(async (dayId: string, timeOfDay?: string) => {
    const targetDay = calendarDays.find((day) => day.id === dayId)
    if (!targetDay) return
    const accountIds = Object.values(platformAccountIds ?? {}).filter(Boolean)
    if (accountIds.length === 0) {
      setGridError("Connect a platform account before generating a slot.")
      return
    }

    const newDraft: OrganicCalendarDraft = {
      id: `draft-${Date.now()}`,
      title: "Generating draft",
      summary: "Streaming a draft for this slot.",
      timeLabel: timeOfDay ? resolveTimeLabel(timeOfDay, []) : (targetDay.suggestedTimes[0] ?? "9:00 AM"),
      dateLabel: `${targetDay.label}, ${targetDay.dateLabel}`,
      status: "streaming",
      platforms: ["instagram"],
      format: "Draft",
      objective: "Draft",
      captionPreview: "Add details to continue.",
      tags: [],
      mediaCount: 0,
    }

    setCalendarDays(calendarDays.map((day) =>
        day.id === dayId ? { ...day, slots: [...day.slots, newDraft] } : day
      )
    )

    setSelectedDraftId(newDraft.id)
    setActiveStepIndex(3)

    if (brandProfileId && userId && instagramAccountId) {
      const request: OrganicDraftCreateRequest = {
        brandProfileId,
        userId,
        instagramAccountId,
        dayId,
        trendIds: selectedTrendIds.length > 0 ? selectedTrendIds : undefined,
      }

      void request
    }

    const payload = {
      platformAccountIds,
      dayId,
      timeOfDay: timeOfDay || mapTimeOfDay(newDraft.timeLabel),
      language: "English",
      selectedTrendIds,
    }

    try {
      const response = await fetch("/api/organic/generate-slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        setGridError("Failed to generate slot.")
        updateDraftById(newDraft.id, (draft) => ({
          ...draft,
          status: "draft",
          summary: "Slot generation failed.",
        }))
        return
      }

      await streamNdjson<DetailedPostTemplate>(response, (template) => {
        updateDraftById(newDraft.id, (draft) => applyTemplateToDraft(draft, template))
      })
    } catch {
      setGridError("Slot generation failed.")
    }
  }, [
    calendarDays,
    platformAccountIds,
    selectedTrendIds,
    brandProfileId,
    userId,
    instagramAccountId,
    updateDraftById,
    applyTemplateToDraft,
    setCalendarDays,
    setSelectedDraftId,
    setGridError
  ])

  const handleToggleTrend = useCalendarStore((s) => s.toggleTrend)

  const handleGenerateDrafts = React.useCallback(async () => {
    if (gridStatus === "running") return
    const accountIds = Object.values(platformAccountIds ?? {}).filter(Boolean)
    if (accountIds.length === 0) {
      setGridError("Connect a platform account to generate drafts.")
      setGridStatus("error")
      return
    }

    setGridError(null)
    setGridProgress({ percent: 0, message: "Starting..." })
    setGridStatus("running")
    reservePlaceholders()
    
    calendarDays.forEach(day => {
      useCalendarStore.getState().setGhosts(day.id, 1)
    })

    const payload = {
      platformAccountIds,
      language: "English",
      intent: "brand_quality",
      selectedTrendIds,
      prompt: DEFAULT_PROMPT,
    }

    try {
      const response = await fetch("/api/organic/generate-grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        setGridStatus("error")
        setGridError("Failed to start grid generation.")
        return
      }
      const data = (await response.json()) as { jobId?: string; channel?: string; status?: string }
      const jobId = data.jobId ?? null
      const channel =
        data.channel ?? (jobId ? `/api/organic/generate-grid/events?job_id=${jobId}` : null)
      if (!jobId || !channel) {
        setGridStatus("error")
        setGridError("Invalid response from grid generation.")
        return
      }

      setGridJobId(jobId)
      eventSourceRef.current?.close()
      const source = new EventSource(channel)
      eventSourceRef.current = source

      source.addEventListener("progress", (event) => {
        const payload = parseJsonSafely<GridProgressPayload>((event as MessageEvent).data)
        if (payload) {
          setGridProgress({ 
            percent: payload.percent ?? 0, 
            message: payload.message || payload.status 
          })
        }
      })

      source.addEventListener("slot", (event) => {
        const payload = parseJsonSafely<{ slot?: GridSlot }>((event as MessageEvent).data)
        if (payload?.slot) {
          const slot = payload.slot
          setGridSlots((current) => {
            const exists = current.find((s) => s.slotId === slot.slotId)
            if (exists) {
              return current.map((s) => (s.slotId === slot.slotId ? slot : s))
            }
            return [...current, slot]
          })
          replacePlaceholderWithSlot(slot)
          useCalendarStore.getState().setGhosts(slot.schedule.dayId, Math.max(0, (useCalendarStore.getState().ghosts[slot.schedule.dayId] || 0) - 1))
        }
      })

      source.addEventListener("review", (event) => {
        const payload = parseJsonSafely<{ grid?: WeeklyGrid; status?: string }>((event as MessageEvent).data)
        if (payload?.grid) {
          setGridSlots(payload.grid.slots ?? [])
          payload.grid.slots?.forEach((slot: GridSlot) => replacePlaceholderWithSlot(slot))
        }
        setGridStatus("awaiting_approval")
      })

      source.addEventListener("complete", (event) => {
        const payload = parseJsonSafely<{ grid?: WeeklyGrid }>((event as MessageEvent).data)
        if (payload?.grid) {
          setGridSlots(payload.grid.slots ?? [])
          payload.grid.slots?.forEach((slot: GridSlot) => replacePlaceholderWithSlot(slot))
        }
        setGridStatus("complete")
        useCalendarStore.getState().clearGhosts()
        source.close()
      })

      source.addEventListener("error", (event) => {
        const payload = parseJsonSafely<{ message?: string }>((event as MessageEvent).data)
        setGridStatus("error")
        setGridError(payload?.message ?? "Grid generation failed.")
        useCalendarStore.getState().clearGhosts()
        source.close()
      })

      source.onerror = () => {
        setGridStatus("error")
        setGridError("Generation stream closed unexpectedly.")
        source.close()
      }
    } catch {
      setGridStatus("error")
      setGridError("Failed to start grid generation.")
    }
  }, [
    gridStatus,
    platformAccountIds,
    selectedTrendIds,
    reservePlaceholders,
    replacePlaceholderWithSlot,
    calendarDays,
    setGridError,
    setGridJobId,
    setGridProgress,
    setGridStatus,
  ])

  const handleApproveGrid = React.useCallback(async () => {
    if (!gridJobId) return
    try {
      const response = await fetch("/api/organic/generate-grid/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: gridJobId, approved: true }),
      })
      if (!response.ok) {
        setGridError("Failed to approve the grid.")
        setGridStatus("error")
        return
      }
      setGridStatus("approved")
    } catch {
      setGridError("Failed to approve the grid.")
      setGridStatus("error")
    }
  }, [gridJobId, setGridError, setGridStatus])

  const handleExpandDetails = React.useCallback(async () => {
    if (gridSlots.length === 0) return
    if (detailsStatus === "running") return
    const accountIds = Object.values(platformAccountIds ?? {}).filter(Boolean)
    if (accountIds.length === 0) {
      setGridError("Connect a platform account before expanding drafts.")
      return
    }
    setDetailsStatus("running")

    try {
      const response = await fetch("/api/organic/generate-daily-details-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformAccountIds,
          weeklyGrid: { grid: gridSlots },
          language: "English",
          selectedTrendIds,
        }),
      })
      if (!response.ok) {
        setDetailsStatus("error")
        setGridError("Failed to expand drafts.")
        return
      }

      await streamNdjson<DetailedPostTemplate>(response, (template) => {
        updateDraftById(template.slotId, (draft) => applyTemplateToDraft(draft, template))
      })
      setDetailsStatus("complete")
    } catch {
      setDetailsStatus("error")
      setGridError("Failed to expand drafts.")
    }
  }, [applyTemplateToDraft, gridSlots, detailsStatus, platformAccountIds, selectedTrendIds, updateDraftById, setGridError])

  const handleBulkApprove = React.useCallback(async () => {
    if (selectedDraftIds.length === 0) return;
    if (gridJobId) {
      await handleApproveGrid();
    }
    clearDraftSelection();
  }, [selectedDraftIds, gridJobId, handleApproveGrid, clearDraftSelection])

  const handleBulkExpand = React.useCallback(async () => {
    if (selectedDraftIds.length === 0) return;
    await handleExpandDetails();
    clearDraftSelection();
  }, [selectedDraftIds, handleExpandDetails, clearDraftSelection])

  const handleGeneratePlatformBatch = React.useCallback(async (platform: OrganicPlatformKey) => {
    const accountId = platformAccountIds[platform]
    if (!accountId) return

    setGridStatus("running")
    setGridProgress({ percent: 0, message: `Generating ${platform} batch...` })
    
    await handleGenerateDrafts()
  }, [platformAccountIds, handleGenerateDrafts, setGridStatus, setGridProgress])

  const handleBuild = React.useCallback(() => {
    setActiveStepIndex(2)
    void handleGenerateDrafts()
  }, [handleGenerateDrafts])

  const handleRegenerate = React.useCallback(async (draftId: string) => {
    const draft = drafts.find((d) => d.id === draftId)
    if (!draft) return

    updateDraftById(draftId, (d) => ({
      ...d,
      status: "streaming",
      summary: "Regenerating content...",
    }))

    const dayId = calendarDays.find((day) => day.slots.some((s) => s.id === draftId))?.id
    if (!dayId) return

    const payload = {
      platformAccountIds,
      dayId,
      timeOfDay: mapTimeOfDay(draft.timeLabel),
      language: "English",
      selectedTrendIds: draft.tags,
    }

    try {
      const response = await fetch("/api/organic/generate-slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error("Failed")

      await streamNdjson<DetailedPostTemplate>(response, (template) => {
        updateDraftById(draftId, (d) => applyTemplateToDraft(d, template))
      })
    } catch (e) {
      setGridError("Regeneration failed.")
      updateDraftById(draftId, (d) => ({ ...d, status: "draft" }))
    }
  }, [drafts, calendarDays, platformAccountIds, updateDraftById, applyTemplateToDraft, setGridError])

  const handleGenerateFromTrend = React.useCallback(async (dayId: string, trendId: string, timeOfDay?: string) => {
    const targetDay = calendarDays.find((day) => day.id === dayId)
    if (!targetDay) return
    
    useCalendarStore.getState().setGhosts(dayId, (useCalendarStore.getState().ghosts[dayId] || 0) + 1)

    const payload = {
      platformAccountIds,
      dayId,
      timeOfDay: timeOfDay || "morning",
      language: "English",
      selectedTrendIds: [trendId],
    }

    try {
      const response = await fetch("/api/organic/generate-slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      
      if (!response.ok) throw new Error("Failed")

      await streamNdjson<DetailedPostTemplate>(response, (template) => {
        const draft = buildDraftFromSlot({
          slotId: template.slotId,
          schedule: template.schedule,
          platform: template.platform,
          strategy: template.strategy,
          contentPlan: template.contentPlan,
          tags: { trendIds: [trendId] }
        })
        const finalDraft = applyTemplateToDraft(draft, template)
        addDraft(dayId, finalDraft)
      })
    } catch (e) {
      setGridError("Failed to generate slot from trend.")
    } finally {
      useCalendarStore.getState().setGhosts(dayId, Math.max(0, (useCalendarStore.getState().ghosts[dayId] || 0) - 1))
    }
  }, [calendarDays, platformAccountIds, buildDraftFromSlot, applyTemplateToDraft, addDraft, setGridError])

  const [isPeekOpen, setIsPeekOpen] = React.useState(false)

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && selectedDraftId && !isPeekOpen) {
        if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return
        e.preventDefault()
        setIsPeekOpen(true)
      }
      if (e.code === "Escape" && isPeekOpen) {
        setIsPeekOpen(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedDraftId, isPeekOpen])

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3 overflow-hidden sm:gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-secondary">Organic module</p>
          <h1 className="text-2xl font-semibold text-primary">Calendar-first creation</h1>
          <p className="text-sm text-secondary">
            One dynamic space for planning, drafting, and scheduling.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs.Root
            value={mode}
            onValueChange={(value) => setMode(value as WorkspaceMode)}
            activationMode="manual"
          >
            <Tabs.List className="flex flex-wrap gap-1 rounded-full border border-subtle bg-surface/70 p-1">
              {["week", "month"].map((entry) => (
                <Tabs.Trigger
                  key={entry}
                  value={entry}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold capitalize text-secondary transition",
                    "data-[state=active]:bg-brand-primary/20 data-[state=active]:text-primary"
                  )}
                >
                  {entry}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </Tabs.Root>
          {hasDrafts ? (
            <div className="flex gap-2">
              {ORGANIC_PLATFORM_KEYS.map((pk) => (
                <Button key={pk} size="sm" variant="outline" onClick={() => handleGeneratePlatformBatch(pk as OrganicPlatformKey)}>
                  {pk === "instagram" ? "IG" : "LI"} Batch
                </Button>
              ))}
              <Button size="sm" onClick={handleGenerateDrafts} disabled={gridStatus === "running"}>
                <LightningBoltIcon /> {gridStatus === "running" ? "Generating..." : "Generate all"}
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={handleBuild} disabled={gridStatus === "running"}>
              <RocketIcon /> Build
            </Button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] lg:gap-6">
        <div className="flex min-h-0 flex-col">
          <GlassPanel className="flex min-h-0 flex-col p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-secondary">Workflow</p>
                <p className="text-sm font-semibold text-primary sm:text-base">Creation steps</p>
              </div>
              {!hasDrafts ? (
                <Button variant="secondary" size="sm" onClick={handleBuild}>
                  <RocketIcon /> Build
                </Button>
              ) : null}
            </div>
            <div className="mt-3">
              <WorkflowStepper steps={workflowSteps} />
            </div>

            {gridStatus !== "idle" || gridError ? (
              <div className="mt-3 rounded-lg border border-subtle bg-surface/60 p-2">
                <div className="flex items-center justify-between text-xs text-secondary">
                  <span>Agent reception</span>
                  <span>
                    {gridStatus === "running"
                      ? `${gridProgress?.percent ?? 0}%`
                      : gridStatus === "awaiting_approval"
                      ? "Awaiting approval"
                      : gridStatus === "approved"
                      ? "Approved"
                      : gridStatus === "complete"
                      ? "Complete"
                      : gridStatus === "error"
                      ? "Error"
                      : "Idle"}
                  </span>
                </div>
                {gridStatus === "running" ? (
                  <div className="mt-2">
                    <Progress value={gridProgress?.percent ?? 0} />
                  </div>
                ) : null}
                {gridStatus === "awaiting_approval" ? (
                  <Button className="mt-3" size="sm" onClick={handleApproveGrid}>
                    Approve grid
                  </Button>
                ) : null}
                {(gridStatus === "approved" || gridStatus === "complete") ? (
                  <Button
                    className="mt-3"
                    size="sm"
                    onClick={handleExpandDetails}
                    disabled={detailsStatus === "running"}
                  >
                    {detailsStatus === "running" ? "Expanding..." : "Expand to full drafts"}
                  </Button>
                ) : null}
                {gridError ? (
                  <p className="mt-2 text-[11px] text-secondary">{gridError}</p>
                ) : null}
              </div>
            ) : null}

            <div className="my-3 w-full border-t border-subtle opacity-70 sm:my-4" />

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0">
              <TrendsPanel
                trendTypes={trendTypes}
                trends={trends}
                activePlatforms={activePlatforms}
                selectedTrendIds={selectedTrendIds}
                maxTrendSelections={maxTrendSelections}
                onToggleTrend={handleToggleTrend}
              />

              <UnscheduledSidebar
                drafts={unscheduledDrafts}
                selectedDraftId={selectedDraftId}
                selectedDraftIds={selectedDraftIds}
                onSelectDraft={handleSelectDraft}
                onToggleSelection={toggleDraftSelection}
                onMoveDraft={handleMoveDraft}
                onRegenerate={handleRegenerate}
              />
            </div>

            <div className="my-3 w-full border-t border-subtle opacity-70 sm:my-4" />

            {selectedDraft ? (
              <DraftDetailPanel draft={selectedDraft} slides={editorSlides} />
            ) : (
              <DraftsDataGrid
              drafts={drafts}
              selectedDraftId={selectedDraftId}
              onSelectDraft={handleSelectDraft}
              />
            )}
          </GlassPanel>
        </div>

        <div className="min-h-0">
          {mode === "week" ? (
            <WeekCanvas
              days={calendarDays}
              selectedDraftId={selectedDraftId}
              selectedDraftIds={selectedDraftIds}
              onSelectDraft={handleSelectDraft}
              onToggleSelection={toggleDraftSelection}
              onBuild={handleBuild}
              onMoveDraft={handleMoveDraft}
              onCreateDraft={handleCreateDraft}
              onGenerateFromTrend={handleGenerateFromTrend}
              onRegenerate={handleRegenerate}
            />
          ) : (
            <MonthCanvas
              days={calendarDays}
              selectedDraftId={selectedDraftId}
              onSelectDraft={handleSelectDraft}
            />
          )}
        </div>
      </div>
      
      <BulkActionBar
        selectedIds={selectedDraftIds}
        onClear={clearDraftSelection}
        onBulkApprove={handleBulkApprove}
        onBulkExpand={handleBulkExpand}
      />

      {isPeekOpen && selectedDraft && (
        <PeekModal
          draft={selectedDraft}
          onClose={() => setIsPeekOpen(false)}
        />
      )}
    </div>
  )
}
