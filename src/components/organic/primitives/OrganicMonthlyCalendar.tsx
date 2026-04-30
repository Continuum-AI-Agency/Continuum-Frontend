"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { LightningBoltIcon, Pencil1Icon, TrashIcon } from "@radix-ui/react-icons"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { cn } from "@/lib/utils"
import type { OrganicCalendarDay, OrganicCalendarDraft, OrganicCalendarPostedContent } from "./types"
import type { PlannerPlatform } from "./planner-platforms"
import { formatDayId } from "./calendar-utils"

const PLATFORM_CHIP_COLORS: Record<string, string> = {
  instagram: "bg-pink-500/80 text-white",
  linkedin: "bg-blue-600/80 text-white",
  facebook: "bg-indigo-500/80 text-white",
  tiktok: "bg-slate-900/80 text-white",
  youtube: "bg-red-500/80 text-white",
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

type OrganicMonthlyCalendarProps = {
  days: OrganicCalendarDay[]
  monthAnchorDate: Date
  platforms: PlannerPlatform[]
  postedContent: OrganicCalendarPostedContent[]
  selectedDraftId: string | null
  onSelectDraft: (id: string) => void
  onCreatePost: (options: { dayId: string; platformKey: string }) => void
  onPreviousMonth: () => void
  onNextMonth: () => void
  onRegenerate?: (draftId: string) => void
  onDeleteDraft?: (draftId: string) => void
}

function buildMonthGrid(weekStart: Date): Date[] {
  const month = weekStart.getMonth()
  const year = weekStart.getFullYear()

  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay()
  const gridStart = new Date(firstDay)
  gridStart.setDate(1 - startOffset)

  const lastDay = new Date(year, month + 1, 0)
  const endOffset = 6 - lastDay.getDay()
  const totalDays = startOffset + lastDay.getDate() + endOffset

  const cells: Date[] = []
  for (let i = 0; i < totalDays; i++) {
    const cell = new Date(gridStart)
    cell.setDate(gridStart.getDate() + i)
    cells.push(cell)
  }
  return cells
}

function DraftChip({
  draft,
  isSelected,
  onClick,
  onRegenerate,
  onDelete,
}: {
  draft: OrganicCalendarDraft
  isSelected: boolean
  onClick: () => void
  onRegenerate?: (id: string) => void
  onDelete?: (id: string) => void
}) {
  const platform = draft.platforms[0] ?? "instagram"
  const colorClass = PLATFORM_CHIP_COLORS[platform] ?? "bg-muted text-foreground"

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
          className={cn(
            "flex w-full cursor-pointer items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium leading-tight ring-0 transition-opacity hover:opacity-80",
            colorClass,
            isSelected && "ring-1 ring-white/80 ring-offset-1"
          )}
          title={draft.title}
        >
          <span className="truncate">{draft.title || "Untitled"}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={onClick}>
          <Pencil1Icon className="mr-2 h-3.5 w-3.5" />
          Open in editor
        </ContextMenuItem>
        {onRegenerate && draft.status !== "streaming" && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onRegenerate(draft.id)}>
              <LightningBoltIcon className="mr-2 h-3.5 w-3.5" />
              {draft.status === "failed" ? "Retry generation" : "Regenerate"}
            </ContextMenuItem>
          </>
        )}
        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDelete(draft.id)}
            >
              <TrashIcon className="mr-2 h-3.5 w-3.5" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function PostedContentHover({ post }: { post: OrganicCalendarPostedContent }) {
  const mediaUrl = post.thumbnailUrl ?? post.mediaUrl

  return (
    <div className="w-[272px] overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xl shadow-black/20">
      {mediaUrl ? (
        <div className="aspect-square overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt={post.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      ) : null}
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Posted
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {post.platform} {post.timeLabel}
          </span>
        </div>
        <p className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
          {post.title}
        </p>
        {post.caption ? (
          <p className="line-clamp-5 text-xs leading-relaxed text-muted-foreground">
            {post.caption}
          </p>
        ) : null}
        {post.permalink ? (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-xs font-medium text-primary hover:underline"
          >
            Open post
          </a>
        ) : null}
      </div>
    </div>
  )
}

function PostedContentChip({ post }: { post: OrganicCalendarPostedContent }) {
  const colorClass = PLATFORM_CHIP_COLORS[post.platform] ?? "bg-emerald-600/80 text-white"

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full cursor-default items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium leading-tight opacity-90 ring-0 transition-opacity hover:opacity-100",
            colorClass
          )}
          title={post.title}
        >
          <span className="shrink-0 text-[9px] font-bold uppercase">{post.timeLabel}</span>
          <span className="truncate">{post.title}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="p-0 border-none bg-transparent shadow-none"
        avoidCollisions
      >
        <PostedContentHover post={post} />
      </HoverCardContent>
    </HoverCard>
  )
}

