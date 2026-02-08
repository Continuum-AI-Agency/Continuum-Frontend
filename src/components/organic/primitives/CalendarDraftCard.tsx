"use client";

import * as React from "react";
import {
  CheckIcon,
  LightningBoltIcon,
  QuestionMarkCircledIcon,
} from "@radix-ui/react-icons";

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
} from "@/components/ui/context-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { OrganicCalendarDraft } from "./types";
import { PlatformBadge, StatusBadge } from "./DraftCardBadges";
import { DraftHoverCardContent } from "./DraftHoverCardContent";
import { cardVariants } from "./draft-card-styles";

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
  draft: OrganicCalendarDraft;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>, draftId: string) => void;
  onRegenerate?: (draftId: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const platform = (draft.platforms[0] || "instagram") as "instagram" | "linkedin" | "facebook" | "tiktok" | "youtube" | "twitter";
  const isStreaming = draft.status === "streaming";

  return (
    <HoverCard openDelay={250} closeDelay={120}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <HoverCardTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                if (e.shiftKey) {
                  onToggleSelection(draft.id);
                } else {
                  onSelect(draft.id);
                }
              }}
              draggable={!!onDragStart}
              onDragStart={(event) => onDragStart?.(event, draft.id)}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              aria-pressed={isSelected || isMultiSelected}
              className={cn(
                cardVariants({
                  selected: isSelected,
                  multiSelected: isMultiSelected,
                  streaming: isStreaming,
                  platformHover: isSelected ? "none" : platform,
                }),
                draft.status === "placeholder" && "opacity-80 grayscale-[0.5]"
              )}
            >
              {isStreaming && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/10 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
              )}
              
              <div className="relative z-10">
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

                <p className={cn(
                  "text-sm font-bold text-primary line-clamp-2 leading-tight tracking-tight font-serif",
                  isStreaming && "animate-pulse opacity-70"
                )}>
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
                      <span className="text-amber-500 animate-pulse">GENERATING</span>
                      <span>{draft.progress}%</span>
                    </div>
                    <Progress value={draft.progress} className="h-1 bg-slate-800" />
                  </div>
                ) : null}
              </div>
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
      <HoverCardContent side="right" align="start" className="p-0 border-none bg-transparent shadow-none" avoidCollisions>
         <DraftHoverCardContent draft={draft} />
      </HoverCardContent>
    </HoverCard>
  );
}
