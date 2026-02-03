"use client"

import * as React from "react"
import {
  CheckIcon,
  LightningBoltIcon,
  MixerHorizontalIcon,
  QuestionMarkCircledIcon,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { OrganicCalendarDraft, OrganicPlatformTag } from "./types"

const platformStyles: Record<OrganicPlatformTag, string> = {
  instagram: "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-100 shadow-sm shadow-fuchsia-500/10",
  linkedin: "border-sky-500/40 bg-sky-500/15 text-sky-100 shadow-sm shadow-sky-500/10",
  facebook: "border-blue-600/40 bg-blue-600/15 text-blue-100",
  tiktok: "border-zinc-500/40 bg-zinc-500/15 text-zinc-100",
  youtube: "border-red-500/40 bg-red-500/15 text-red-100",
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
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        platformStyles[platform]
      )}
    >
      {platform === "instagram" ? "IG" : platform === "linkedin" ? "LinkedIn" : platform}
    </span>
  )
}

export function StatusBadge({ status, format }: { status: OrganicCalendarDraft["status"], format?: string }) {
  if (format === "Newsletter") {
    return (
      <span className="inline-flex items-center rounded-full border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-100">
        Newsletter
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        statusStyles[status]
      )}
    >
      {statusLabels[status]}
    </span>
  )
}

function DraftHoverCardContent({ draft }: { draft: OrganicCalendarDraft }) {
  return (
    <HoverCardContent side="right" align="start" className="w-[380px] p-0 overflow-hidden bg-slate-950 border-slate-800 shadow-2xl">
      <div className="flex flex-col">
        <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between">
           <div className="flex items-center gap-2">
              <PlatformBadge platform={draft.platforms[0]} />
              <StatusBadge status={draft.status} />
           </div>
           <span className="text-xs text-secondary font-mono">{draft.timeLabel}</span>
        </div>

        <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
          {draft.titleTopic && (
            <div className="space-y-1">
              <h4 className="text-[10px] uppercase tracking-widest text-secondary font-bold opacity-70">Post Idea</h4>
              <p className="text-xs text-primary leading-relaxed font-medium">{draft.titleTopic}</p>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-widest text-secondary font-bold opacity-70">Creative Direction</h4>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <p className="text-sm font-semibold text-primary leading-snug">
                {draft.creativeIdea || draft.summary}
              </p>
              {draft.assetHints && draft.assetHints.length > 0 && (
                <div className="mt-3 space-y-2">
                   {draft.assetHints.slice(0, 3).map((hint, idx) => (
                     <div key={idx} className="text-[11px] text-secondary leading-relaxed pl-2 border-l border-brand-primary/30">
                        <span className="font-bold text-brand-primary/70 mr-1">{hint.role}:</span>
                        {hint.suggestion}
                     </div>
                   ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <h4 className="text-[10px] uppercase tracking-widest text-secondary font-bold opacity-70">Caption Preview</h4>
            <p className="text-xs text-secondary line-clamp-6 leading-relaxed italic whitespace-pre-wrap">
              "{draft.captionPreview}"
            </p>
          </div>
        </div>
        
        <div className="px-4 py-3 bg-slate-900/30 border-t border-slate-800 flex items-center justify-between gap-4 mt-auto">
            <div className="flex gap-4">
               <div className="flex flex-col">
                 <span className="text-[9px] text-secondary uppercase font-bold opacity-50">Format</span>
                 <span className="text-xs text-primary font-medium">{draft.format}</span>
               </div>
               <div className="flex flex-col">
                 <span className="text-[9px] text-secondary uppercase font-bold opacity-50">Objective</span>
                 <span className="text-xs text-primary font-medium">{draft.objective}</span>
               </div>
            </div>
            {draft.progress !== undefined && (
               <div className="flex-1 max-w-[100px] space-y-1">
                 <div className="flex justify-between text-[9px] text-secondary font-bold">
                   <span>STREAMING</span>
                   <span>{draft.progress}%</span>
                 </div>
                 <Progress value={draft.progress} className="h-1" />
               </div>
            )}
        </div>
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
  const platform = draft.platforms[0] || "instagram"

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
              aria-pressed={isSelected || isMultiSelected}
              className={cn(
                "group relative w-full rounded-lg border px-3 py-2.5 text-left transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
                isSelected
                  ? "border-2 border-brand-primary bg-brand-primary/10 shadow-[0_0_15px_rgba(var(--brand-primary-rgb),0.3)] z-10 scale-[1.02]"
                  : isMultiSelected
                  ? "border-2 border-brand-primary/50 bg-brand-primary/5"
                  : cn(
                      "border-subtle bg-surface/70 hover:bg-surface",
                      platform === "instagram" ? "hover:border-fuchsia-500/50" : "hover:border-sky-500/50"
                    ),
                draft.status === "placeholder" && "opacity-80 grayscale-[0.5]"
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-secondary/60 font-bold">
                    {draft.timeLabel}
                  </span>
                  {draft.titleTopic && (
                    <TooltipProvider>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <div 
                            className="p-0.5 -m-0.5 cursor-help"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <QuestionMarkCircledIcon 
                              className="w-3.5 h-3.5 text-secondary/40 hover:text-brand-primary transition-colors" 
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px] text-[11px] bg-slate-900 border-slate-800 text-slate-200">
                          <p className="font-bold mb-1 text-brand-primary/90">Post Idea</p>
                          {draft.titleTopic}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {isMultiSelected && (
                    <div className="w-3.5 h-3.5 bg-brand-primary rounded-full flex items-center justify-center">
                      <CheckIcon className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  {onRegenerate && draft.status !== "streaming" && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Regenerate draft"
                      className="inline-flex items-center justify-center h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface/50 rounded cursor-pointer"
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
                      <LightningBoltIcon className="h-3.5 w-3.5 text-brand-primary" />
                    </span>
                  )}
                  <StatusBadge status={draft.status} format={draft.format} />
                </div>
              </div>

              <p className="text-sm font-bold text-primary line-clamp-2 leading-tight tracking-tight">
                {draft.creativeIdea || draft.title}
              </p>
              
              <p className="mt-1 text-[11px] text-secondary line-clamp-2 leading-snug opacity-70 font-medium">
                {draft.captionPreview}
              </p>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex gap-1.5">
                  {draft.platforms.map((p) => (
                    <PlatformBadge key={p} platform={p} />
                  ))}
                </div>
                <span className="text-[10px] text-secondary font-bold uppercase tracking-widest opacity-40">
                  {draft.format}
                </span>
              </div>

              {typeof draft.progress === "number" ? (
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold text-secondary uppercase tracking-tighter">
                    <span>Streaming</span>
                    <span>{draft.progress}%</span>
                  </div>
                  <Progress value={draft.progress} className="h-1" />
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
