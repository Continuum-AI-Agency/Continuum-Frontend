"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, Cross2Icon, LightningBoltIcon, Pencil1Icon, PlusIcon, TrashIcon } from "@radix-ui/react-icons"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useCalendarStore } from "@/lib/organic/store"
import type { OrganicCalendarDay, OrganicCalendarDraft, OrganicDraftStatus } from "./types"
import type { PlannerPlatform } from "./planner-platforms"

const PLATFORM_BADGE_COLORS: Record<string, string> = {
  instagram: "bg-pink-500/15 text-pink-700 dark:text-pink-400",
  linkedin: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  facebook: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  tiktok: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
  youtube: "bg-red-500/15 text-red-700 dark:text-red-400",
}

type OnCreatePost = (options: {
  dayId?: string
  platformKey?: string
  status?: "draft" | "scheduled" | "placeholder"
}) => void

type OrganicListViewProps = {
  days: OrganicCalendarDay[]
  platforms: PlannerPlatform[]
  selectedDraftId: string | null
  selectedDraftIds: string[]
  onSelectDraft: (id: string) => void
  onToggleSelection: (id: string) => void
  onRegenerate: (draftId: string) => void
  onCreatePost: OnCreatePost
  brandProfileId?: string
  backlogDrafts: OrganicCalendarDraft[]
  onAddBacklogDraft: (draft: OrganicCalendarDraft) => void
  onDeleteBacklogDraft: (draftId: string) => void
  onPromoteBacklogDraft: (draftId: string, dayId: string, timeLabel: string) => void
}

function PlatformBadge({ platform }: { platform: string }) {
  const colorClass = PLATFORM_BADGE_COLORS[platform] ?? "bg-muted text-muted-foreground"
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", colorClass)}>
      {platform.slice(0, 2).toUpperCase()}
    </span>
  )
}

