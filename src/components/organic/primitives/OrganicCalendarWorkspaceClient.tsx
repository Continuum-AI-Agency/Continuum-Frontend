"use client"

import * as React from "react"
import {
  CalendarIcon,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { SafeMarkdown } from "@/components/ui/SafeMarkdown"
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
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import type {
  OrganicActivityItem,
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCreationStep,
  OrganicDraftCreateRequest,
  OrganicEditorSlide,
  OrganicPlatformTag,
  OrganicTrendType,
} from "./types"
import { moveDraftToDay } from "./calendar-utils"

type WorkspaceMode = "week" | "month" | "flow" | "compose"

type OrganicCalendarWorkspaceClientProps = {
  days: OrganicCalendarDay[]
  steps: OrganicCreationStep[]
  activityFeed: OrganicActivityItem[]
  editorSlides: OrganicEditorSlide[]
  trendTypes: OrganicTrendType[]
  trends?: Trend[]
  activePlatforms?: OrganicPlatformKey[]
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

function formatDateId(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
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

function WorkflowStepper({ steps }: { steps: WorkflowStepState[] }) {
  return (
    <div className="grid gap-2">
      {steps.map((step) => {
        const isComplete = step.status === "complete"
        const isActive = step.status === "active"
        return (
          <div
            key={step.id}
            className="flex items-start gap-3 rounded-xl border border-subtle bg-surface/70 p-3"
          >
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border",
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
  onSelect,
  onDragStart,
}: {
  draft: OrganicCalendarDraft
  isSelected: boolean
  onSelect: (id: string) => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, draftId: string) => void
}) {
  return (
    <HoverCard openDelay={250} closeDelay={120}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <HoverCardTrigger asChild>
            <button
              type="button"
              onClick={() => onSelect(draft.id)}
              draggable
              onDragStart={(event) => onDragStart(event, draft.id)}
              className={cn(
                "w-full rounded-xl border px-3 py-2 text-left transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                isSelected
                  ? "border-brand-primary/60 bg-brand-primary/10 shadow-brand-glow"
                  : "border-subtle bg-surface/70 hover:border-brand-primary/50 hover:bg-surface",
                draft.status === "placeholder" && "opacity-80"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-secondary">
                  {draft.timeLabel}
                </span>
                <StatusBadge status={draft.status} />
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

function CalendarDayColumn({
  day,
  selectedDraftId,
  onSelectDraft,
  onMoveDraft,
  onCreateDraft,
}: {
  day: OrganicCalendarDay
  selectedDraftId: string | null
  onSelectDraft: (id: string) => void
  onMoveDraft: (draftId: string, targetDayId: string) => void
  onCreateDraft: (dayId: string) => void
}) {
  const visibleDrafts = day.slots.slice(0, 2)
  const hiddenCount = Math.max(day.slots.length - visibleDrafts.length, 0)
  const [isDragOver, setIsDragOver] = React.useState(false)

  return (
    <div
      className={cn(
        "relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border border-subtle bg-surface/70 p-3 transition",
        isDragOver && "border-brand-primary/50 bg-brand-primary/10"
      )}
      onDragOver={(event) => {
        event.preventDefault()
      }}
      onDragEnter={() => setIsDragOver(true)}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        const draftId = event.dataTransfer.getData("text/plain")
        setIsDragOver(false)
        if (draftId) {
          onMoveDraft(draftId, day.id)
        }
      }}
    >
      <div className="absolute inset-3 pointer-events-none rounded-xl border border-dashed border-white/5">
        <div className="h-full">
          <div className="h-1/3 border-b border-dashed border-white/5" />
          <div className="h-1/3 border-b border-dashed border-white/5" />
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
        {day.suggestedTimes.slice(0, 2).map((time) => (
          <span
            key={`${day.id}-${time}`}
            className="rounded-full border border-subtle bg-default px-2 py-0.5 text-[10px] text-secondary"
          >
            {time}
          </span>
        ))}
      </div>
      <div className="relative z-10 flex flex-col gap-3">
        {visibleDrafts.map((draft) => (
          <CalendarDraftCard
            key={draft.id}
            draft={draft}
            isSelected={draft.id === selectedDraftId}
            onSelect={onSelectDraft}
            onDragStart={(event, draftId) => {
              event.dataTransfer.setData("text/plain", draftId)
              event.dataTransfer.effectAllowed = "move"
            }}
          />
        ))}
      </div>
      {hiddenCount > 0 ? (
        <span className="text-xs text-secondary">+{hiddenCount} more drafts</span>
      ) : null}
      <button
        type="button"
        onClick={() => onCreateDraft(day.id)}
        className="relative z-10 mt-auto rounded-xl border border-dashed border-subtle bg-default/40 px-3 py-2 text-xs font-medium text-secondary transition hover:border-brand-primary/50 hover:text-primary"
      >
        Add slot
      </button>
    </div>
  )
}

function WeekCanvas({
  days,
  selectedDraftId,
  onSelectDraft,
  onBuild,
  onMoveDraft,
  onCreateDraft,
}: {
  days: OrganicCalendarDay[]
  selectedDraftId: string | null
  onSelectDraft: (id: string) => void
  onBuild: () => void
  onMoveDraft: (draftId: string, targetDayId: string) => void
  onCreateDraft: (dayId: string) => void
}) {
  const hasDrafts = days.some((day) => day.slots.length > 0)

  return (
    <GlassPanel className="flex h-full flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-secondary">Calendar view</p>
          <h2 className="text-xl font-semibold text-primary">January 2026</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">
            <CalendarIcon /> New draft
          </Button>
        </div>
      </div>
      {hasDrafts ? (
        <div className="relative flex-1 min-h-0 rounded-2xl border border-subtle bg-default/40 p-3">
          <div className="grid h-full gap-3 lg:grid-cols-7">
            {days.map((day) => (
            <CalendarDayColumn
              key={day.id}
              day={day}
              selectedDraftId={selectedDraftId}
              onSelectDraft={onSelectDraft}
              onMoveDraft={onMoveDraft}
              onCreateDraft={onCreateDraft}
            />
          ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-subtle bg-default/40 text-center">
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
  onSelectDraft,
}: {
  days: OrganicCalendarDay[]
  onSelectDraft: (id: string) => void
}) {
  const monthCells = React.useMemo(() => buildMonthGrid(days), [days])
  const { year, month } = getMonthContext(days)
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month, 1))

  return (
    <GlassPanel className="flex h-full flex-col gap-4 p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-secondary">Month view</p>
        <h2 className="text-xl font-semibold text-primary">{monthLabel}</h2>
      </div>
      <div className="grid flex-1 min-h-0 grid-cols-7 gap-3">
        {monthCells.map((cell) => (
          <div
            key={cell.id}
            className={cn(
              "rounded-xl border border-subtle p-2 text-xs",
              cell.isCurrentMonth ? "bg-surface/80" : "bg-default/30 text-secondary"
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

function FlowCanvas() {
  const agentCopy =
    "**Agent reception** is streaming the first two drafts. The calendar reserves a slot per day while generation completes."

  return (
    <GlassPanel className="flex h-full flex-col gap-4 p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-secondary">Flow canvas</p>
        <h2 className="text-xl font-semibold text-primary">Agent reception</h2>
      </div>
      <div className="rounded-2xl border border-subtle bg-default/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <LightningBoltIcon />
            Streaming drafts
          </div>
          <span className="text-xs text-secondary">62% complete</span>
        </div>
        <div className="mt-3">
          <Progress value={62} />
        </div>
        <SafeMarkdown
          content={agentCopy}
          mode="static"
          className="mt-3 text-xs text-secondary"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`placeholder-${index}`}
            className="rounded-xl border border-dashed border-subtle bg-default/40 p-3 text-xs text-secondary"
          >
            Placeholder slot #{index + 1}
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}

function EditorPreview({ slides }: { slides: OrganicEditorSlide[] }) {
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-subtle bg-surface/80">
        <Carousel className="w-full">
          <CarouselContent>
            {slides.map((slide) => (
              <CarouselItem key={slide.id}>
                <div
                  className={cn(
                    "aspect-[4/5] w-full bg-gradient-to-br p-4",
                    slide.gradient
                  )}
                >
                  <div className="flex h-full flex-col justify-between rounded-xl border border-white/10 bg-black/30 p-4">
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
    </div>
  )
}

function ComposeCanvas({
  draft,
  slides,
}: {
  draft: OrganicCalendarDraft | null
  slides: OrganicEditorSlide[]
}) {
  return (
    <GlassPanel className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-secondary">Compose</p>
          <h2 className="text-xl font-semibold text-primary">
            {draft ? draft.title : "Select a draft"}
          </h2>
        </div>
        {draft ? (
          <div className="flex items-center gap-2">
            <StatusBadge status={draft.status} />
            {draft.platforms.map((platform) => (
              <PlatformBadge key={`${draft.id}-${platform}`} platform={platform} />
            ))}
          </div>
        ) : null}
      </div>
      {draft ? (
        <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <EditorPreview slides={slides} />
          <div className="space-y-3">
            <div className="rounded-xl border border-subtle bg-surface/70 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-secondary">Caption</p>
              <p className="mt-1 text-sm text-primary whitespace-pre-wrap">
                {draft.captionPreview}
              </p>
            </div>
            <div className="rounded-xl border border-subtle bg-surface/70 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-secondary">Hashtags</p>
              <p className="mt-1 text-sm text-primary">
                {draft.tags.map((tag) => `#${tag}`).join(" ")}
              </p>
            </div>
            <div className="rounded-xl border border-subtle bg-surface/70 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-secondary">Scheduling</p>
              <p className="mt-1 text-sm text-primary">{draft.timeLabel}</p>
              <p className="text-xs text-secondary">{draft.dateLabel}</p>
            </div>
            <div className="rounded-xl border border-subtle bg-surface/70 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-secondary">Metadata</p>
              <p className="mt-1 text-sm text-primary">Format: {draft.format}</p>
              <p className="text-xs text-secondary">Objective: {draft.objective}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-subtle bg-default/40 text-sm text-secondary">
          Select a draft to open the composer preview.
        </div>
      )}
    </GlassPanel>
  )
}

function DraftDetailPanel({ draft }: { draft: OrganicCalendarDraft }) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-subtle bg-default/60 p-4">
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
      <div className="rounded-2xl border border-subtle bg-surface/70 p-4">
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
    <GlassPanel className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-secondary">Trends</p>
          <p className="text-lg font-semibold text-primary">Signal explorer</p>
        </div>
      </div>
      <Tabs.Root value={view} onValueChange={(value) => setView(value as typeof view)} activationMode="manual" className="mt-3">
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
            <div className="rounded-2xl border border-dashed border-subtle bg-default/40 p-4 text-xs text-secondary">
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
                        className="rounded-xl border border-subtle bg-surface/70"
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
    </GlassPanel>
  )
}

function DraftsDataGrid({
  drafts,
  onSelectDraft,
}: {
  drafts: OrganicCalendarDraft[]
  onSelectDraft: (id: string) => void
}) {
  const visibleDrafts = drafts.slice(0, 6)

  return (
    <div className="rounded-2xl border border-subtle bg-default/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-secondary">All drafts</p>
          <p className="text-sm font-semibold text-primary">{drafts.length} items</p>
        </div>
        <Button variant="ghost" size="icon-sm">
          <MixerHorizontalIcon />
        </Button>
      </div>
      <div className="mt-3 rounded-xl border border-subtle bg-surface/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Draft</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Platforms</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleDrafts.map((draft) => (
              <TableRow
                key={draft.id}
                className="cursor-pointer hover:bg-default/60"
                onClick={() => onSelectDraft(draft.id)}
              >
                <TableCell>
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

function ActivityFeed({ items }: { items: OrganicActivityItem[] }) {
  return (
    <div className="rounded-2xl border border-subtle bg-surface/70 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Recent activity</p>
          <p className="text-xs text-secondary">Review what happened in the last 7 days.</p>
        </div>
        <Button variant="ghost" size="icon-sm">
          <MixerHorizontalIcon />
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="text-xs font-semibold">
                  {item.actor
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-primary">{item.actor}</p>
                <p className="text-xs text-secondary">{item.summary}</p>
              </div>
            </div>
            <div className="text-xs text-secondary">{item.timeLabel}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function OrganicCalendarWorkspaceClient({
  days,
  steps,
  activityFeed,
  editorSlides,
  trendTypes,
  trends = [],
  activePlatforms = [],
  maxTrendSelections,
  brandProfileId,
  userId,
  instagramAccountId,
  initialSelectedDraftId,
}: OrganicCalendarWorkspaceClientProps) {
  const [calendarDays, setCalendarDays] = React.useState(days)
  const drafts = React.useMemo(
    () => calendarDays.flatMap((day) => day.slots),
    [calendarDays]
  )
  const hasDrafts = drafts.length > 0
  const [mode, setMode] = React.useState<WorkspaceMode>("week")
  const [selectedDraftId, setSelectedDraftId] = React.useState<string | null>(
    typeof initialSelectedDraftId === "undefined"
      ? hasDrafts
        ? drafts[0]?.id ?? null
        : null
      : initialSelectedDraftId
  )

  const [activeStepIndex, setActiveStepIndex] = React.useState(() =>
    hasDrafts ? 2 : 0
  )
  const [selectedTrendIds, setSelectedTrendIds] = React.useState<string[]>([])

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
    if (mode === "flow" && activeStepIndex < 2) {
      setActiveStepIndex(2)
    }
    if (mode === "compose" && activeStepIndex < 3) {
      setActiveStepIndex(3)
    }
  }, [mode, activeStepIndex])

  const handleSelectDraft = React.useCallback(
    (id: string) => {
      setSelectedDraftId(id)
      setMode("compose")
      setActiveStepIndex(3)
    },
    []
  )

  const handleMoveDraft = React.useCallback((draftId: string, targetDayId: string) => {
    setCalendarDays((current) => moveDraftToDay(current, draftId, targetDayId))
  }, [])

  const handleCreateDraft = React.useCallback((dayId: string) => {
    const targetDay = calendarDays.find((day) => day.id === dayId)
    if (!targetDay) return

    const newDraft: OrganicCalendarDraft = {
      id: `draft-${Date.now()}`,
      title: "New draft",
      summary: "Draft created from the calendar canvas.",
      timeLabel: targetDay.suggestedTimes[0] ?? "9:00 AM",
      dateLabel: `${targetDay.label}, ${targetDay.dateLabel}`,
      status: "placeholder",
      platforms: ["instagram"],
      format: "Draft",
      objective: "Draft",
      captionPreview: "Add details to continue.",
      tags: [],
      mediaCount: 0,
    }

    setCalendarDays((current) =>
      current.map((day) =>
        day.id === dayId ? { ...day, slots: [...day.slots, newDraft] } : day
      )
    )

    setSelectedDraftId(newDraft.id)
    setMode("compose")
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
  }, [calendarDays, brandProfileId, userId, instagramAccountId, selectedTrendIds])

  const handleToggleTrend = React.useCallback(
    (trendId: string) => {
      setSelectedTrendIds((current) => {
        const next = new Set(current)
        if (next.has(trendId)) {
          next.delete(trendId)
          return Array.from(next)
        }
        if (typeof maxTrendSelections === "number" && next.size >= maxTrendSelections) {
          return current
        }
        next.add(trendId)
        return Array.from(next)
      })
    },
    [maxTrendSelections]
  )

  const handleBuild = React.useCallback(() => {
    setMode("flow")
    setActiveStepIndex(2)
  }, [])

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4 overflow-hidden">
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
              {["week", "month", "flow", "compose"].map((entry) => (
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
          <Button size="sm">
            <LightningBoltIcon /> Generate drafts
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
        <div className="flex min-h-0 flex-col gap-4">
          <GlassPanel className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-secondary">Workflow</p>
                <p className="text-lg font-semibold text-primary">Creation steps</p>
              </div>
              {!hasDrafts ? (
                <Button variant="secondary" size="sm" onClick={handleBuild}>
                  <RocketIcon /> Build
                </Button>
              ) : null}
            </div>
            <div className="mt-4">
              <WorkflowStepper steps={workflowSteps} />
            </div>
          </GlassPanel>

          <TrendsPanel
            trendTypes={trendTypes}
            trends={trends}
            activePlatforms={activePlatforms}
            selectedTrendIds={selectedTrendIds}
            maxTrendSelections={maxTrendSelections}
            onToggleTrend={handleToggleTrend}
          />

          {selectedDraft ? (
            <DraftDetailPanel draft={selectedDraft} />
          ) : (
            <DraftsDataGrid drafts={drafts} onSelectDraft={handleSelectDraft} />
          )}

          <ActivityFeed items={activityFeed} />
        </div>

        <div className="min-h-0">
          {mode === "week" ? (
            <WeekCanvas
              days={calendarDays}
              selectedDraftId={selectedDraftId}
              onSelectDraft={handleSelectDraft}
              onBuild={handleBuild}
              onMoveDraft={handleMoveDraft}
              onCreateDraft={handleCreateDraft}
            />
          ) : mode === "month" ? (
            <MonthCanvas days={calendarDays} onSelectDraft={handleSelectDraft} />
          ) : mode === "flow" ? (
            <FlowCanvas />
          ) : (
            <ComposeCanvas draft={selectedDraft} slides={editorSlides} />
          )}
        </div>
      </div>
    </div>
  )
}
