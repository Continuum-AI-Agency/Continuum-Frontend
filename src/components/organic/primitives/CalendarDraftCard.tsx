'use client';

import {
  CheckIcon,
  CopyIcon,
  Cross2Icon,
  ImageIcon,
  LightningBoltIcon,
  Pencil1Icon,
  QuestionMarkCircledIcon,
  TrashIcon,
} from '@radix-ui/react-icons';
import { GalleryHorizontalEnd } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import Image from 'next/image';
import * as React from 'react';
import { useApproveScheduleDraft } from '@/components/organic/hooks/useApproveScheduleDraft';
import { useProgressAnimation } from '@/components/organic/hooks/useProgressAnimation';
import { usePublishDraft } from '@/components/organic/hooks/usePublishDraft';
import { useUnscheduleDraft } from '@/components/organic/hooks/useUnscheduleDraft';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { isCarouselFormat, resolveCarouselSlideCount } from '@/lib/organic/carousel';
import { evaluateDraftReadiness } from '@/lib/organic/draftReadiness';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import { inferPublishPlatform } from '@/lib/organic/publish-utils';
import { isValidTimeLabel, normalizeTimeLabel } from '@/lib/organic/scheduling';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { useOpenDraftInAiStudio } from './AiStudioHandoffContext';
import { PlatformBadge, StatusBadge } from './DraftCardBadges';
import { useDraftDeletionConfirmation } from './DraftDeletionConfirmation';
import { DraftHoverCardContent } from './DraftHoverCardContent';
import { MediaStagePill, resolveDraftMediaStage } from './DraftLifecycle';
import { DuplicateDayPicker } from './DuplicateDayPicker';
import { cardVariants, draftStatusPresentation } from './draft-card-styles';
import type { OrganicCalendarDraft } from './types';

const QUICK_PLATFORM_OPTIONS: OrganicPlatformKey[] = ['instagram', 'facebook', 'linkedin'];
const QUICK_TIME_OPTIONS = ['9:00 AM', '1:00 PM', '5:00 PM'] as const;
const QUICK_PLATFORM_LABELS: Record<OrganicPlatformKey, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

// The left rail says WHERE the post goes; the status pill and the top strip say WHAT
// STATE it is in. Keeping the two axes apart is why the rail no longer turns emerald
// on publish — a card that changed both its channel color and its status color at once
// left the reader guessing which fact had changed.
const PLATFORM_ACCENT: Record<string, string> = {
  instagram: '#E1306C',
  linkedin: '#0A66C2',
  facebook: '#1877F2',
  tiktok: '#69C9D0',
  youtube: '#FF0000',
  twitter: '#1DA1F2',
};

function resolvePlatformAccentColor(platform: string): string {
  return PLATFORM_ACCENT[platform] ?? '#5A48F9';
}

function hasTextValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const PUBLISH_PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
};