function StatusBadge({ status }: { status: OrganicDraftStatus }) {
  const config: Record<OrganicDraftStatus, { label: string; class: string }> = {
    draft: { label: "Draft", class: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    placeholder: { label: "Draft", class: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    scheduled: { label: "Scheduled", class: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    streaming: { label: "Generating", class: "bg-primary/15 text-primary" },
    failed: { label: "Failed", class: "bg-destructive/15 text-destructive" },
    published: { label: "Published", class: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-600" },
  }
  const { label, class: cls } = config[status] ?? config.draft
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", cls)}>
      {label}
    </span>
  )
}

function DraftRow({
  draft,
  isSelected,
  isMultiSelected,
  onSelect,
  onToggle,
  onDelete,
  onRegenerate,
}: {
  draft: OrganicCalendarDraft
  isSelected: boolean
  isMultiSelected: boolean
  onSelect: () => void
  onToggle: () => void
  onDelete: () => void
  onRegenerate?: () => void
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group flex cursor-pointer items-center gap-3 border-b border-border/40 px-4 py-2.5 transition-colors hover:bg-muted/40",
            isSelected && "bg-primary/[0.05]"
          )}
          onClick={onSelect}
        >
          <div
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            className="flex shrink-0 cursor-pointer items-center"
          >
            <Checkbox
              checked={isMultiSelected}
              className="opacity-0 transition-opacity group-hover:opacity-100 data-[state=checked]:opacity-100"
            />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            {draft.platforms.map((p) => (
              <PlatformBadge key={p} platform={p} />
            ))}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {draft.title || "Untitled"}
            </span>
            {draft.captionPreview && (
              <span className="hidden min-w-0 max-w-xs truncate text-xs text-muted-foreground lg:block">
                {draft.captionPreview}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {draft.dateLabel && (
              <span className="text-xs text-muted-foreground">{draft.dateLabel}</span>
            )}
            <StatusBadge status={draft.status} />
            <button
              type="button"
              aria-label="Remove"
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            >
              <Cross2Icon className="size-3" />
            </button>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={onSelect}>
          <Pencil1Icon className="mr-2 h-3.5 w-3.5" />
          Open in editor
        </ContextMenuItem>
        {onRegenerate && draft.status !== "streaming" && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onRegenerate}>
              <LightningBoltIcon className="mr-2 h-3.5 w-3.5" />
              {draft.status === "failed" ? "Retry generation" : "Regenerate"}
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={onDelete}
        >
          <TrashIcon className="mr-2 h-3.5 w-3.5" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function BacklogRow({
  draft,
  isSelected,
  onSelect,
  onDelete,
}: {
  draft: OrganicCalendarDraft
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        "group flex cursor-pointer items-center gap-3 border-b border-border/40 px-4 py-2.5 transition-colors hover:bg-muted/40",
        isSelected && "bg-primary/[0.05]"
      )}
      onClick={onSelect}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {draft.platforms.map((p) => (
          <PlatformBadge key={p} platform={p} />
        ))}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {draft.title || "Untitled"}
        </span>
        {draft.captionPreview && (
          <span className="hidden min-w-0 max-w-xs truncate text-xs text-muted-foreground lg:block">
            {draft.captionPreview}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Backlog</span>
        <button
          type="button"
          aria-label="Remove"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        >
          <Cross2Icon className="size-3" />
        </button>
      </div>
    </div>
  )
}

function QuickCreateRow({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = React.useState("")
  return (
    <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-4 py-2">
      <Input
        autoFocus
        aria-label="Post idea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Post idea..."
        className="h-7 flex-1 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onSubmit(value.trim())
          if (e.key === "Escape") onCancel()
        }}
      />
      <Button
        type="button"
        size="sm"
        aria-label="Save post idea"
        className="h-7 px-2"
        disabled={!value.trim()}
        onClick={() => { if (value.trim()) onSubmit(value.trim()) }}
      >
        <CheckIcon className="size-3" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={onCancel}>
        <Cross2Icon className="size-3" />
      </Button>
    </div>
  )
}

type GroupState = Record<string, boolean>

export function OrganicListView({
  days,
  selectedDraftId,
  selectedDraftIds,
  onSelectDraft,
  onToggleSelection,
  onRegenerate,
  onCreatePost,
  backlogDrafts,
  onAddBacklogDraft,
  onDeleteBacklogDraft,
}: OrganicListViewProps) {
  const [collapsed, setCollapsed] = React.useState<GroupState>({})
  const [creating, setCreating] = React.useState<string | null>(null)
  const bulkDeleteDrafts = useCalendarStore((s) => s.bulkDeleteDrafts)
  const updateDraft = useCalendarStore((s) => s.updateDraft)

  const allDrafts = React.useMemo(
    () => days.flatMap((day) => day.slots),
    [days]
  )

  const selectedIdSet = React.useMemo(
    () => new Set(selectedDraftIds),
    [selectedDraftIds]
  )

  const draftDrafts = React.useMemo(
    () => allDrafts.filter((d) => d.status === "draft" || d.status === "placeholder" || d.status === "streaming" || d.status === "failed"),
    [allDrafts]
  )
  const scheduledDrafts = React.useMemo(
    () => allDrafts.filter((d) => d.status === "scheduled"),
    [allDrafts]
  )
  const publishedDrafts = React.useMemo(
    () => allDrafts.filter((d) => d.status === "published"),
    [allDrafts]
  )

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleCreateBacklog = (title: string) => {
    const draft: OrganicCalendarDraft = {
      id: `backlog-${crypto.randomUUID()}`,
      title,
      summary: "",
      timeLabel: "",
      dateLabel: "",
      status: "draft",
      platforms: ["instagram"],
      format: "Post",
      objective: "Draft",
      captionPreview: "",
      tags: [],
      mediaCount: 1,
    }
    onAddBacklogDraft(draft)
    setCreating(null)
  }

  const groupData: Array<{
    key: string
    label: string
    count: number
    colorClass: string
    showAdd: boolean
    content: React.ReactNode
  }> = [
    {
      key: "backlog",
      label: "Backlog",
      count: backlogDrafts.length,
      colorClass: "text-muted-foreground",
      showAdd: true,
      content: (
        <>
          {creating === "backlog" && (
            <QuickCreateRow
              onSubmit={handleCreateBacklog}
              onCancel={() => setCreating(null)}
            />
          )}
          {backlogDrafts.map((draft) => (
            <BacklogRow
              key={draft.id}
              draft={draft}
              isSelected={draft.id === selectedDraftId}
              onSelect={() => onSelectDraft(draft.id)}
              onDelete={() => onDeleteBacklogDraft(draft.id)}
            />
          ))}
          {backlogDrafts.length === 0 && creating !== "backlog" && (
            <div className="px-4 py-3 text-xs text-muted-foreground/60">
              No backlog items. Add ideas here to schedule later.
            </div>
          )}
        </>
      ),
    },
    {
      key: "draft",
      label: "Draft",
      count: draftDrafts.length,
      colorClass: "text-amber-600 dark:text-amber-500",
      showAdd: true,
      content: (
        <>
          {creating === "draft" && (
            <QuickCreateRow
              onSubmit={(_title) => {
                onCreatePost({ status: "placeholder" })
                setCreating(null)
              }}
              onCancel={() => setCreating(null)}
            />
          )}
          {draftDrafts.map((draft) => (
            <DraftRow
              key={draft.id}
              draft={draft}
              isSelected={draft.id === selectedDraftId}
              isMultiSelected={selectedIdSet.has(draft.id)}
              onSelect={() => onSelectDraft(draft.id)}
              onToggle={() => onToggleSelection(draft.id)}
              onDelete={() => bulkDeleteDrafts([draft.id])}
              onRegenerate={() => onRegenerate(draft.id)}
            />
          ))}
          {draftDrafts.length === 0 && creating !== "draft" && (
            <div className="px-4 py-3 text-xs text-muted-foreground/60">
              No drafts this week. Use the + button or generate content.
            </div>
          )}
        </>
      ),
    },
    {
      key: "scheduled",
      label: "Scheduled",
      count: scheduledDrafts.length,
      colorClass: "text-emerald-600 dark:text-emerald-500",
      showAdd: false,
      content: (
        <>
          {scheduledDrafts.map((draft) => (
            <DraftRow
              key={draft.id}
              draft={draft}
              isSelected={draft.id === selectedDraftId}
              isMultiSelected={selectedIdSet.has(draft.id)}
              onSelect={() => onSelectDraft(draft.id)}
              onToggle={() => onToggleSelection(draft.id)}
              onDelete={() => {
                updateDraft(draft.id, (d) => ({ ...d, status: "draft" as const }))
              }}
            />
          ))}
          {scheduledDrafts.length === 0 && (
            <div className="px-4 py-3 text-xs text-muted-foreground/60">
              No scheduled posts yet. Approve drafts to schedule them.
            </div>
          )}
        </>
      ),
    },
    {
      key: "published",
      label: "Published",
      count: publishedDrafts.length,
      colorClass: "text-emerald-700 dark:text-emerald-600",
      showAdd: false,
      content: (
        <>
          {publishedDrafts.map((draft) => (
            <DraftRow
              key={draft.id}
              draft={draft}
              isSelected={draft.id === selectedDraftId}
              isMultiSelected={selectedIdSet.has(draft.id)}
              onSelect={() => onSelectDraft(draft.id)}
              onToggle={() => onToggleSelection(draft.id)}
              onDelete={() => {}}
            />
          ))}
          {publishedDrafts.length === 0 && (
            <div className="px-4 py-3 text-xs text-muted-foreground/60">
              No published posts yet.
            </div>
          )}
        </>
      ),
    },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-card/50">
      <ScrollArea className="flex-1">
        {groupData.map(({ key, label, count, colorClass, showAdd, content }) => (
          <div key={key} className="group/section">
            <div
              className="flex cursor-pointer select-none items-center justify-between border-b border-border/50 bg-muted/30 px-4 py-2"
              onClick={() => toggleGroup(key)}
            >
              <div className="flex items-center gap-2">
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 text-muted-foreground transition-transform duration-150",
                    collapsed[key] && "-rotate-90"
                  )}
                />
                <span className={cn("text-xs font-semibold uppercase tracking-wide", colorClass)}>
                  {label}
                </span>
                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                  {count}
                </Badge>
              </div>
              {showAdd && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Add ${label}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCreating(key)
                    setCollapsed((prev) => ({ ...prev, [key]: false }))
                  }}
                  className="h-6 w-6 cursor-pointer opacity-0 transition-opacity hover:opacity-100 group-hover/section:opacity-100"
                >
                  <PlusIcon className="size-3" />
                </Button>
              )}
            </div>
            {!collapsed[key] && content}
          </div>
        ))}
      </ScrollArea>
    </div>
  )
}
