"use client"

import * as React from "react"
import {
  CheckIcon,
  LightningBoltIcon,
  MixerHorizontalIcon,
} from "@radix-ui/react-icons"

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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { OrganicCalendarDraft, OrganicPlatformTag } from "./types"

const platformStyles: Record<OrganicPlatformTag, string> = {
  instagram: "border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-100",
  linkedin: "border-sky-500/30 bg-sky-500/15 text-sky-100",
}

const statusStyles: Record<OrganicCalendarDraft["status"], string> = {
  draft: "border-muted bg-muted/60 text-muted-foreground",
  scheduled: "border-emerald-500/30 bg-emerald-500/15 text-emerald-100",
  streaming: "border-amber-500/30 bg-amber-500/15 text-amber-100",
  placeholder: "border-brand-primary/30 bg-brand-primary/10 text-brand-primary",
}

const statusLabels: Record<OrganicCalendarDraft["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  streaming: "Streaming",
  placeholder: "Seeded",
}

export function PlatformBadge({ platform }: { platform: OrganicPlatformTag }) {
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

export function StatusBadge({ status, format }: { status: OrganicCalendarDraft["status"], format?: string }) {
  if (format === "Newsletter") {
    return (
      <span className="inline-flex items-center rounded-full border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-100">
        Newsletter
      </span>
    )
  }
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

export function CalendarDraftCard({
  draft,
  isSelected,
  isMultiSelected,
  onSelect,
  onToggleSelection,
  onDragStart,
  onRegenerate,
  onMouseEnter,
  onMouseLeave,
}: {
  draft: OrganicCalendarDraft
  isSelected: boolean
  isMultiSelected: boolean
  onSelect: (id: string) => void
  onToggleSelection: (id: string) => void
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>, draftId: string) => void
  onRegenerate?: (draftId: string) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
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
              draggable={!!onDragStart}
              onDragStart={(event) => onDragStart?.(event, draft.id)}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
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
                    <span
                      role="button"
                      tabIndex={0}
                      className="inline-flex items-center justify-center h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface/50 rounded cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRegenerate(draft.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRegenerate(draft.id);
                        }
                      }}
                    >
                      <LightningBoltIcon className="h-3 w-3" />
                    </span>
                  )}
                  <StatusBadge status={draft.status} format={draft.format} />
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