// Ghost per-stage CTA rendered INSIDE the card's own <button> — a real <button>
// here would be invalid HTML nesting, so it follows the card's role="button"
// span pattern. Kept visually calm: outline chip, muted until hover.
function CardStageAction({ label, onActivate }: { label: string; onActivate: () => void }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: nested inside the card's own <button>; a real <button> here is invalid HTML nesting
    <span
      role="button"
      tabIndex={0}
      className="inline-flex shrink-0 items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onActivate();
        }
      }}
    >
      <LightningBoltIcon className="h-2.5 w-2.5" aria-hidden />
      {label}
    </span>
  );
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
  onEnrich,
  onRealize,
  onStitch,
  isDragging = false,
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
  /** Stage-2 "Enrich" (blueprint sketch) for a text-only draft. */
  onEnrich?: (draftId: string) => void;
  /** Stage-3 "Generate final media" for a storyboard-ready draft. */
  onRealize?: (draftId: string) => void;
  /** Opens the shared render inbox for already-generated reel clips. */
  onStitch?: (draftId: string) => void;
  /** From `useDraftDragHandle`. A pointer-up that ended a drag is not a selection click. */
  isDragging?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const platform = (draft.platforms[0] || 'instagram') as
    | 'instagram'
    | 'linkedin'
    | 'facebook'
    | 'tiktok'
    | 'youtube'
    | 'twitter';
  const isStreaming = draft.status === 'streaming';
  const isFailed = draft.status === 'failed';
  const isAssignedToDay = draft.dateLabel.trim().length > 0;
  const hasValidTimeLabel = isValidTimeLabel(draft.timeLabel);
  const canMarkScheduled = isAssignedToDay && hasValidTimeLabel;
  const reduceMotion = useReducedMotion();
  const [timePickerOpen, setTimePickerOpen] = React.useState(false);
  const [duplicatePickerOpen, setDuplicatePickerOpen] = React.useState(false);
  const [pendingTime, setPendingTime] = React.useState(draft.timeLabel);
  const [timeError, setTimeError] = React.useState<string | null>(null);
  const [isHoverPreviewOpen, setIsHoverPreviewOpen] = React.useState(false);
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  const bulkDeleteDrafts = useCalendarStore((state) => state.bulkDeleteDrafts);
  const { requestDraftDeletion } = useDraftDeletionConfirmation();
  const duplicateDraft = useCalendarStore((state) => state.duplicateDraft);
  const beginEditingDraft = useCalendarStore((state) => state.beginEditingDraft);
  const { publish, isPublishing } = usePublishDraft();
  const { approveAndSchedule, isApproving } = useApproveScheduleDraft();
  const { unschedule, isUnscheduling } = useUnscheduleDraft();
  const displayProgress = useProgressAnimation(draft.progress, draft.generationStage);
  const openInStudio = useOpenDraftInAiStudio();
  const publishPlatform = inferPublishPlatform(draft);
  const canPublish =
    publishPlatform !== null && draft.status !== 'published' && draft.status !== 'streaming';
  // usePublishDraft enforces this; naming it here turns a click that silently refuses into
  // a disabled item that says why.
  const publishBlockedReason = evaluateDraftReadiness(draft).reason;

  const accentColor = resolvePlatformAccentColor(platform);
  const statusPresentation = draftStatusPresentation(draft.status);
  // A week is only scannable if a card can show its whole idea. Cards stay clamped at
  // rest — the grid keeps its rhythm — and reveal the full title/copy on hover, or
  // whenever the card is the selected one being edited.
  const revealTitleClass = isSelected ? '' : 'line-clamp-2 group-hover:line-clamp-none';
  const revealCaptionClass = isSelected ? 'line-clamp-6' : 'line-clamp-2 group-hover:line-clamp-6';
  // Enrichment state is the authoritative backend media_stage (with a derived
  // fallback for ephemeral stream drafts) — the single source the card and the
  // editor share, never re-classified ad-hoc per surface.
  const realizedMediaCount = draft.publishingAssets?.length ?? 0;
  // A carousel is either declared by format or evidenced by multiple slides — so
  // the affordance shows even before any media is realized.
  const isCarousel = isCarouselFormat(draft.format) || (draft.slideCount ?? 0) > 1;
  const carouselSlideCount = resolveCarouselSlideCount({
    slideCount: draft.slideCount,
    realizedMediaCount,
  });
  const storyboardFrames =
    draft.mediaSuggestion?.storyboard?.filter((frame) => hasTextValue(frame?.storageUrl)) ?? [];
  const ugc = draft.mediaSuggestion?.ugc ?? draft.mediaSuggestion?.reel?.ugc;
  const characterReferenceCount =
    ugc?.references.filter((reference) => reference.role === 'character').length ?? 0;
  const productReferenceCount =
    ugc?.references.filter((reference) => reference.role === 'product').length ?? 0;
  const mediaStage = resolveDraftMediaStage(draft);
  const isMediaGenerating = mediaStage === 'realizing';
  const hasRealizedMedia = mediaStage === 'realized';
  const isStoryboardReady = mediaStage === 'storyboard_ready';
  // A text-only draft awaiting enrichment — but not while a status already
  // telegraphs its own state (streaming/placeholder/published).
  const isTextOnlyDraft =
    mediaStage === 'text_only' &&
    draft.status !== 'streaming' &&
    draft.status !== 'placeholder' &&
    draft.status !== 'published';
  const showHoverPreview = draft.status !== 'streaming' && draft.status !== 'placeholder';

  // Drag start has to close an already-open preview, not merely refuse to open a new one.
  React.useEffect(() => {
    if (isDragging) setIsHoverPreviewOpen(false);
  }, [isDragging]);

  // Selection only — a quick edit (time preset, retry) should bring the draft into
  // the panel, not force the panel into edit mode.
  const focusEditor = React.useCallback(
    (draftId: string) => {
      onSelect(draftId);
    },
    [onSelect],
  );

  const applyQuickEdit = React.useCallback(
    (updater: (currentDraft: OrganicCalendarDraft) => OrganicCalendarDraft) => {
      updateDraft(draft.id, updater);
      focusEditor(draft.id);
    },
    [draft.id, focusEditor, updateDraft],
  );

  const clearFailure = React.useCallback(() => {
    if (onClearFailure) {
      onClearFailure(draft.id);
      return;
    }
    applyQuickEdit((currentDraft) => ({
      ...currentDraft,
      status: currentDraft.seedTrendId ? 'placeholder' : 'draft',
      generationError: undefined,
    }));
  }, [applyQuickEdit, draft.id, onClearFailure]);

  const applyCustomTime = React.useCallback(() => {
    const normalized = normalizeTimeLabel(pendingTime.trim());
    if (!normalized) {
      setTimeError('Use format like 9:00 AM or 14:00');
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
                // Selecting a card must not also focus its day — the enclosing cell
                // treats a click as "focus this day" for context-free create actions.
                e.stopPropagation();
                // A drag ends in a click on the card it started from. Without this the
                // 8px activation threshold was the only thing separating "move this post"
                // from "open this post", so any drag also swapped the preview panel.
                if (isDragging) return;
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
                'group',
                cardVariants({
                  selected: isSelected,
                  multiSelected: isMultiSelected,
                  streaming: isStreaming,
                  failed: isFailed,
                  platformHover: isSelected ? 'none' : platform,
                }),
                draft.status === 'placeholder' &&
                  'border-dashed border-muted-foreground/30 bg-muted/20',
              )}
            >
              {/* Top-edge status strip — same hue as the status pill (one source of truth). */}
              {(isStreaming ||
                isFailed ||
                draft.status === 'scheduled' ||
                draft.status === 'published') && (
                <div
                  className={cn(
                    'absolute top-0 left-0 right-0 h-0.5',
                    isStreaming
                      ? 'bg-gradient-to-r from-transparent via-warning to-transparent animate-shimmer'
                      : statusPresentation.strip,
                  )}
                  style={isStreaming ? { backgroundSize: '200% 100%' } : undefined}
                  aria-hidden
                />
              )}

              {/* Streaming shimmer */}
              {isStreaming && !reduceMotion && (
                <div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-shimmer"
                  style={{ backgroundSize: '200% 100%' }}
                />
              )}

              {/* Platform accent left bar */}
              <div
                className={cn(
                  'absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg',
                  isStreaming && 'animate-pulse',
                )}
                style={{ backgroundColor: accentColor }}
                aria-hidden
              />

              <div className="relative z-10 pl-1">
                {/* Header row: time | multi-select | regen | status pill. The row wraps so the
                    readable pill survives the narrowest planner column instead of being clipped. */}
                <div className="mb-1.5 flex min-w-0 flex-wrap items-center justify-between gap-y-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-2xs uppercase tracking-wider text-muted-foreground/70 font-bold">
                      {draft.timeLabel}
                    </span>
                    {draft.titleTopic && (
                      <TooltipProvider>
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                            {/* biome-ignore lint/a11y/noStaticElementInteractions: tooltip target (help affordance), not a control */}
                            {/* biome-ignore lint/a11y/useKeyWithClickEvents: onClick only stops the card button from activating; the tooltip opens on hover/focus */}
                            <div
                              className="p-0.5 -m-0.5 cursor-help"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <QuestionMarkCircledIcon className="h-3.5 w-3.5 text-muted-foreground/50 transition-colors hover:text-brand-primary" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-[200px] border-border/70 bg-popover text-popover-foreground text-xs"
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
                    {onRegenerate && draft.status !== 'streaming' && (
                      // biome-ignore lint/a11y/useSemanticElements: nested inside the card's own <button>; a real <button> here is invalid HTML nesting
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={isFailed ? 'Retry failed draft' : 'Regenerate draft'}
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
                    <StatusBadge
                      status={draft.status}
                      format={draft.format}
                      className={cn(
                        'px-1.5 py-0 text-3xs font-bold uppercase tracking-wider',
                        isStreaming && 'animate-pulse',
                      )}
                    />
                  </div>
                </div>

                {/* Title — clamped at rest, revealed in full on hover (see revealTitleClass). */}
                <p
                  className={cn(
                    'text-sm font-semibold leading-tight tracking-tight text-foreground',
                    revealTitleClass,
                    isStreaming && 'animate-pulse opacity-70',
                  )}
                >
                  {draft.creativeIdea || draft.title}
                </p>

                {/* Inline streaming status */}
                {isStreaming && (
                  <p className="mt-0.5 text-2xs text-brand-primary/80 font-medium">
                    {draft.generationStage
                      ? `Generating · ${draft.generationStage}`
                      : 'Generating...'}
                  </p>
                )}

                {/* Caption */}
                <p
                  className={cn(
                    'mt-1 text-xs font-medium leading-snug text-muted-foreground',
                    revealCaptionClass,
                  )}
                >
                  {draft.captionPreview}
                </p>

                {draft.status === 'placeholder' && (
                  <p className="mt-1.5 text-2xs italic text-muted-foreground/60">
                    Awaiting generation
                  </p>
                )}

                {/* Generation progress */}
                {typeof displayProgress === 'number' ? (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-2xs font-bold uppercase tracking-tighter text-muted-foreground">
                      <span className="text-primary animate-pulse">GENERATING</span>
                      <span>{displayProgress}%</span>
                    </div>
                    <Progress value={displayProgress} className="h-1" />
                  </div>
                ) : null}

                {/* Error state */}
                {isFailed && draft.generationError ? (
                  <div className="mt-2 rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-destructive">
                      Generation failed
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-2xs text-destructive/90">
                      {draft.generationError}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      {onRegenerate ? (
                        // biome-ignore lint/a11y/useSemanticElements: nested inside the card's own <button>; a real <button> here is invalid HTML nesting
                        <span
                          role="button"
                          tabIndex={0}
                          className="inline-flex items-center gap-1 rounded border border-destructive/40 px-2 py-0.5 text-2xs text-destructive hover:bg-destructive/20"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRegenerate(draft.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
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
                      {/* biome-ignore lint/a11y/useSemanticElements: nested inside the card's own <button>; a real <button> here is invalid HTML nesting */}
                      <span
                        role="button"
                        tabIndex={0}
                        className="inline-flex items-center gap-1 rounded border border-destructive/40 px-2 py-0.5 text-2xs text-destructive hover:bg-destructive/20"
                        onClick={(event) => {
                          event.stopPropagation();
                          clearFailure();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
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
                  <p className="mt-1.5 flex items-center gap-1 text-2xs font-medium text-primary/80">
                    <span
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
                      aria-hidden
                    />
                    {draft.generationStage ?? 'Generating media…'}
                  </p>
                ) : isStoryboardReady ? (
                  <div className="mt-2 space-y-1">
                    {ugc ? (
                      <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 text-2xs font-medium text-primary">
                        UGC · {characterReferenceCount} character
                        {characterReferenceCount === 1 ? '' : 's'} locked
                        {productReferenceCount > 0
                          ? ` · ${productReferenceCount} product${productReferenceCount === 1 ? '' : 's'}`
                          : ''}
                      </span>
                    ) : null}
                    <span className="flex flex-wrap items-center gap-1.5">
                      <MediaStagePill mediaStage="storyboard_ready" />
                      {draft.mediaSuggestion?.reel?.composition &&
                      onStitch &&
                      draft.backendDraftId &&
                      !isStreaming ? (
                        <CardStageAction
                          label="Ready to render"
                          onActivate={() => onStitch(draft.id)}
                        />
                      ) : null}
                      {onRealize && draft.backendDraftId && !isStreaming ? (
                        <CardStageAction
                          label={
                            draft.mediaSuggestion?.reel?.composition
                              ? 'Edit in AI Studio'
                              : 'Generate final media'
                          }
                          onActivate={() => onRealize(draft.id)}
                        />
                      ) : null}
                    </span>
                    {storyboardFrames.length > 0 && (
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
                          <span className="text-2xs font-medium text-muted-foreground/60">
                            +{storyboardFrames.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : mediaStage === 'failed' ? (
                  <p className="mt-1.5">
                    <MediaStagePill mediaStage="failed" />
                  </p>
                ) : isTextOnlyDraft ? (
                  // The row wraps and the sentence truncates so the action keeps its full
                  // width at the narrowest planner column — it used to render as "En…".
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="min-w-0 truncate text-2xs italic text-muted-foreground/60">
                      Text only — no media yet
                    </span>
                    {onEnrich && draft.backendDraftId ? (
                      <CardStageAction label="Enrich" onActivate={() => onEnrich(draft.id)} />
                    ) : null}
                  </p>
                ) : null}

                {/* Footer: platforms | media chip | format */}
                <div className="mt-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {draft.platforms.map((p) => (
                      <PlatformBadge key={p} platform={p} />
                    ))}
                    {isCarousel ? (
                      <span
                        className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground/70 ml-0.5"
                        title={
                          carouselSlideCount > 1
                            ? `Carousel · ${carouselSlideCount} slides`
                            : 'Carousel'
                        }
                      >
                        <GalleryHorizontalEnd className="h-2.5 w-2.5" />
                        {carouselSlideCount > 1 ? carouselSlideCount : null}
                      </span>
                    ) : hasRealizedMedia ? (
                      <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground/60 ml-0.5">
                        <ImageIcon className="h-2.5 w-2.5" />
                        {realizedMediaCount > 1 ? realizedMediaCount : null}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-2xs text-muted-foreground/70 font-bold uppercase tracking-widest">
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
          <ContextMenuItem onSelect={() => beginEditingDraft(draft.id)}>
            <Pencil1Icon className="mr-2 h-3.5 w-3.5" />
            Open in editor
          </ContextMenuItem>
          {draft.status !== 'streaming' && draft.status !== 'placeholder' ? (
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
            disabled={!canMarkScheduled || isApproving}
            onSelect={() => {
              if (canMarkScheduled) void approveAndSchedule(draft);
            }}
          >
            Approve & Schedule
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isUnscheduling}
            onSelect={() => {
              void unschedule(draft);
            }}
          >
            Move back to draft
          </ContextMenuItem>
          <ContextMenuSeparator />
          {onRegenerate ? (
            <ContextMenuItem onSelect={() => onRegenerate(draft.id)}>
              <LightningBoltIcon className="mr-2 h-3.5 w-3.5" />
              {isFailed ? 'Retry generation' : 'Regenerate'}
            </ContextMenuItem>
          ) : null}
          {isFailed ? (
            <ContextMenuItem onSelect={clearFailure}>
              <Cross2Icon className="mr-2 h-3.5 w-3.5" />
              Clear failure
            </ContextMenuItem>
          ) : null}
          {canPublish ? (
            <ContextMenuItem
              disabled={isPublishing || publishBlockedReason !== null}
              title={publishBlockedReason ?? undefined}
              onSelect={() => publish(draft)}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="mr-2 h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              {isPublishing
                ? 'Publishing…'
                : publishBlockedReason
                  ? `Publish to ${PUBLISH_PLATFORM_LABELS[publishPlatform ?? 'instagram']} — needs setup`
                  : `Publish to ${PUBLISH_PLATFORM_LABELS[publishPlatform ?? 'instagram']}`}
            </ContextMenuItem>
          ) : null}
          {openInStudio && draft.status !== 'streaming' && draft.status !== 'placeholder' ? (
            <ContextMenuItem onSelect={() => openInStudio(draft.id)}>
              {draft.mediaSuggestion?.reel?.composition ? 'Edit composition' : 'Open in AI Studio'}
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => requestDraftDeletion([draft.id], bulkDeleteDrafts)}
          >
            <TrashIcon className="mr-2 h-3.5 w-3.5" />
            Delete draft
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Time picker popover */}
      <PopoverContent side="top" align="start" className="w-56 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
            if (e.key === 'Enter') applyCustomTime();
            if (e.key === 'Escape') {
              setTimePickerOpen(false);
              setTimeError(null);
            }
          }}
          autoFocus
        />
        {timeError && <p className="mt-1 text-2xs text-destructive">{timeError}</p>}
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={applyCustomTime}
            className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Set
          </button>
          <button
            type="button"
            onClick={() => {
              setTimePickerOpen(false);
              setTimeError(null);
            }}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );

  const cardWithHover = showHoverPreview ? (
    // Controlled so a press-and-hold cannot pop the 272px preview under the cursor before
    // the drag sensor's 8px threshold is crossed — the preview then swallowed the drag.
    <HoverCard
      open={isHoverPreviewOpen}
      onOpenChange={(next) => {
        if (isDragging) return;
        setIsHoverPreviewOpen(next);
      }}
      openDelay={400}
      closeDelay={120}
    >
      <HoverCardTrigger asChild>{triggerButton}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="p-0 border-none bg-transparent shadow-none"
        avoidCollisions
      >
        <DraftHoverCardContent draft={draft} />
      </HoverCardContent>
    </HoverCard>
  ) : (
    triggerButton
  );

  return (
    <Popover open={duplicatePickerOpen} onOpenChange={setDuplicatePickerOpen}>
      <PopoverAnchor asChild>{cardWithHover}</PopoverAnchor>
      <PopoverContent side="right" align="start" className="w-auto p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Duplicate to...
        </p>
        <DuplicateDayPicker
          onSelect={(dayId) => {
            duplicateDraft(draft.id, dayId);
            setDuplicatePickerOpen(false);
          }}
          onCancel={() => setDuplicatePickerOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