export function OrganicMonthlyCalendar({
  days,
  monthAnchorDate,
  selectedDraftId,
  onSelectDraft,
  onCreatePost,
  onPreviousMonth,
  onNextMonth,
  onRegenerate,
  onDeleteDraft,
  postedContent,
}: OrganicMonthlyCalendarProps) {
  const todayId = React.useMemo(() => formatDayId(new Date()), [])

  const draftsByDayId = React.useMemo(() => {
    const map = new Map<string, OrganicCalendarDraft[]>()
    days.forEach((day) => {
      if (day.slots.length > 0) {
        map.set(day.id, day.slots)
      }
    })
    return map
  }, [days])

  const postedByDayId = React.useMemo(() => {
    const map = new Map<string, OrganicCalendarPostedContent[]>()
    postedContent.forEach((post) => {
      const items = map.get(post.dayId) ?? []
      items.push(post)
      map.set(post.dayId, items)
    })
    map.forEach((items) => items.sort((a, b) => a.timestamp.localeCompare(b.timestamp)))
    return map
  }, [postedContent])

  const gridCells = React.useMemo(() => buildMonthGrid(monthAnchorDate), [monthAnchorDate])

  const currentMonth = monthAnchorDate.getMonth()
  const currentYear = monthAnchorDate.getFullYear()
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(currentYear, currentMonth, 1)
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-card/50 p-2">
      <header className="mb-2 flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon-sm" onClick={onPreviousMonth} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <Button type="button" variant="outline" size="icon-sm" onClick={onNextMonth} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-7 border-b border-border/30 pb-1">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid grid-cols-7" style={{ gridAutoRows: "minmax(72px, auto)" }}>
          {gridCells.map((date) => {
            const dayId = formatDayId(date)
            const isCurrentMonth = date.getMonth() === currentMonth
            const isToday = dayId === todayId
            const drafts = draftsByDayId.get(dayId) ?? []
            const posts = postedByDayId.get(dayId) ?? []
            const visibleDrafts = drafts.slice(0, Math.max(0, 3 - Math.min(posts.length, 2)))
            const visiblePosts = posts.slice(0, Math.max(1, 3 - visibleDrafts.length))
            const overflowCount = drafts.length + posts.length - visibleDrafts.length - visiblePosts.length

            return (
              <div
                key={dayId}
                className={cn(
                  "group relative border-b border-r border-border/30 p-1.5 last:border-r-0",
                  !isCurrentMonth && "opacity-40",
                  isToday && "bg-primary/[0.04]"
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  {isToday ? (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      {date.getDate()}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {date.getDate()}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label="Add post"
                    onClick={() => onCreatePost({ dayId, platformKey: "instagram" })}
                    className="flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                  >
                    <Plus className="size-3 text-muted-foreground" />
                  </button>
                </div>

                <div className="flex flex-col gap-0.5">
                  {visibleDrafts.map((draft) => (
                    <DraftChip
                      key={draft.id}
                      draft={draft}
                      isSelected={draft.id === selectedDraftId}
                      onClick={() => onSelectDraft(draft.id)}
                      onRegenerate={onRegenerate}
                      onDelete={onDeleteDraft}
                    />
                  ))}
                  {visiblePosts.map((post) => (
                    <PostedContentChip key={post.id} post={post} />
                  ))}
                  {overflowCount > 0 && (
                    <span className="pl-1 text-[9px] text-muted-foreground/70">
                      +{overflowCount} more
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
