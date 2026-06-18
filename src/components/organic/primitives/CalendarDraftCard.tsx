"use client";

import * as React from "react";
import Image from "next/image";
import {
  CopyIcon,
  CheckIcon,
  Cross2Icon,
  ImageIcon,
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
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { OrganicCalendarDraft } from "./types";
import { PlatformBadge, StatusDot } from "./DraftCardBadges";
import { DraftHoverCardContent } from "./DraftHoverCardContent";
import { DuplicateDayPicker } from "./DuplicateDayPicker";
import { cardVariants } from "./draft-card-styles";
import { useCalendarStore } from "@/lib/organic/store";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";
import { isValidTimeLabel, normalizeTimeLabel } from "@/lib/organic/scheduling";
import { useReducedMotion } from "motion/react";
import { usePublishDraft } from "@/components/organic/hooks/usePublishDraft"
import { useProgressAnimation } from "@/components/organic/hooks/useProgressAnimation";
import { useOpenDraftInAiStudio } from "./AiStudioHandoffContext";

const QUICK_PLATFORM_OPTIONS: OrganicPlatformKey[] = ["instagram", "facebook", "linkedin"];
const QUICK_TIME_OPTIONS = ["9:00 AM", "1:00 PM", "5:00 PM"] as const;
const QUICK_PLATFORM_LABELS: Record<OrganicPlatformKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
};

// Left-border accent colors per platform / status
const PLATFORM_ACCENT: Record<string, string> = {
  instagram: "#E1306C",
  linkedin: "#0A66C2",
  facebook: "#1877F2",
  tiktok: "#69C9D0",
  youtube: "#FF0000",
  twitter: "#1DA1F2",
};

function resolveAccentColor(
  draft: OrganicCalendarDraft,
  platform: string
): string {
  if (draft.status === "published") return "#10B981"; // emerald-500
  if (draft.status === "failed") return "#EF4444";    // red-500
  if (draft.status === "streaming") return "#5A48F9"; // brand-primary
  return PLATFORM_ACCENT[platform] ?? "#5A48F9";
}

function hasTextValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function CalendarDraftCard({
  draft,
  isSelected,
  isMultiSelected,
  onSelect,
  onToggleSelection,
  onDragStart,
  onRegenerate,
  onClearFailure,
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
  onClearFailure?: (draftId: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const platform = (draft.platforms[0] || "instagram") as
    | "instagram"
    | "linkedin"
    | "facebook"
    | "tiktok"
    | "youtube"
    | "twitter";
  const isStreaming = draft.status === "streaming";
  const isFailed = draft.status === "failed";
  const isAssignedToDay = draft.dateLabel.trim().length > 0;
  const hasValidTimeLabel = isValidTimeLabel(draft.timeLabel);
  const canMarkScheduled = isAssignedToDay && hasValidTimeLabel;
  const reduceMotion = useReducedMotion();
  const [timePickerOpen, setTimePickerOpen] = React.useState(false);
  const [duplicatePickerOpen, setDuplicatePickerOpen] = React.useState(false);
  const [pendingTime, setPendingTime] = React.useState(draft.timeLabel);
  const [timeError, setTimeError] = React.useState<string | null>(null);
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  const bulkDeleteDrafts = useCalendarStore((state) => state.bulkDeleteDrafts);
  const duplicateDraft = useCalendarStore((state) => state.duplicateDraft);
  const { publish, isPublishing } = usePublishDraft()
  const displayProgress = useProgressAnimation(draft.progress, draft.generationStage);
  const openInStudio = useOpenDraftInAiStudio();
  const canPublishToInstagram =
    draft.platforms.includes("instagram") &&
    draft.status !== "published" &&
    draft.status !== "streaming";

  const accentColor = resolveAccentColor(draft, platform);
  // Media presence is derived from ACTUAL realized media — durable
  // publishingAssets or a `ready` mediaStatus — never the seeded mediaCount,
  // which was historically defaulted to 1 even for text-only drafts.
  const realizedMediaCount = draft.publishingAssets?.length ?? 0;
  const mediaStatus = draft.mediaSuggestion?.mediaStatus;
  const hasRealizedMedia = realizedMediaCount > 0 || mediaStatus === "ready";
  const isMediaGenerating = mediaStatus === "generating";
  const storyboardFrames =
    draft.mediaSuggestion?.storyboard?.filter((frame) => hasTextValue(frame?.storageUrl)) ?? [];
  // A text-only (blueprint) draft: no realized media yet, not actively
  // generating, and not a status that already telegraphs its own state.
  const isTextOnlyDraft =
    !hasRealizedMedia &&
    !isMediaGenerating &&
    draft.status !== "streaming" &&
    draft.status !== "placeholder" &&
    draft.status !== "published";
  const showHoverPreview = draft.status !== "streaming" && draft.status !== "placeholder";

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

  const clearFailure = React.useCallback(() => {
    if (onClearFailure) {
      onClearFailure(draft.id);
      return;
    }
    applyQuickEdit((currentDraft) => ({
      ...currentDraft,
      status: currentDraft.seedTrendId ? "placeholder" : "draft",
      generationError: undefined,
    }));
  }, [applyQuickEdit, draft.id, onClearFailure]);

  const applyCustomTime = React.useCallback(() => {
    const normalized = normalizeTimeLabel(pendingTime.trim());
    if (!normalized) {
      setTimeError("Use format like 9:00 AM or 14:00");
      return;
    }
    setTimeError(null);
    applyQuickEdit((currentDraft) => ({
      ...currentDraft,
      timeLabel: normalized,
    }));
    setTimePickerOpen(false);
  }, [applyQuickEdit, pendingTime]);

  const triggerButton = (
    <Popover open={timePickerOpen} onOpenChange={setTimePickerOpen}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <PopoverAnchor asChild>
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
              onMouseEnter={() => onMouseEnter?.()}
              onMouseLeave={() => onMouseLeave?.()}
              aria-pressed={isSelected || isMultiSelected}
              className={cn(
                "group",
                cardVariants({
                  selected: isSelected,
                  multiSelected: isMultiSelected,
                  streaming: isStreaming,
                  failed: isFailed,
                  platformHover: isSelected ? "none" : platform,
                }),
                draft.status === "placeholder" && "border-dashed border-muted-foreground/30 bg-muted/20"
              )}
            >
              {/* Top-edge status strip */}
              {(isStreaming || isFailed || draft.status === "scheduled" || draft.status === "published") && (
                <div
                  className={cn(
                    "absolute top-0 left-0 right-0 h-0.5",
                    isStreaming && "bg-gradient-to-r from-transparent via-brand-primary to-transparent animate-shimmer",
                    isFailed && "bg-red-500",
                    draft.status === "scheduled" && "bg-primary/60",
                    draft.status === "published" && "bg-emerald-500"
                  )}
                  style={isStreaming ? { backgroundSize: "200% 100%" } : undefined}
                  aria-hidden
                />
              )}

              {/* Streaming shimmer */}
              {isStreaming && !reduceMotion && (
                <div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-shimmer"
                  style={{ backgroundSize: "200% 100%" }}
                />
              )}

              {/* Platform accent left bar */}
              <div
                className={cn(
                  "absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg",
                  isStreaming && "animate-pulse"
                )}
                style={{ backgroundColor: accentColor }}
                aria-hidden
              />

              <div className="relative z-10 pl-1">
                {/* Header row: time | multi-select | regen | status dot */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">
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
                              <QuestionMarkCircledIcon className="h-3.5 w-3.5 text-muted-foreground/50 transition-colors hover:text-brand-primary" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-[200px] border-border/70 bg-popover text-popover-foreground text-[11px]"
                          >
                            <p className="mb-1 font-bold text-brand-primary/90">Post Idea</p>
                            {draft.titleTopic}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isMultiSelected && (
                      <div className="w-3.5 h-3.5 bg-brand-primary rounded-full flex items-center justify-center">
                        <CheckIcon className="w-2.5 h-2.5 text-brand-primary-foreground" />
                      </div>
                    )}
                    {onRegenerate && draft.status !== "streaming" && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={isFailed ? "Retry failed draft" : "Regenerate draft"}
                        className="inline-flex items-center justify-center h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface/50 rounded cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRegenerate(draft.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRegenerate(draft.id);
                          }
                        }}
                      >
                        <LightningBoltIcon className="h-3.5 w-3.5 text-brand-primary" />
                      </span>
                    )}
                    <StatusDot status={draft.status} format={draft.format} />
                  </div>
                </div>

                {/* Title */}
                <p
                  className={cn(
                    "text-sm font-bold text-foreground line-clamp-2 leading-tight tracking-tight font-serif",
                    isStreaming && "animate-pulse opacity-70"
                  )}
                >
                  {draft.creativeIdea || draft.title}
                </p>

                {/* Inline streaming status */}
                {isStreaming && (
                  <p className="mt-0.5 text-[10px] text-brand-primary/80 font-medium">
                    {draft.generationStage ? `Generating · ${draft.generationStage}` : "Generating..."}
                  </p>
                )}

                {/* Caption */}
                <p className="mt-1 text-[11px] text-muted-foreground leading-snug font-medium line-clamp-2">
                  {draft.captionPreview}
                </p>

                {draft.status === "placeholder" && (
                  <p className="mt-1.5 text-[10px] italic text-muted-foreground/60">
                    Awaiting generation
                  </p>
                )}

                {/* Generation progress */}
                {typeof displayProgress === "number" ? (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
                      <span className="text-primary animate-pulse">GENERATING</span>
                      <span>{displayProgress}%</span>
                    </div>
                    <Progress value={displayProgress} className="h-1" />
                  </div>
                ) : null}

                {/* Error state */}
                {isFailed && draft.generationError ? (
                  <div className="mt-2 rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-destructive">
                      Generation failed
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-destructive/90">
                      {draft.generationError}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      {onRegenerate ? (
                        <span
                          role="button"
                          tabIndex={0}
                          className="inline-flex items-center gap-1 rounded border border-destructive/40 px-2 py-0.5 text-[10px] text-destructive hover:bg-destructive/20"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRegenerate(draft.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              onRegenerate(draft.id);
                            }
                          }}
                        >
                          <LightningBoltIcon className="h-3 w-3" />
                          Retry
                        </span>
                      ) : null}
                      <span
                        role="button"
                        tabIndex={0}
                        className="inline-flex items-center gap-1 rounded border border-destructive/40 px-2 py-0.5 text-[10px] text-destructive hover:bg-destructive/20"
                        onClick={(event) => {
                          event.stopPropagation();
                          clearFailure();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            clearFailure();
                          }
                        }}
                      >
                        <Cross2Icon className="h-3 w-3" />
                        Clear
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* Media state — honest about text-only / blueprint drafts.
                    Only realized media earns the image chip; a pending draft
                    shows its storyboard (when ready) or an explicit text-only
                    state, never a fake "has media" affordance. */}
                {isMediaGenerating ? (
                  <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-primary/80">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
                    {draft.generationStage ?? "Generating media…"}
                  </p>
                ) : isTextOnlyDraft && storyboardFrames.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                      Blueprint ready
                    </span>
                    <div className="flex items-center gap-1">
                      {storyboardFrames.slice(0, 3).map((frame, index) => (
                        <div
                          key={`${frame.storagePath ?? frame.storageUrl}-${index}`}
                          className="relative h-9 w-9 overflow-hidden rounded border border-border/60 bg-muted/40"
                        >
                          <Image
                            src={frame.storageUrl as string}
                            alt={`Storyboard frame ${index + 1}`}
                            fill
                            unoptimized
                            sizes="36px"
                            className="object-cover"
                          />
                        </div>
                      ))}
                      {storyboardFrames.length > 3 && (
                        <span className="text-[10px] font-medium text-muted-foreground/60">
                          +{storyboardFrames.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                ) : isTextOnlyDraft ? (
                  <p className="mt-1.5 text-[10px] italic text-muted-foreground/60">
                    Text only — no media yet
                  </p>
                ) : null}

                {/* Footer: platforms | media chip | format */}
                <div className="mt-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {draft.platforms.map((p) => (
                      <PlatformBadge key={p} platform={p} />
                    ))}
                    {hasRealizedMedia && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/60 ml-0.5">
                        <ImageIcon className="h-2.5 w-2.5" />
                        {realizedMediaCount > 1 ? realizedMediaCount : null}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground/70 font-bold uppercase tracking-widest">
                    {draft.format}
                  </span>
                </div>
              </div>
            </button>
          </PopoverAnchor>
        </ContextMenuTrigger>

        {/* Context menu */}
        <ContextMenuContent className="w-56">
            <ContextMenuLabel>Quick Edit</ContextMenuLabel>
            <ContextMenuItem onSelect={() => focusEditor(draft.id)}>
              <Pencil1Icon className="mr-2 h-3.5 w-3.5" />
              Open in editor
            </ContextMenuItem>
            {draft.status !== "streaming" && draft.status !== "placeholder" ? (
              <ContextMenuItem onSelect={() => setDuplicatePickerOpen(true)}>
                <CopyIcon className="mr-2 h-3.5 w-3.5" />
                Duplicate...
              </ContextMenuItem>
            ) : null}
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
            <ContextMenuItem
              onSelect={() => {
                setPendingTime(draft.timeLabel);
                setTimePickerOpen(true);
              }}
            >
              Time: Custom...
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!canMarkScheduled}
              onSelect={() =>
                canMarkScheduled &&
                applyQuickEdit((currentDraft) => ({
                  ...currentDraft,
                  status: "scheduled",
                }))
              }
            >
              Approve & Schedule
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() =>
                applyQuickEdit((currentDraft) => ({
                  ...currentDraft,
                  status: "draft",
                }))
              }
            >
              Move back to draft
            </ContextMenuItem>
            <ContextMenuSeparator />
            {onRegenerate ? (
              <ContextMenuItem onSelect={() => onRegenerate(draft.id)}>
                <LightningBoltIcon className="mr-2 h-3.5 w-3.5" />
                {isFailed ? "Retry generation" : "Regenerate"}
              </ContextMenuItem>
            ) : null}
            {isFailed ? (
              <ContextMenuItem onSelect={clearFailure}>
                <Cross2Icon className="mr-2 h-3.5 w-3.5" />
                Clear failure
              </ContextMenuItem>
            ) : null}
            {canPublishToInstagram ? (
              <ContextMenuItem
                disabled={isPublishing}
                onSelect={() => publish(draft)}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="mr-2 h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                {isPublishing ? "Publishing…" : "Publish to Instagram"}
              </ContextMenuItem>
            ) : null}
            {openInStudio && draft.status !== "streaming" && draft.status !== "placeholder" ? (
              <ContextMenuItem onSelect={() => openInStudio(draft.id)}>
                Open in AI Studio
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => bulkDeleteDrafts([draft.id])}
            >
              <TrashIcon className="mr-2 h-3.5 w-3.5" />
              Delete draft
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        {/* Time picker popover */}
        <PopoverContent side="top" align="start" className="w-56 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Set posting time
          </p>
          <Input
            value={pendingTime}
            onChange={(e) => {
              setPendingTime(e.target.value);
              setTimeError(null);
            }}
            placeholder="e.g. 11:15 AM"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") applyCustomTime();
              if (e.key === "Escape") { setTimePickerOpen(false); setTimeError(null); }
            }}
            autoFocus
          />
          {timeError && (
            <p className="mt-1 text-[10px] text-destructive">{timeError}</p>
          )}
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={applyCustomTime}
              className="flex-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Set
            </button>
            <button
              type="button"
              onClick={() => { setTimePickerOpen(false); setTimeError(null); }}
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </PopoverContent>
      </Popover>
  );

  const cardWithHover = showHoverPreview ? (
    <HoverCard openDelay={400} closeDelay={120}>
      <HoverCardTrigger asChild>{triggerButton}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="p-0 border-none bg-transparent shadow-none"
        avoidCollisions
      >
        <DraftHoverCardContent
          draft={draft}
          onEdit={focusEditor}
          onRegenerate={onRegenerate}
        />
      </HoverCardContent>
    </HoverCard>
  ) : triggerButton;

  return (
    <Popover open={duplicatePickerOpen} onOpenChange={setDuplicatePickerOpen}>
      <PopoverAnchor asChild>
        {cardWithHover}
      </PopoverAnchor>
      <PopoverContent side="right" align="start" className="w-auto p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Duplicate to...
        </p>
        <DuplicateDayPicker
          onSelect={(dayId) => {
            duplicateDraft(draft.id, dayId)
            setDuplicatePickerOpen(false)
          }}
          onCancel={() => setDuplicatePickerOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
