"use client";

import * as React from "react";
import {
  CopyIcon,
  CheckIcon,
  LightningBoltIcon,
  Pencil1Icon,
  QuestionMarkCircledIcon,
  TrashIcon,
} from "@radix-ui/react-icons";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
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
import { useCalendarStore } from "@/lib/organic/store";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";

const QUICK_PLATFORM_OPTIONS: OrganicPlatformKey[] = ["instagram", "facebook", "linkedin"];
const QUICK_TIME_OPTIONS = ["9:00 AM", "1:00 PM", "5:00 PM"] as const;
const QUICK_PLATFORM_LABELS: Record<OrganicPlatformKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
};

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
  const [isHovered, setIsHovered] = React.useState(false);
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  const moveDraft = useCalendarStore((state) => state.moveDraft);
  const bulkDeleteDrafts = useCalendarStore((state) => state.bulkDeleteDrafts);
  const addDraft = useCalendarStore((state) => state.addDraft);

  const focusEditor = React.useCallback(
    (draftId: string) => {
      onSelect(draftId);
    },
    [onSelect]
  );

  const applyQuickEdit = React.useCallback(
    (updater: (currentDraft: OrganicCalendarDraft) => OrganicCalendarDraft) => {
      updateDraft(draft.id, updater);
      focusEditor(draft.id);
    },
    [draft.id, focusEditor, updateDraft]
  );

  const duplicateToUnscheduled = React.useCallback(() => {
    const nextId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `${draft.id}-copy-${crypto.randomUUID()}`
        : `${draft.id}-copy-${Date.now()}`;
    const duplicate: OrganicCalendarDraft = {
      ...draft,
      id: nextId,
      status: "draft",
      title: `${draft.title} (Copy)`,
    };
    addDraft("unscheduled", duplicate);
    focusEditor(nextId);
  }, [addDraft, draft, focusEditor]);

  const setCustomTime = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const nextTime = window.prompt("Set posting time (e.g. 11:15 AM)", draft.timeLabel);
    if (!nextTime) return;

    const trimmed = nextTime.trim();
    if (!trimmed) return;

    applyQuickEdit((currentDraft) => ({
      ...currentDraft,
      timeLabel: trimmed,
    }));
  }, [applyQuickEdit, draft.timeLabel]);

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
              onMouseEnter={() => {
                setIsHovered(true);
                onMouseEnter?.();
              }}
              onMouseLeave={() => {
                setIsHovered(false);
                onMouseLeave?.();
              }}
              aria-pressed={isSelected || isMultiSelected}
              className={cn(
                cardVariants({
                  selected: isSelected,
                  multiSelected: isMultiSelected,
                  streaming: isStreaming,
                  platformHover: isSelected ? "none" : platform,
                }),
                isHovered &&
                  !isSelected &&
                  "scale-[1.015] -translate-y-0.5 border-sky-400/30 shadow-[0_10px_26px_rgba(14,165,233,.18)]",
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
                
                <p className={cn(
                  "mt-1 text-[11px] text-secondary leading-snug opacity-70 font-medium transition-all",
                  isHovered ? "line-clamp-3" : "line-clamp-2"
                )}>
                  {draft.captionPreview}
                </p>

                <div
                  className={cn(
                    "grid transition-all",
                    isHovered ? "mt-2 max-h-16 opacity-100" : "max-h-0 opacity-0 overflow-hidden"
                  )}
                >
                  <div className="rounded border border-slate-700/80 bg-slate-900/70 px-2 py-1.5">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-slate-400">
                      Quick Preview
                    </p>
                    <p className="mt-1 line-clamp-2 text-[10px] text-slate-200">
                      {draft.objective}
                      {draft.cta ? ` • CTA: ${draft.cta}` : ""}
                    </p>
                  </div>
                </div>

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
          <ContextMenuLabel>Quick Edit</ContextMenuLabel>
          <ContextMenuItem onSelect={() => focusEditor(draft.id)}>
            <Pencil1Icon className="mr-2 h-3.5 w-3.5" />
            Open in editor
          </ContextMenuItem>
          <ContextMenuSeparator />
          {QUICK_PLATFORM_OPTIONS.map((option) => (
            <ContextMenuItem
              key={option}
              onSelect={() =>
                applyQuickEdit((currentDraft) => ({
                  ...currentDraft,
                  platforms: [option],
                }))
              }
            >
              Platform: {QUICK_PLATFORM_LABELS[option]}
            </ContextMenuItem>
          ))}
          {QUICK_TIME_OPTIONS.map((time) => (
            <ContextMenuItem
              key={time}
              onSelect={() =>
                applyQuickEdit((currentDraft) => ({
                  ...currentDraft,
                  timeLabel: time,
                }))
              }
            >
              Time: {time}
            </ContextMenuItem>
          ))}
          <ContextMenuItem onSelect={setCustomTime}>
            Time: Custom...
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              applyQuickEdit((currentDraft) => ({
                ...currentDraft,
                status: "scheduled",
              }))
            }
          >
            Mark as scheduled
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              applyQuickEdit((currentDraft) => ({
                ...currentDraft,
                status: "draft",
              }))
            }
          >
            Mark as draft
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={duplicateToUnscheduled}>
            <CopyIcon className="mr-2 h-3.5 w-3.5" />
            Duplicate to unscheduled
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              moveDraft(draft.id, "unscheduled");
              focusEditor(draft.id);
            }}
          >
            Send to unscheduled
          </ContextMenuItem>
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => bulkDeleteDrafts([draft.id])}
          >
            <TrashIcon className="mr-2 h-3.5 w-3.5" />
            Delete draft
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <HoverCardContent side="right" align="start" className="p-0 border-none bg-transparent shadow-none" avoidCollisions>
         <DraftHoverCardContent draft={draft} />
      </HoverCardContent>
    </HoverCard>
  );
}
