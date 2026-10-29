'use client';

import {
  type AdaptCaptionResponse,
  adaptCaptionResponseSchema,
  type MediaAsset,
  PUBLISH_PLATFORM_LABELS,
  type PublishFormat,
  type PublishOptionsByPlatform,
  type PublishPlan,
  type PublishPlatform,
  publishFormatForAssetKinds,
  resolvePublishFormat,
  supportsFormat,
} from '@continuum/contracts';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  ChevronLeft,
  ChevronRight,
  Info,
  Library,
  Loader2,
  Maximize2,
  PencilRuler,
  Replace,
  Send,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import * as React from 'react';
import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import {
  type SlotTarget,
  useDraftMediaPlacement,
} from '@/components/organic/hooks/useDraftMediaPlacement';
import { useDraftWithFreshMedia } from '@/components/organic/hooks/useDraftWithFreshMedia';
import { useDraftMembership } from '@/components/organic/hooks/useFanOutDraft';
import { useGenerateDraftMedia } from '@/components/organic/hooks/useGenerateDraftMedia';
import { usePublishDraft } from '@/components/organic/hooks/usePublishDraft';
import { usePublishPlan } from '@/components/organic/hooks/usePublishPlan';
import {
  type PublishOptionsChange,
  PublishOptionsPanel,
} from '@/components/organic/publish-options/PublishOptionsPanel';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { DraftHookViralityBadge } from '@/components/virality/DraftHookViralityBadge';
import { ApiError } from '@/lib/api/errors';
import { request } from '@/lib/api/http';
import { uploadDraftCreatives } from '@/lib/creative-assets/uploadDraftCreative';
import { aiStudioHandoffIssue } from '@/lib/organic/ai-studio-bridge';
import { evaluateDraftReadiness } from '@/lib/organic/draftReadiness';
import { groupMemberDrafts, isGroup, resolveFrameDraft } from '@/lib/organic/groupDraft';
import { platformVerdicts } from '@/lib/organic/platformSelection';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import { isPostPlatform, POST_PLATFORMS, type PostFormatOption } from '@/lib/organic/postPlatforms';
import { inferPublishPlatform, publishPlatformLabel } from '@/lib/organic/publish-utils';
import {
  accountsForPlatform,
  findAccount,
  usePublishAccountsState,
} from '@/lib/organic/publishTargets';
import { formatScheduleWithZone } from '@/lib/organic/scheduleLabel';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { resolveDraftHook } from '@/lib/virality/draftHook';
import { useDraftEnrichmentLadder } from '../hooks/useDraftEnrichmentLadder';
import {
  scheduleFieldPatch,
  useDraftFieldEditor,
  useDraftFieldPersistence,
} from '../hooks/useDraftFieldEditor';
import { useUnscheduleDraft } from '../hooks/useUnscheduleDraft';
import { useOpenDraftInAiStudio } from './AiStudioHandoffContext';
import { BlueprintStoryboard, resolveStoryboardFrames } from './BlueprintStoryboard';
import { CarouselSlideStrip } from './CarouselSlideStrip';
import { type DraftMediaKind, resolveDraftMedia } from './DraftCardMedia';
import { useDraftDeletionConfirmation } from './DraftDeletionConfirmation';
import {
  deriveMediaStageLabel,
  MediaEnrichmentSummary,
  resolveDraftMediaStage,
} from './DraftLifecycle';
import {
  INTEGRATIONS_SETTINGS_HREF,
  type ReadinessFixTarget,
  type ReadinessItem,
  ReadinessLine,
  ReviewFooter,
  ReviewIdentityRow,
} from './DraftReviewChrome';
import { draftStatusPresentation } from './draft-card-styles';
import { EditableCaption, InlinePreviewTextarea } from './EditableCaption';
import { HyperFramePlayer } from './HyperFramePlayer';
import { type LightboxItem, MediaLightbox } from './MediaLightbox';
import { MediaSelectPopover } from './MediaSelectPopover';
import { PlatformIcon, PlatformSelector } from './PlatformSelector';
import { PostCommandMenu } from './PostCommandMenu';
import { PostMetaChips } from './PostMetaChips';
import { type DropZoneFallbackAction, PreviewMediaDropZone } from './PreviewMediaDropZone';
import { SocialPostFrame } from './SocialPostFrame';
import {
  frameDayLabel,
  frameFormatLabel,
  type LoadedMediaSize,
  loadedMediaSize,
  previewFormat,
  resolvePreviewFrame,
} from './social-preview-utils';
import type { OrganicCalendarDraft } from './types';

interface OrganicDraftPreviewProps {
  draft: OrganicCalendarDraft;
  brandName?: string;
  brandProfileId?: string;
  /** Resolves once the post is approved (true) or refused; the button stays busy until then. */
  onApprove?: (draftId: string) => Promise<boolean> | void;
  onClose?: () => void;
  /** The panel's initial focus target: the account heading. */
  titleRef?: React.Ref<HTMLHeadingElement>;
  /** The wide panel's collapse chevron sits over the identity row's start. */
  insetStart?: boolean;
  brandTimeZone?: string;
  /** Stitch a composed reel into its final video; the workspace owns the job. */
  onStitch?: (draftId: string) => void;
  isStitching?: boolean;
}

/** The card with the frame's live copy (typing not yet in the store) in that row's place. */
function withLiveFrame(
  card: OrganicCalendarDraft,
  frame: OrganicCalendarDraft,
): OrganicCalendarDraft {
  if (frame.id === card.id) return frame;
  return {
    ...card,
    groupMembers: card.groupMembers?.map((member) =>
      member.draft?.id === frame.id ? { ...member, draft: frame } : member,
    ),
  };
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeSourceUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function resolveDraftMediaAltText(draft: OrganicCalendarDraft): string {
  const candidate =
    typeof draft.mediaSuggestion?.alt === 'string' ? draft.mediaSuggestion.alt.trim() : '';
  if (candidate.length > 0) return candidate;
  return draft.title || 'Generated draft image';
}

function resolveCreativeDirection(draft: OrganicCalendarDraft): string {
  return (
    draft.creativeDirectionPrompt?.trim() ||
    draft.creativeIdea?.trim() ||
    draft.summary?.trim() ||
    draft.title
  );
}

// Ordering is settled once, here. Downstream — badge, chevrons, dots, strip,
// lightbox, and every placement write — speaks array POSITION only. The persisted
// `slideIndex` is sparse, sometimes null and sometimes duplicated, so carrying it
// any further gave the preview two coordinate spaces that disagreed.
type PreviewSlide = {
  storageUrl: string;
  assetId?: string | null;
  storagePath: string;
  kind: DraftMediaKind;
  /** Poster frame for a video slide; `null` for an image. */
  poster: string | null;
  /** Stored pixel size, when the asset record carries one. Sizes the preview frame. */
  width?: number | null;
  height?: number | null;
};

// Storage-first: slides are durable published assets (storageUrl, refreshed by
// useDraftWithFreshMedia), ordered by slideIndex. Videos are slides too — filtering
// to `kind === 'image'` here is what left an attached video with zero slides, which
// the media area reads as "no media" and replaces with the library/upload split.
// What the platform receives, in the order it receives it. The plan's URL is the signed one
// the draft holds (fresh, through useDraftWithFreshMedia); a slide not yet signed waits.
// ponytail: an unsigned slide is skipped for that render, not drawn as a placeholder.
function slidesFromPlan(plan: PublishPlan, draft: OrganicCalendarDraft): PreviewSlide[] {
  const poster = plan.cover?.url ?? draft.mediaSuggestion?.reel?.thumbnailUrl ?? null;
  return plan.media.flatMap((media) =>
    media.url
      ? [
          {
            storageUrl: media.url,
            assetId: media.assetId,
            storagePath: media.storagePath ?? media.url,
            kind: media.kind,
            poster: media.kind === 'video' ? poster : null,
            width: media.width,
            height: media.height,
          },
        ]
      : [],
  );
}

function resolveCarouselSlides(draft: OrganicCalendarDraft): PreviewSlide[] {
  const reelPoster = draft.mediaSuggestion?.reel?.thumbnailUrl;
  const published = (draft.publishingAssets ?? [])
    .filter((a) => hasText(a.storageUrl))
    .sort((a, b) => (a.slideIndex ?? 999) - (b.slideIndex ?? 999));
  if (published.length > 0) {
    return published.map((a) => ({
      storageUrl: a.storageUrl,
      assetId: a.assetId,
      storagePath: a.storagePath,
      kind: a.kind === 'video' ? 'video' : 'image',
      poster: a.kind === 'video' && hasText(reelPoster) ? reelPoster.trim() : null,
      width: a.width,
      height: a.height,
    }));
  }

  const primary = resolveDraftMedia(draft);
  if (primary) {
    const suggestion = draft.mediaSuggestion;
    return [
      {
        storageUrl: primary.url,
        storagePath: primary.url,
        kind: primary.kind,
        poster: primary.poster,
        width: suggestion?.width ?? suggestion?.hyperframe?.width,
        height: suggestion?.height ?? suggestion?.hyperframe?.height,
      },
    ];
  }
  return [];
}

// One renderer for a slide, whatever its kind — ChatMediaThumb exists precisely
// because every earlier surface used an <img> and so rendered MP4s into image tags.
// Transparent, so a full-screen frame's black shows through where it letterboxes.
function PreviewSlideMedia({ slide, alt }: { slide: PreviewSlide; alt: string }) {
  // The preview IS the post, so a video shows its first frame. The chat tile loads no video
  // bytes until hover (right for a strip of thumbnails, wrong here), so the frame renders its
  // own <video> and falls back to the tile, which degrades to the poster, if this URL fails.
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  if (slide.kind === 'video' && slide.storageUrl && failedUrl !== slide.storageUrl) {
    return (
      <video
        // #t=0.01 paints the first frame when there is no poster, instead of a black box.
        src={slide.poster ? slide.storageUrl : `${slide.storageUrl}#t=0.01`}
        poster={slide.poster ?? undefined}
        preload="metadata"
        muted
        playsInline
        aria-label={alt}
        onError={() => setFailedUrl(slide.storageUrl)}
        className="absolute inset-0 size-full object-contain"
      />
    );
  }
  return (
    <ChatMediaThumb
      media={{
        id: slide.storagePath,
        url: slide.storageUrl,
        thumbnailUrl: slide.poster ?? undefined,
        kind: slide.kind,
        name: alt,
      }}
      className="absolute inset-0 rounded-none bg-transparent"
    />
  );
}

type SlideNavProps = {
  slides: PreviewSlide[];
  // Array position of the previewed slide; already clamped by the owner.
  activeIndex: number;
  onSelectSlide: (position: number) => void;
  // Chevrons move relative, never absolute: two clicks batched into one render
  // both computed from the same captured value and netted +1 for two clicks.
  onStepSlide: (delta: number) => void;
  onEnlargeSlide: (position: number) => void;
  // Full-screen frames (reel, story, TikTok photo post) carry their own chrome in the
  // corners and along the bottom, so the slide chrome steps out of the way there.
  overlayChrome?: boolean;
};

// The slide chrome shared by the editable and read-only media areas — creative,
// click-to-enlarge, position badge, chevrons, dots. Duplicating it is what let the
// two areas drift apart and needed every navigation fix applied twice.
function CarouselSlideNav({
  slides,
  activeIndex,
  alt,
  onSelectSlide,
  onStepSlide,
  onEnlargeSlide,
  overlayChrome = false,
}: SlideNavProps & { alt: string }) {
  const total = slides.length;
  const activeSlide = slides[activeIndex];
  if (!activeSlide) return null;
  const roundButton =
    'absolute flex h-7 w-7 items-center justify-center rounded-full bg-neutral-950/55 text-neutral-50 transition-colors';

  return (
    <>
      <PreviewSlideMedia slide={activeSlide} alt={`${alt} — slide ${activeIndex + 1}`} />

      {/* The creative itself opens the lightbox: full screen is where a slide is
          actually inspected, replaced or removed. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEnlargeSlide(activeIndex);
        }}
        className="group/enlarge absolute inset-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label="Enlarge creative"
      >
        {!overlayChrome && (
          <span className={cn(roundButton, 'left-2 top-2 group-hover/enlarge:bg-neutral-950/75')}>
            <Maximize2 className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {total > 1 && !overlayChrome && (
        <div className="absolute right-2 top-2 rounded-full bg-neutral-950/55 px-2 py-0.5 text-sm font-semibold text-neutral-50 tabular-nums">
          {activeIndex + 1}/{total}
        </div>
      )}

      {activeIndex > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStepSlide(-1);
          }}
          className={cn(roundButton, 'left-2 top-1/2 -translate-y-1/2 hover:bg-neutral-950/75')}
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {activeIndex < total - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStepSlide(1);
          }}
          className={cn(roundButton, 'right-2 top-1/2 -translate-y-1/2 hover:bg-neutral-950/75')}
          aria-label="Next slide"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {total > 1 && (
        <div
          className={cn(
            'absolute left-1/2 flex -translate-x-1/2 items-center gap-1',
            overlayChrome ? 'top-3' : 'bottom-2',
          )}
        >
          {slides.map((_, position) => (
            <button
              key={position}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectSlide(position);
              }}
              className={cn(
                'h-1.5 rounded-full transition-all',
                position === activeIndex ? 'w-4 bg-neutral-50' : 'w-1.5 bg-neutral-50/50',
              )}
              aria-label={`Slide ${position + 1}`}
            />
          ))}
        </div>
      )}
    </>
  );
}

// Facebook and LinkedIn show a multi-image post as a collage, not a pager: two side by
// side, three as one tall and two stacked, four or more as a 2×2 with "+N" on the last.
function SlideCollage({
  slides,
  alt,
  aspectRatio,
  onEnlargeSlide,
}: {
  slides: PreviewSlide[];
  alt: string;
  aspectRatio: number;
  onEnlargeSlide: (position: number) => void;
}) {
  const shown = slides.slice(0, 4);
  const hidden = slides.length - shown.length;
  return (
    <div
      className={cn('grid w-full grid-cols-2 gap-0.5 bg-card', shown.length > 2 && 'grid-rows-2')}
      style={{ aspectRatio: `${aspectRatio}` }}
    >
      {shown.map((slide, position) => (
        <button
          key={`${slide.storagePath}-${position}`}
          type="button"
          onClick={() => onEnlargeSlide(position)}
          aria-label={`Enlarge slide ${position + 1}`}
          className={cn(
            'relative min-h-0 overflow-hidden cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            shown.length === 3 && position === 0 && 'row-span-2',
          )}
        >
          <PreviewSlideMedia slide={slide} alt={`${alt} — slide ${position + 1}`} />
          {hidden > 0 && position === shown.length - 1 && (
            <span className="absolute inset-0 flex items-center justify-center bg-neutral-950/55 text-lg font-semibold text-neutral-50">
              +{hidden}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// Derive the visual style of the media status (drives Generate-button gating).
function resolveMediaStatusVariant(
  draft: OrganicCalendarDraft,
): 'default' | 'generating' | 'ready' | 'user_supplied' | 'pending' {
  const ms = draft.mediaSuggestion?.mediaStatus;
  if (ms === 'user_supplied') return 'user_supplied';
  if (ms === 'generating') return 'generating';
  if (ms === 'ready') return 'ready';
  return 'pending';
}

// Determines whether we should show the "Use your own creative" CTA in the media slot.
function shouldShowUseOwnCta(draft: OrganicCalendarDraft): boolean {
  const status = draft.status;
  if (status === 'failed') return true;
  const ms = draft.mediaSuggestion?.mediaStatus;
  const hasMedia = resolveDraftMedia(draft) !== null;
  if (!hasMedia && ms !== 'generating') return true;
  return false;
}

// The interactive media area — wraps the existing CarouselMediaArea visuals
// inside a PreviewMediaDropZone. When no media is present, renders the CTA.
function InteractiveCarouselMediaArea({
  draft,
  slides,
  alt,
  aspectRatio,
  slotId,
  onActivate,
  onNativeDrop,
  onSelectLibrary,
  onFilesChosen,
  isUploading,
  activeIndex,
  onSelectSlide,
  onStepSlide,
  placement,
  onGenerate,
  canGenerate,
  isGenerating,
  onEnrich,
  canEnrich,
  isEnriching,
  onEnlargeFrame,
  onEnlargeSlide,
  overlayChrome,
}: SlideNavProps & {
  draft: OrganicCalendarDraft;
  alt: string;
  aspectRatio: number;
  slotId: string;
  onActivate: () => void;
  onNativeDrop?: (assetId: string) => void;
  onSelectLibrary?: () => void;
  onFilesChosen?: (files: File[]) => void;
  isUploading?: boolean;
  placement?: ReturnType<typeof useDraftMediaPlacement>;
  onGenerate: () => void;
  canGenerate: boolean;
  isGenerating: boolean;
  onEnrich?: () => void;
  canEnrich?: boolean;
  isEnriching?: boolean;
  onEnlargeFrame: (index: number) => void;
}) {
  const total = slides.length;
  const showCta = shouldShowUseOwnCta(draft);
  // A draft with a persisted blueprint but no final media shows its storyboard in
  // the otherwise-empty slot. This holds through realizing too, so the "Generate
  // final media" action stays in place (as a live "Generating…" state) rather than
  // flashing to a blank shimmer while the run advances.
  const storyboardFrames = resolveStoryboardFrames(draft);
  const mediaStatus = draft.mediaSuggestion?.mediaStatus;
  const showStoryboard =
    total === 0 &&
    storyboardFrames.length > 0 &&
    (mediaStatus === 'pending' || mediaStatus === 'generating');
  const [successFlash, setSuccessFlash] = React.useState(false);

  // Flash success ring briefly after a new media placement.
  const prevAssetsLength = React.useRef(total);
  React.useEffect(() => {
    if (total > prevAssetsLength.current) {
      setSuccessFlash(true);
      const t = setTimeout(() => setSuccessFlash(false), 1500);
      prevAssetsLength.current = total;
      return () => clearTimeout(t);
    }
    prevAssetsLength.current = total;
  }, [total]);

  // The blank-state split (library / upload) is the dropzone's "fallback" overlay.
  // When a storyboard preview is present we show that instead (rendered as
  // children below), so suppress the split there to avoid stacking both.
  const dropState = isUploading
    ? 'placing'
    : successFlash
      ? 'success'
      : showCta && !showStoryboard
        ? 'fallback'
        : 'idle';

  // The empty slot offers the agent path first: headless realize, plus the
  // text-stage blueprint sketch when the draft has no storyboard yet. Library
  // and upload halves stay below as the manual alternatives.
  const fallbackActions: DropZoneFallbackAction[] = [];
  if (canGenerate) {
    fallbackActions.push({
      key: 'generate',
      label: 'Generate media',
      busyLabel: 'Generating media…',
      title: 'Let the agent realize final media for this draft',
      icon: <Wand2 className="h-4 w-4" />,
      busy: isGenerating,
      onSelect: onGenerate,
    });
  }
  if (canEnrich && onEnrich) {
    fallbackActions.push({
      key: 'enrich',
      label: 'Enrich (sketch first)',
      busyLabel: 'Sketching blueprint…',
      title: 'Sketch a low-cost blueprint first, then approve it into final media',
      icon: <PencilRuler className="h-4 w-4" />,
      busy: isEnriching,
      onSelect: onEnrich,
    });
  }

  return (
    <PreviewMediaDropZone
      isActive={false}
      state={dropState}
      fallbackActions={fallbackActions}
      slotId={slotId}
      onNativeDrop={onNativeDrop}
      onActivate={onActivate}
      onSelectLibrary={onSelectLibrary}
      onFilesChosen={onFilesChosen}
      aspectRatio={aspectRatio}
      className="w-full"
      error={placement?.error}
    >
      <CarouselSlideNav
        slides={slides}
        activeIndex={activeIndex}
        alt={alt}
        onSelectSlide={onSelectSlide}
        onStepSlide={onStepSlide}
        onEnlargeSlide={onEnlargeSlide}
        overlayChrome={overlayChrome}
      />

      {/* Overlaid, not stacked: the slot keeps the frame's aspect while it says what is missing. */}
      {dropState === 'fallback' && (
        <span className="pointer-events-none absolute left-2 top-2 z-20 rounded bg-background/90 px-1.5 py-0.5 text-sm font-medium text-muted-foreground">
          Needs media
        </span>
      )}

      {showStoryboard && (
        <BlueprintStoryboard
          frames={storyboardFrames}
          alt={alt}
          canGenerate={canGenerate}
          isGenerating={isGenerating}
          onGenerate={onGenerate}
          onUseOwn={onActivate}
          onEnlargeFrame={onEnlargeFrame}
        />
      )}
    </PreviewMediaDropZone>
  );
}

// The locked "final look" media view. No dropzone, no generate/enrich CTAs, no
// replace/add controls — just the resolved creative as it will post, with view-
// only slide navigation and enlarge. Editing affordances live behind the pencil.
function ReadOnlyCarouselMediaArea({
  slides,
  alt,
  aspectRatio,
  activeIndex,
  onSelectSlide,
  onStepSlide,
  onEnlargeSlide,
  overlayChrome,
  collage = false,
}: SlideNavProps & {
  alt: string;
  aspectRatio: number;
  collage?: boolean;
}) {
  if (collage && slides.length > 1) {
    return (
      <SlideCollage
        slides={slides}
        alt={alt}
        aspectRatio={aspectRatio}
        onEnlargeSlide={onEnlargeSlide}
      />
    );
  }

  return (
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: `${aspectRatio}` }}>
      <CarouselSlideNav
        slides={slides}
        activeIndex={activeIndex}
        alt={alt}
        onSelectSlide={onSelectSlide}
        onStepSlide={onStepSlide}
        onEnlargeSlide={onEnlargeSlide}
        overlayChrome={overlayChrome}
      />
    </div>
  );
}

const LIFECYCLE_STEPS = [
  { key: 'draft', label: 'Draft' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'posted', label: 'Posted' },
] as const;

function LifecyclePill({ status }: { status: OrganicCalendarDraft['status'] }) {
  const activeIndex = status === 'published' ? 2 : status === 'scheduled' ? 1 : 0;

  return (
    <div className="flex items-center gap-1 w-full">
      {LIFECYCLE_STEPS.map((step, i) => {
        const isActive = i === activeIndex;
        const isCompleted = i < activeIndex;
        const isFuture = i > activeIndex;
        return (
          <React.Fragment key={step.key}>
            {i > 0 && <div className="h-px flex-1 bg-border/50" />}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-3xs font-semibold uppercase tracking-wider',
                isActive && status === 'failed'
                  ? 'border border-destructive/40 bg-destructive/10 text-destructive'
                  : isActive
                    ? 'border border-primary/30 bg-primary/10 text-primary'
                    : isCompleted
                      ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : isFuture && step.key === 'posted'
                        ? 'border border-border/50 bg-muted/30 text-muted-foreground/40'
                        : 'border border-border/50 bg-muted/40 text-muted-foreground/60',
              )}
            >
              {step.label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function toPublishFormat(format: string): PostFormatOption {
  const f = format.toLowerCase();
  // Legacy 'hyperframe' drafts display as Reel — HyperFrames is a production
  // method whose rendered MP4 publishes as a reel, not a selectable post type.
  if (f === 'hyperframe' || f === 'reel' || f === 'video') return 'Reel';
  if (f === 'carousel') return 'Carousel';
  if (f === 'story') return 'Story';
  return 'Post';
}

function HashtagInput({ onAdd }: { onAdd: (tag: string) => void }) {
  const [value, setValue] = React.useState('');

  const handleSubmit = () => {
    const cleaned = value.trim().replace(/^#/, '');
    if (!cleaned) return;
    onAdd(cleaned);
    setValue('');
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="Add hashtag..."
        className="h-6 flex-1 rounded border border-border/50 bg-transparent px-2 text-2xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!value.trim()}
        className="rounded bg-muted/60 px-2 py-0.5 text-2xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}

// A titled inline panel that appears on demand (from the ⋯ menu) and collapses
// when dismissed — the progressive-disclosure home for secondary editors.
function ContextualPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/90 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="rounded p-0.5 text-muted-foreground/60 transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

function HashtagTiers({
  draft,
  onHashtagsChange,
}: {
  draft: OrganicCalendarDraft;
  onHashtagsChange: (hashtags: OrganicCalendarDraft['hashtags']) => void;
}) {
  return (
    <div className="space-y-2">
      {(['high', 'medium', 'low'] as const).map((tier) => {
        const tags = draft.hashtags?.[tier];
        if (!tags?.length) return null;
        return (
          <div key={tier} className="space-y-1">
            <p className="text-2xs font-medium text-muted-foreground/70">
              {tier === 'high'
                ? 'High Competition'
                : tier === 'medium'
                  ? 'Medium Competition'
                  : 'Low Competition'}
            </p>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-2xs text-muted-foreground"
                >
                  #{tag.replace(/^#/, '')}
                  <button
                    type="button"
                    className="ml-0.5 rounded-full p-0.5 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onHashtagsChange({
                        ...draft.hashtags,
                        [tier]: tags.filter((t) => t !== tag),
                      });
                    }}
                    aria-label={`Remove #${tag.replace(/^#/, '')}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        );
      })}
      <HashtagInput
        onAdd={(tag) => {
          const current = draft.hashtags ?? {};
          const medium = current.medium ?? [];
          onHashtagsChange({ ...current, medium: [...medium, tag] });
        }}
      />
    </div>
  );
}

export function OrganicDraftPreview({
  draft: storedDraft,
  brandName,
  brandProfileId,
  onApprove,
  onClose,
  titleRef,
  insetStart,
  brandTimeZone,
  onStitch,
  isStitching = false,
}: OrganicDraftPreviewProps) {
  // A post is a group: one row per platform. `storedDraft` is the card (its own row is the
  // group's source); the frame in view is THAT platform's row, and everything the frame shows,
  // edits, gates and publishes is that row's own — caption, first comment, cover, account.
  const selectedPlatforms = React.useMemo<OrganicPlatformKey[]>(
    () => (storedDraft.platforms.length > 0 ? storedDraft.platforms : ['instagram']),
    [storedDraft.platforms],
  );
  // Which platform's frame we are LOOKING at — a view concern, never a property of the post.
  const [previewFramePlatform, setPreviewFramePlatform] = React.useState<OrganicPlatformKey | null>(
    null,
  );
  const framePlatform =
    previewFramePlatform && selectedPlatforms.includes(previewFramePlatform)
      ? previewFramePlatform
      : selectedPlatforms[0];
  // Typed text reaches the store once per burst; until then only the editor's copy has it, so
  // everything this panel shows, gates and publishes reads that copy.
  const fieldEditor = useDraftFieldEditor(resolveFrameDraft(storedDraft, framePlatform));
  const { draft } = fieldEditor;
  // The post's time is the group's: it moves every member row, so it edits through the card.
  const cardEditor = useDraftFieldEditor(storedDraft);
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  // The day this post currently sits on. A time change is a schedule change, and the
  // route composes the instant from (day, time-of-day) — so the day has to travel with it.
  const dayId = useCalendarStore(
    (state) =>
      state.days.find((day) => day.slots.some((slot) => slot.id === storedDraft.id))?.id ?? null,
  );
  const bulkDeleteDrafts = useCalendarStore((state) => state.bulkDeleteDrafts);
  const duplicateDraft = useCalendarStore((state) => state.duplicateDraft);
  const editingDraftId = useCalendarStore((state) => state.editingDraftId);
  const setEditingDraftId = useCalendarStore((state) => state.setEditingDraftId);
  const { requestDraftDeletion } = useDraftDeletionConfirmation();
  const openInStudio = useOpenDraftInAiStudio();
  const draftForPreview = useDraftWithFreshMedia(draft, brandProfileId);
  const isHyperframeFormat = draft.format.toLowerCase() === 'hyperframe';
  const creativeDirection = resolveCreativeDirection(draft);
  const inspirationSourceUrl = safeSourceUrl(draft.inspirationSourceUrl);
  // The agent-generated hook, if this draft has been generated. Scored on view.
  const draftHook = resolveDraftHook(draft);

  // Media placement hook — the single write path for user-supplied creatives.
  const placement = useDraftMediaPlacement(draft.id);

  // The plan: exactly what the platform in view receives. The frame, the caption, the notices
  // and the readiness line all read it, through the resolver the publisher runs.
  const {
    plan,
    verdict,
    accounts: planAccounts,
  } = usePublishPlan(draftForPreview, isPostPlatform(framePlatform) ? framePlatform : null);
  // A rendered hyperframe is an ordinary video once its MP4 exists; until then only its
  // composition can be shown.
  const showHyperframePlayer = isHyperframeFormat && (plan?.media.length ?? 0) === 0;

  // The slides of record, resolved once: the media areas, the strip, the clamp and
  // the lightbox all index into this same array. The plan's media when it sends any; else
  // whatever is attached, so media the plan cannot send is still visible beside its notice.
  const previewSlides = React.useMemo(
    () =>
      plan && plan.media.length > 0
        ? slidesFromPlan(plan, draftForPreview)
        : resolveCarouselSlides(draftForPreview),
    [plan, draftForPreview],
  );
  const lastSlidePosition = Math.max(previewSlides.length - 1, 0);

  // Carousel-ness is a property of the MEDIA that is actually attached, not of the format
  // string, which drifts. A draft the generator labelled "Reel" whose creative was then
  // re-applied as five slides is a carousel by every observable measure, and reading the
  // label instead of the slides is what hid Remove and pointed Replace at the whole media:
  // clicking it on slide 1 of 5 destroyed the other four. `publishFormatForAssetKinds` is
  // the same rule the attach contract uses, so the panel and the writer agree.
  const isCarouselFormat =
    previewSlides.length > 0
      ? publishFormatForAssetKinds(previewSlides.map((slide) => slide.kind)) === 'CAROUSEL'
      : draft.format.toLowerCase() === 'carousel';
  const publishFormat: PublishFormat = isCarouselFormat
    ? 'CAROUSEL'
    : resolvePublishFormat(draft.format);
  // The post itself, or what each platform does with it beyond the caption.

  // Active carousel slide POSITION (shared between preview and strip).
  const [activeSlideIndex, setActiveSlideIndex] = React.useState(0);
  // The panel is reused across drafts, so a stale position would open a 3-slide
  // draft on "slide 8" and silently fall back to the first creative.
  React.useEffect(() => {
    setActiveSlideIndex(0);
  }, [draft.id]);
  // Clamping at render (rather than in an effect) is what keeps a shrinking slide
  // array — a removed slide — from flashing the fallback creative for a frame.
  const activeSlidePosition = Math.min(activeSlideIndex, lastSlidePosition);

  // The frame takes the first slide's shape (as a carousel does on every platform). The
  // stored asset size wins; until one exists, the size the browser decodes stands in.
  const firstSlide = previewSlides[0];
  const firstSlideKey = `${draft.id}:${firstSlide?.storageUrl ?? ''}`;
  const [loadedSize, setLoadedSize] = React.useState<(LoadedMediaSize & { key: string }) | null>(
    null,
  );
  const decodedSize = loadedSize?.key === firstSlideKey ? loadedSize : null;
  const handleMediaLoaded = React.useCallback(
    (event: React.SyntheticEvent) => {
      const size = loadedMediaSize(event.target);
      if (!size || !firstSlide || !size.src.startsWith(firstSlide.storageUrl)) return;
      setLoadedSize({ ...size, key: firstSlideKey });
    },
    [firstSlide, firstSlideKey],
  );
  const previewFrame = resolvePreviewFrame({
    platform: framePlatform,
    format: isCarouselFormat ? 'carousel' : draft.format,
    mediaWidth: firstSlide?.width ?? decodedSize?.width,
    mediaHeight: firstSlide?.height ?? decodedSize?.height,
    durationSec:
      draft.mediaSuggestion?.reel?.durationSec ??
      draft.mediaSuggestion?.hyperframe?.durationSeconds ??
      decodedSize?.durationSec,
  });
  const mediaAspectRatio = previewFrame.mediaAspect;
  const overlayChrome = previewFrame.kind === 'vertical' || previewFrame.kind === 'story';
  // Facebook and LinkedIn publish a text-only post as-is; every other surface needs media.
  const canPostWithoutMedia =
    previewFrame.kind === 'feed' &&
    (framePlatform === 'facebook' || framePlatform === 'linkedin') &&
    previewFormat(draft.format) === 'post';

  const selectSlide = React.useCallback(
    (position: number) => {
      setActiveSlideIndex(Math.min(Math.max(position, 0), lastSlidePosition));
    },
    [lastSlidePosition],
  );
  const stepSlide = React.useCallback(
    (delta: number) => {
      setActiveSlideIndex((current) =>
        Math.min(Math.max(Math.min(current, lastSlidePosition) + delta, 0), lastSlidePosition),
      );
    },
    [lastSlidePosition],
  );

  // Drives the dropzone "placing" shimmer while disk uploads run.
  const [isUploading, setIsUploading] = React.useState(false);

  // Contextual surfaces — nothing is always-on; each reveals on demand.
  const [mediaSelectOpen, setMediaSelectOpen] = React.useState(false);
  // When the user clicks a slide's "replace" control we stash its position here,
  // open the shared media picker, and route the next selection through
  // replaceSlide instead of addSlide. A ref (not state) so the captured position
  // survives the picker round-trip without re-rendering the strip mid-flow.
  const replaceTargetRef = React.useRef<number | null>(null);
  // "+" on a one-image post: the next pick is a second slide, not a replacement.
  const addSlideRef = React.useRef(false);
  // The library picker is anchored on the live media area, which only mounts while the
  // draft is editable. Controls reachable from a read-only view (the lightbox, #402) are
  // offered only when that anchor exists, so a pick never flips state on nothing.
  const openMediaPicker = React.useCallback((replacePosition: number | null = null) => {
    replaceTargetRef.current = replacePosition;
    setMediaSelectOpen(true);
  }, []);
  const [creativeOpen, setCreativeOpen] = React.useState(false);
  const [hashtagsOpen, setHashtagsOpen] = React.useState(false);
  const [productionDetailsOpen, setProductionDetailsOpen] = React.useState(false);
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [captionEditing, setCaptionEditing] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  // There is no edit mode: the frame edits in place. A hover card's Edit or an "Open in
  // editor" item (another component tree) still asks through the store; for this panel that
  // means opening the caption, which is what those entry points were for.
  // Declared first: effects run in order, so a mount that carries an intent resets, then opens.
  // Keyed on the post, not the frame: switching frames keeps the open panel.
  React.useEffect(() => {
    setCaptionEditing(false);
    setOptionsOpen(false);
  }, [storedDraft.id]);
  React.useEffect(() => {
    if (editingDraftId !== storedDraft.id) return;
    setCaptionEditing(true);
    setEditingDraftId(null);
  }, [storedDraft.id, editingDraftId, setEditingDraftId]);
  // Enlarge-and-act lightbox target: a blueprint concept frame or a realized slide.
  const [lightbox, setLightbox] = React.useState<{
    kind: 'blueprint' | 'slide';
    index: number;
  } | null>(null);

  // Manual drafts construct from scratch (upload + Library, no headless gen).
  const isManual = draft.origin === 'manual';

  const { generateDraftMedia, isGenerating, expandDrafts, isExpanding } = useGenerateDraftMedia();

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = React.useCallback((_event: DragEndEvent) => {
    // Top-level DnD context — sub-contexts (CarouselSlideStrip) own their drag end.
  }, []);

  // Un-scheduling has to reach the server or it has not happened: the poller goes on
  // publishing a post whose card says "Draft". Shared with the calendar card's menu.
  const { unschedule } = useUnscheduleDraft();

  // Ticking a platform creates its row at once and unticking deletes it: the selection IS the
  // group's rows on the server, never a browser-only list a refetch could drop (K1).
  const membership = useDraftMembership();
  const handleTogglePlatform = React.useCallback(
    async (platform: PublishPlatform, checked: boolean) => {
      if (membership.isSaving) return;
      const next = checked
        ? [...selectedPlatforms, platform]
        : selectedPlatforms.filter((value) => value !== platform);
      // A new row copies the card's row, so the typing and the media go to the server first.
      if (!(await fieldEditor.flush()) || !(await placement.flushMedia())) return;
      await membership.setPlatforms(storedDraft, next);
    },
    [fieldEditor, membership, placement, selectedPlatforms, storedDraft],
  );

  const handleFormatChange = React.useCallback(
    (value: string) => {
      void fieldEditor.editField({ format: value }, ['format'], { format: value });
    },
    [fieldEditor],
  );

  const handleTimeChange = React.useCallback(
    (value: string) => {
      // An unscheduled draft has no day to compose an instant against; keep the label
      // locally so the chip still reflects the choice when it is placed on a day.
      const patch = dayId ? scheduleFieldPatch(dayId, value) : null;
      if (!patch) {
        updateDraft(storedDraft.id, (current) => ({ ...current, timeLabel: value }));
        return;
      }
      void cardEditor.editField(patch, ['schedule'], { timeLabel: value });
    },
    [cardEditor, dayId, storedDraft.id, updateDraft],
  );

  const handleHashtagsChange = React.useCallback(
    (hashtags: OrganicCalendarDraft['hashtags']) => {
      void fieldEditor.editField({ hashtags: hashtags ?? {} }, ['hashtags'], { hashtags });
    },
    [fieldEditor],
  );

  const handleCreativeDirectionChange = React.useCallback(
    (value: string) => {
      fieldEditor.queueFieldEdit({ creativeDirection: value }, ['creativeDirection'], {
        creativeDirectionPrompt: value,
        creativeIdea: value,
      });
    },
    [fieldEditor],
  );

  // The map as this panel last wrote it. Every save sends the WHOLE map, so it must be
  // composed from the newest one — and the `draft` prop was observed (organic:ship bench,
  // a deep-linked draft) still lacking a first comment saved seconds earlier, which made
  // the next cover pick overwrite it. Composing from what this panel wrote cannot lag.
  const [writtenOptions, setWrittenOptions] = React.useState<{
    draftId: string;
    map: PublishOptionsByPlatform;
  } | null>(null);
  const publishOptions =
    writtenOptions?.draftId === draft.id ? writtenOptions.map : draft.publishOptions;

  // The whole per-platform map travels on every edit (see plannerDraftFieldPatchSchema).
  // A typed first comment coalesces; a discrete pick first flushes any pending typing, whose
  // older map would otherwise land after it and undo the pick.
  const handlePublishOptionsChange = React.useCallback<PublishOptionsChange>(
    (next, mode) => {
      const previous = publishOptions;
      setWrittenOptions({ draftId: draft.id, map: next });
      const patch = { publishOptions: next };
      if (mode === 'typing') {
        fieldEditor.queueFieldEdit(patch, ['publishOptions'], { publishOptions: next });
        return;
      }
      void fieldEditor
        .flush()
        .then(() => fieldEditor.editField(patch, ['publishOptions'], { publishOptions: next }))
        .then((saved) => {
          if (!saved) setWrittenOptions({ draftId: draft.id, map: previous ?? {} });
        });
    },
    [draft.id, fieldEditor, publishOptions],
  );

  // Coalesced, not per-keystroke: a caption is typed, not picked.
  const handleCaptionChange = React.useCallback(
    (value: string) => {
      fieldEditor.queueFieldEdit({ caption: value }, ['caption'], { captionPreview: value });
    },
    [fieldEditor],
  );

  const { publish, isPublishing, stage, pollingAttempt, tokenExpired } = usePublishDraft();

  // The frame's caption on every other row, each saved against its own row's token. Explicit:
  // otherwise a caption only reaches a row that has none of its own (`groupRowsToFill`).
  const { persistDraftFields } = useDraftFieldPersistence();
  const { show } = useToast();
  const [groupCaptionBusy, setGroupCaptionBusy] = React.useState<'apply' | 'adapt' | null>(null);
  const handleApplyToAll = React.useCallback(async () => {
    if (!(await fieldEditor.flush())) return;
    const caption = draft.captionPreview;
    const others = groupMemberDrafts(storedDraft).filter((member) => member.id !== draft.id);
    setGroupCaptionBusy('apply');
    try {
      const failures: string[] = [];
      await Promise.all(
        others.map(async (member) => {
          const saved = await persistDraftFields(member, { caption });
          if (!saved.ok) {
            failures.push(saved.message);
            return;
          }
          updateDraft(member.id, (current) => ({
            ...current,
            captionPreview: caption,
            updatedAt: saved.updatedAt ?? current.updatedAt,
          }));
        }),
      );
      if (failures.length > 0) {
        show({
          title: `Caption not saved on ${failures.length} of ${others.length}`,
          description: failures[0],
          variant: 'error',
        });
      }
    } finally {
      setGroupCaptionBusy(null);
    }
  }, [
    draft.captionPreview,
    draft.id,
    fieldEditor,
    persistDraftFields,
    show,
    storedDraft,
    updateDraft,
  ]);

  // The frame's caption re-argued in its platform's voice, saved by the server on that row.
  const handleAdapt = React.useCallback(async () => {
    const rowId = draft.backendDraftId;
    if (!rowId || !(await fieldEditor.flush())) return;
    setGroupCaptionBusy('adapt');
    try {
      const adapted = await request<AdaptCaptionResponse>({
        path: `/api/organic/calendar/drafts/${encodeURIComponent(rowId)}/adapt-caption`,
        method: 'POST',
        body: { platform: framePlatform },
        schema: adaptCaptionResponseSchema,
      });
      const target =
        groupMemberDrafts(storedDraft).find(
          (member) => member.backendDraftId === adapted.memberId,
        ) ?? draft;
      updateDraft(target.id, (current) => ({
        ...current,
        captionPreview: adapted.caption,
        updatedAt: adapted.updatedAt ?? current.updatedAt,
      }));
    } catch (error) {
      // An approved or scheduled row is refused (409 reapproval_required): new copy nobody read
      // would publish. The way out is back to draft, then approve again.
      const reapprove =
        error instanceof ApiError && (error.code ?? error.payload?.error) === 'reapproval_required';
      show({
        title: 'Caption not adapted',
        description: error instanceof ApiError ? error.message : 'Network error. Please try again.',
        variant: 'error',
        ...(reapprove
          ? {
              action: {
                label: 'Move back to draft',
                onClick: () => void unschedule(storedDraft),
              },
            }
          : {}),
      });
    } finally {
      setGroupCaptionBusy(null);
    }
  }, [draft, fieldEditor, framePlatform, show, storedDraft, unschedule, updateDraft]);

  const isMultiPlatform = selectedPlatforms.length > 1;
  const isPublished = draft.status === 'published';
  const isScheduled = draft.status === 'scheduled';
  const isStreaming = draft.status === 'streaming';
  const editable = !isPublished && !isStreaming;

  // What blocks the post: the shared gate over the plan in view (with its account, once the
  // dry run has answered), plus every other member row's own gate — approve takes them all.
  const readiness = React.useMemo(
    () => evaluateDraftReadiness(withLiveFrame(storedDraft, draft)),
    [storedDraft, draft],
  );
  const readinessItems = React.useMemo<ReadinessItem[]>(() => {
    const seen = new Set<string>();
    return [...(verdict?.blockers ?? []), ...readiness.blockers].flatMap((issue) => {
      const key = `${issue.reason}:${issue.fix}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ key, message: issue.message, fix: issue.fix }];
    });
  }, [verdict, readiness]);

  // Saves land before approve and publish read the row: a media pick or a burst of typing
  // still in flight would otherwise be overwritten by, or 409 against, the approval.
  const flushPendingEdits = React.useCallback(async (): Promise<boolean> => {
    const mediaSaved = await placement.flushMedia();
    const fieldsSaved = await fieldEditor.flush();
    const timeSaved = await cardEditor.flush();
    return mediaSaved && fieldsSaved && timeSaved;
  }, [placement, fieldEditor, cardEditor]);

  const [isApproving, setIsApproving] = React.useState(false);
  const approvingRef = React.useRef(false);
  const handleApprove = React.useCallback(async () => {
    if (!onApprove || approvingRef.current) return;
    approvingRef.current = true;
    setIsApproving(true);
    try {
      if (!(await flushPendingEdits())) return;
      // One call: the workspace approves every member of the group.
      await onApprove(storedDraft.id);
    } finally {
      approvingRef.current = false;
      setIsApproving(false);
    }
  }, [flushPendingEdits, onApprove, storedDraft.id]);

  // Gate on "is there a publisher for this draft's platform", not on Instagram specifically.
  const publishPlatform = inferPublishPlatform(draft);
  // Only platforms whose post id alone forms a public URL declare `permalink`; the rest get
  // no link rather than a broken one.
  const publishedPostId = draft.platform_post_id ?? draft.instagram_post_id;
  const permalink =
    publishPlatform && publishedPostId
      ? POST_PLATFORMS[publishPlatform].permalink?.(publishedPostId)
      : undefined;
  const canPublish = publishPlatform != null && editable;

  // Single unified attach path: every selection from the media Popover goes
  // through useDraftMediaPlacement (gains undo + always emits publishable shapes).
  // Carousels append slides; otherwise place() infers single/carousel/video.
  const handleAttachAssets = React.useCallback(
    (assets: MediaAsset[]) => {
      if (assets.length === 0) return;
      const growing = addSlideRef.current;
      addSlideRef.current = false;
      if (isCarouselFormat || growing) {
        // Replace mode: a slide's replace control set a target position — swap that
        // one slide and consume the target (extra picks are ignored for replace).
        const replaceTarget = replaceTargetRef.current;
        if (replaceTarget != null) {
          replaceTargetRef.current = null;
          placement.replaceSlide(replaceTarget, assets[0]);
          return;
        }
        assets.forEach((asset) => placement.addSlide(asset));
        return;
      }
      // A selection carrying any video targets the reel slot — routing it at
      // `single` is what let a 2-video selection through to a shape that keeps
      // only the first and silently discards the rest.
      const target: SlotTarget = assets.some((asset) => asset.kind === 'video')
        ? { kind: 'video' }
        : { kind: 'single' };
      placement.place(assets, target);
    },
    [isCarouselFormat, placement],
  );

  // Upload-from-computer: register each dropped/selected file into the library,
  // mint a signed URL, then route through the same attach path the library
  // picker uses (multi-file ⇒ carousel slides).
  const handleUploadFiles = React.useCallback(
    async (files: File[]) => {
      if (!brandProfileId || files.length === 0) return;
      setIsUploading(true);
      try {
        const assets = await uploadDraftCreatives({ files, brandId: brandProfileId });
        if (assets.length > 0) handleAttachAssets(assets);
      } finally {
        setIsUploading(false);
      }
    },
    [brandProfileId, handleAttachAssets],
  );

  const handleGenerateMedia = React.useCallback(() => {
    // Requires a persisted backend draft; the realize stream keys updates off feId.
    const previewRevision = draft.mediaSuggestion?.previewRevision;
    if (!brandProfileId || !draft.backendDraftId || !previewRevision) return;
    void generateDraftMedia(brandProfileId, [
      {
        feId: draft.id,
        backendDraftId: draft.backendDraftId,
        format: draft.format,
        previewRevision,
      },
    ]);
  }, [
    brandProfileId,
    draft.id,
    draft.backendDraftId,
    draft.format,
    draft.mediaSuggestion?.previewRevision,
    generateDraftMedia,
  ]);

  // Stage-2 "Enrich (sketch first)": queue a durable blueprint sketch instead of
  // jumping straight to final pixels. Text-stage secondary action only.
  const handleEnrichMedia = React.useCallback(() => {
    if (!brandProfileId || !draft.backendDraftId) return;
    void expandDrafts(brandProfileId, [{ feId: draft.id, backendDraftId: draft.backendDraftId }]);
  }, [brandProfileId, draft.id, draft.backendDraftId, expandDrafts]);

  const handleDelete = React.useCallback(() => {
    requestDraftDeletion([storedDraft.id], bulkDeleteDrafts);
  }, [bulkDeleteDrafts, storedDraft.id, requestDraftDeletion]);

  const mediaStatusVariant = resolveMediaStatusVariant(draft);
  const mediaIsPending = mediaStatusVariant === 'pending';
  const mediaIsUserSupplied = draft.mediaSuggestion?.mediaStatus === 'user_supplied';
  // Generation requires a persisted backend draft id (autosave assigns one within
  // ~500ms); manual drafts never headless-generate.
  const canGenerate =
    mediaIsPending &&
    !mediaIsUserSupplied &&
    !isManual &&
    !!draft.backendDraftId &&
    !!draft.mediaSuggestion?.previewRevision;
  // Enrich is the text-stage sibling of Generate: once a storyboard exists the
  // BlueprintStoryboard + realize flow is the approval surface instead.
  const canEnrich = canGenerate && resolveDraftMediaStage(draft) === 'text_only';

  // The Media rung delegates to the existing Stage-3 paths: headless realize when the
  // draft can generate, the library picker otherwise (manual drafts never headless-gen).
  const handleMediaStep = React.useCallback(() => {
    if (canGenerate) {
      handleGenerateMedia();
      return;
    }
    openMediaPicker();
  }, [canGenerate, handleGenerateMedia, openMediaPicker]);

  const ladder = useDraftEnrichmentLadder(draft, { brandProfileId, onMediaStep: handleMediaStep });

  // The media zone, pre-wired with its contextual MediaSelectPopover. Clicking
  // the empty/CTA area (or a carousel "+") opens the library Popover anchored here.
  // A one-image post grows into a carousel from the same strip a carousel adds slides with.
  const canGrowIntoCarousel =
    isCarouselFormat ||
    (previewSlides.length === 1 &&
      previewSlides[0]?.kind === 'image' &&
      previewFrame.kind === 'feed' &&
      isPostPlatform(framePlatform) &&
      supportsFormat(framePlatform, 'CAROUSEL'));
  const mediaPicker = (anchor: React.ReactNode) =>
    !isHyperframeFormat && brandProfileId ? (
      <MediaSelectPopover
        format={publishFormat}
        brandProfileId={brandProfileId}
        open={mediaSelectOpen}
        onOpenChange={(open) => {
          // Drop a pending replace target if the picker closes without a pick, so a
          // cancelled replace can't hijack the next add.
          if (!open) {
            replaceTargetRef.current = null;
            addSlideRef.current = false;
          }
          setMediaSelectOpen(open);
        }}
        onAttachAssets={handleAttachAssets}
        // Generate lives in the media zone below and in the ⋯ menu; a third copy in the
        // picker was one of the six ways to reach it.
        onGenerate={handleGenerateMedia}
        canGenerate={false}
        isGenerating={isGenerating}
        anchor={anchor}
      />
    ) : null;
  const interactiveMediaNode = mediaPicker(
    <InteractiveCarouselMediaArea
      draft={draftForPreview}
      slides={previewSlides}
      alt={resolveDraftMediaAltText(draftForPreview)}
      aspectRatio={mediaAspectRatio}
      slotId={`preview-media-${draft.id}`}
      onActivate={() => setMediaSelectOpen(true)}
      onSelectLibrary={() => setMediaSelectOpen(true)}
      onFilesChosen={handleUploadFiles}
      isUploading={isUploading}
      activeIndex={activeSlidePosition}
      onSelectSlide={selectSlide}
      onStepSlide={stepSlide}
      placement={placement}
      onGenerate={handleGenerateMedia}
      canGenerate={canGenerate}
      isGenerating={isGenerating}
      onEnrich={handleEnrichMedia}
      canEnrich={canEnrich}
      isEnriching={isExpanding}
      onEnlargeFrame={(index) => setLightbox({ kind: 'blueprint', index })}
      onEnlargeSlide={(index) => setLightbox({ kind: 'slide', index })}
      overlayChrome={overlayChrome}
    />,
  );

  // Read-only "final look" media: the resolved creative with view-only navigation,
  // no dropzone or generate/replace controls. Shown unless the pencil is active; a
  // draft with no slides has no media node, and the frame shows its own placeholder.
  const readOnlyMediaNode =
    !showHyperframePlayer && previewSlides.length > 0 ? (
      <ReadOnlyCarouselMediaArea
        slides={previewSlides}
        alt={resolveDraftMediaAltText(draftForPreview)}
        aspectRatio={mediaAspectRatio}
        activeIndex={activeSlidePosition}
        onSelectSlide={selectSlide}
        onStepSlide={stepSlide}
        onEnlargeSlide={(index) => setLightbox({ kind: 'slide', index })}
        overlayChrome={overlayChrome}
        collage={
          previewFrame.kind === 'feed' &&
          (framePlatform === 'facebook' || framePlatform === 'linkedin')
        }
      />
    ) : null;

  // A Facebook or LinkedIn post with no media goes out as text: its frame draws no media box,
  // and media is added from a link under it instead.
  const isTextPost = canPostWithoutMedia && previewSlides.length === 0 && !showHyperframePlayer;
  // The picker works without an edit mode: an unpublished draft's media is always live.
  const mediaNode = isTextPost
    ? null
    : editable
      ? (interactiveMediaNode ?? readOnlyMediaNode)
      : readOnlyMediaNode;
  // The slide strip with its "+" sits under the frame, outside it: it edits the post and is
  // not part of it, so it must not change the frame's aspect.
  const slideStrip =
    editable && interactiveMediaNode && canGrowIntoCarousel && previewSlides.length > 0 ? (
      <CarouselSlideStrip
        slides={previewSlides}
        activeIndex={activeSlidePosition}
        onSelectSlide={selectSlide}
        placement={placement}
        onAddRequest={() => {
          replaceTargetRef.current = null;
          addSlideRef.current = true;
          setMediaSelectOpen(true);
        }}
        onReplaceRequest={(position) => {
          replaceTargetRef.current = position;
          setMediaSelectOpen(true);
        }}
        onEnlarge={(index) => setLightbox({ kind: 'slide', index })}
        className="shrink-0 px-2"
      />
    ) : null;
  const addMediaToTextPost =
    isTextPost && editable
      ? mediaPicker(
          <button
            type="button"
            onClick={() => setMediaSelectOpen(true)}
            className="self-start rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Add photo or video
          </button>,
        )
      : null;

  // Enlarge-and-act lightbox contents, derived from the current target so the
  // dialog stays a dumb, reusable shell. Blueprint frames offer generate / use-
  // your-own; realized slides offer replace / remove (carousels keep >= 1 slide).
  const lightboxFrames = resolveStoryboardFrames(draftForPreview);
  const lightboxSlides = previewSlides;
  const lightboxItems: LightboxItem[] =
    lightbox?.kind === 'blueprint'
      ? lightboxFrames.map((frame, index) => ({
          url: frame.storageUrl,
          caption: `Frame ${index + 1}${frame.role ? ` · ${frame.role}` : ''}`,
        }))
      : lightbox?.kind === 'slide'
        ? lightboxSlides.map((slide, index) => ({
            url: slide.storageUrl,
            isVideo: slide.kind === 'video',
            caption:
              lightboxSlides.length > 1
                ? `Slide ${index + 1} of ${lightboxSlides.length}`
                : 'Creative',
          }))
        : [];

  const lightboxNode =
    lightbox && lightboxItems.length > 0 ? (
      <MediaLightbox
        open
        onOpenChange={(open) => {
          if (!open) setLightbox(null);
        }}
        title={lightbox.kind === 'blueprint' ? 'Blueprint concept' : 'Creative'}
        items={lightboxItems}
        index={Math.min(lightbox.index, lightboxItems.length - 1)}
        onIndexChange={(index) => {
          setLightbox((prev) => (prev ? { ...prev, index } : prev));
          // Paging full screen and then closing should not snap back to the slide
          // you started on.
          if (lightbox.kind === 'slide') selectSlide(index);
        }}
        actions={
          !editable || !interactiveMediaNode ? null : lightbox.kind === 'blueprint' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setLightbox(null);
                  openMediaPicker();
                }}
                className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
              >
                <Library className="h-4 w-4" />
                Use your own creative
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setLightbox(null);
                  openMediaPicker(isCarouselFormat ? lightbox.index : null);
                }}
                className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
              >
                <Replace className="h-4 w-4" />
                Replace
              </button>
              {isCarouselFormat && lightboxSlides.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    placement.removeSlide(lightbox.index);
                    setLightbox(null);
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              )}
            </>
          )
        }
      />
    ) : null;

  // Each platform's row, one frame at a time: what it previews and edits is that row. Purely a
  // view switch — it never changes which platforms the post goes out on.
  const platformSwitch = (legend: string) =>
    selectedPlatforms.length > 1 ? (
      <fieldset className="flex items-center gap-1.5 border-0 p-0">
        <legend className="float-left mr-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
          {legend}
        </legend>
        {selectedPlatforms.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={value === framePlatform}
            onClick={() => setPreviewFramePlatform(value)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-2xs font-medium transition-colors duration-150',
              value === framePlatform
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            <PlatformIcon platform={value} className="size-3" />
            {PUBLISH_PLATFORM_LABELS[value]}
          </button>
        ))}
      </fieldset>
    ) : null;

  // ── Who, what, when ────────────────────────────────────────────────────────────
  const whenLabel = formatScheduleWithZone(dayId, draft.timeLabel, brandTimeZone);
  const formatLabel =
    plan?.verb === 'text'
      ? 'Text post'
      : frameFormatLabel(
          toPublishFormat(plan?.format ?? draft.format),
          framePlatform,
          previewFrame.kind,
        );
  // Who the frame's row posts as: its own stamp, resolved against the platform's candidates.
  // Known before any dry run answers, and never the brand name (A4).
  const { accounts: publishAccounts, isLoading: accountsLoading } = usePublishAccountsState(
    brandProfileId ?? null,
  );
  const frameAccounts = React.useMemo(() => {
    const listed = accountsForPlatform(publishAccounts, framePlatform);
    return listed.length > 0 ? listed : (planAccounts ?? []);
  }, [publishAccounts, framePlatform, planAccounts]);
  const frameAccount = findAccount(frameAccounts, draft.targetAccountId);
  // The post's poster is its account; with none chosen the frame says so, never the brand.
  const frameAccountName =
    frameAccount?.handle?.replace(/^@/, '') || frameAccount?.displayName || 'No account chosen';
  const handleSelectAccount = React.useCallback(
    (accountId: string) => {
      void fieldEditor.editField({ accountId }, ['account'], { targetAccountId: accountId });
    },
    [fieldEditor],
  );
  // Publishing names every member's own account in its one confirm; nothing is overridden.
  const handlePublishNow = React.useCallback(async () => {
    if (!(await flushPendingEdits())) return;
    await publish(storedDraft);
  }, [flushPendingEdits, publish, storedDraft]);
  const sentCaption = plan ? plan.caption.text : undefined;

  const handleFix = React.useCallback(
    (target: ReadinessFixTarget) => {
      const panel = panelRef.current;
      switch (target) {
        case 'caption':
          setCaptionEditing(true);
          return;
        case 'media':
          panel?.querySelector('[data-frame-media]')?.scrollIntoView({ block: 'nearest' });
          if (brandProfileId && !isHyperframeFormat) setMediaSelectOpen(true);
          return;
        case 'format':
          panel?.querySelector<HTMLButtonElement>('[aria-label="Change format"]')?.click();
          return;
        case 'account': {
          // Choosing is the identity row's picker; only a platform with nothing connected
          // sends the user to connect one.
          const picker = panel?.querySelector<HTMLButtonElement>(
            '[data-review-identity] button[data-account-id]',
          );
          if (picker && !picker.disabled) {
            picker.click();
            return;
          }
          window.open(INTEGRATIONS_SETTINGS_HREF, '_blank', 'noopener,noreferrer');
          return;
        }
        case 'options':
        case 'cover':
          setOptionsOpen(true);
          return;
      }
    },
    [brandProfileId, isHyperframeFormat],
  );

  const reelComposition = draft.mediaSuggestion?.reel;
  const menu = (
    <PostCommandMenu
      onOpenInStudio={
        openInStudio
          ? {
              label: reelComposition?.composition ? 'Edit in AI Studio' : 'Open in AI Studio',
              onSelect: () => openInStudio(draft.id),
              disabledReason: aiStudioHandoffIssue(draft),
            }
          : undefined
      }
      mediaAction={
        editable && ladder.actionLabel
          ? {
              label: ladder.actionLabel,
              onSelect: ladder.run,
              disabledReason: ladder.isBusy ? 'Working on it…' : ladder.disabledReason,
            }
          : undefined
      }
      renderAction={
        onStitch && reelComposition?.composition && reelComposition.generated !== true
          ? {
              label: isStitching ? 'Rendering video…' : 'Render video',
              onSelect: () => onStitch(draft.id),
              disabledReason: isStitching ? 'Already rendering.' : null,
            }
          : undefined
      }
      onShowDetails={() => setProductionDetailsOpen(true)}
      onPlatformOptions={isPostPlatform(framePlatform) ? () => setOptionsOpen(true) : undefined}
      onEditCreativeDirection={() => setCreativeOpen(true)}
      onEditHashtags={() => setHashtagsOpen(true)}
      onDuplicate={(targetDayId) => duplicateDraft(storedDraft.id, targetDayId)}
      onMoveBackToDraft={
        isScheduled
          ? () => {
              void unschedule(storedDraft);
            }
          : undefined
      }
      onDelete={handleDelete}
    />
  );

  // ── Footer: when, go, and why not ─────────────────────────────────────────────
  const blocked = readinessItems.length > 0;
  // Scheduling and publishing now meet the same gate, so both say why they are unavailable.
  const actionBlockedReason = isUploading
    ? 'Uploading your media…'
    : blocked
      ? `${readinessItems.length} to fix`
      : null;
  const approveVerb = isMultiPlatform
    ? `Approve for ${selectedPlatforms.length} platforms`
    : 'Approve & schedule';
  const primaryAction =
    onApprove && editable && !isScheduled
      ? {
          label: whenLabel ? `${approveVerb} · ${whenLabel}` : approveVerb,
          busyLabel: 'Approving…',
          busy: isApproving,
          disabledReason: actionBlockedReason,
          onClick: () => void handleApprove(),
        }
      : null;
  // Always offered beside the schedule, never hidden: a button that only appears once the
  // post is ready reads as a feature that does not exist.
  const publishNowAction = canPublish
    ? {
        label: 'Publish now',
        busyLabel:
          stage === 'container_created'
            ? 'Uploading media…'
            : stage === 'polling'
              ? `Processing video${pollingAttempt > 0 ? ` (${pollingAttempt})` : ''}…`
              : 'Publishing…',
        busy: isPublishing,
        disabledReason: actionBlockedReason,
        onClick: () => void handlePublishNow(),
        icon: <Send aria-hidden />,
      }
    : null;
  const footerNote =
    !editable || isScheduled ? null : isUploading ? (
      <p data-footer-reason className="text-xs text-muted-foreground">
        Uploading your media…
      </p>
    ) : (
      <ReadinessLine items={readinessItems} readyLabel="Ready to schedule" onFix={handleFix} />
    );
  const footerStatus = isPublished ? (
    <p data-review-status="published" className="flex items-center gap-2 text-sm">
      <span className="font-medium text-emerald-700 dark:text-emerald-400">Published</span>
      {permalink && publishPlatform && (
        <a
          href={permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2"
        >
          View on {publishPlatformLabel(publishPlatform)}
        </a>
      )}
    </p>
  ) : isScheduled ? (
    <p data-review-status="scheduled" className="text-sm font-medium">
      Scheduled{whenLabel ? ` · ${whenLabel}` : ''}
    </p>
  ) : null;
  const footerAlert = (
    <>
      {tokenExpired && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          {publishPlatformLabel(publishPlatform)} access token expired.{' '}
          <a href="/settings?section=integrations" className="underline underline-offset-2">
            Reconnect your account
          </a>
        </div>
      )}
      {placement.error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300"
        >
          {placement.error.message}
          <button
            type="button"
            onClick={placement.clearError}
            className="ml-2 underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
  const scheduleChips = editable ? (
    <PostMetaChips
      className="border-0 bg-transparent p-0"
      platforms={selectedPlatforms}
      platformControl={
        <PlatformSelector
          selected={selectedPlatforms}
          verdicts={platformVerdicts({
            format: publishFormat,
            caption: storedDraft.captionPreview,
            hashtags: storedDraft.hashtags,
            accounts: publishAccounts,
            selected: selectedPlatforms,
          })}
          onToggle={(platform, checked) => void handleTogglePlatform(platform, checked)}
          // The draft gets its row from the autosave within a moment; until then there is
          // no row for a new platform to copy.
          disabledReason={
            !storedDraft.backendDraftId || membership.isSaving
              ? 'Saving…'
              : accountsLoading
                ? 'Loading accounts…'
                : // A platform added to a scheduled post would be a draft row nobody schedules.
                  storedDraft.status === 'scheduled'
                  ? 'Move it back to draft to change its platforms'
                  : null
          }
        />
      }
      format={toPublishFormat(draft.format)}
      formatLabel={formatLabel}
      timeLabel={draft.timeLabel}
      onFormatChange={handleFormatChange}
      onTimeChange={handleTimeChange}
    />
  ) : null;

  // ── Below the frame: every way what goes out differs from what was typed ──────
  // Mounted whenever there is a plan, empty or not: a live region that arrives with its first
  // notice is not announced. Out of the layout while empty.
  const planNotices = plan ? (
    <div
      data-plan-notices=""
      aria-live="polite"
      className={cn(
        'flex shrink-0 flex-col gap-1',
        plan.notices.length === 0 && !plan.cover && 'sr-only',
      )}
    >
      {plan.cover && (
        <p
          data-plan-cover={plan.cover.storagePath ?? plan.cover.url ?? ''}
          className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/90 px-3 py-1.5 text-xs text-muted-foreground"
        >
          {plan.cover.url && (
            <img src={plan.cover.url} alt="" className="size-6 shrink-0 rounded object-cover" />
          )}
          Cover sent with the video
        </p>
      )}
      {plan.notices.map((notice) => (
        <p
          key={`${notice.code}:${notice.message}`}
          data-plan-notice={notice.code}
          className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/90 px-3 py-1.5 text-xs text-muted-foreground"
        >
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {notice.message}
        </p>
      ))}
    </div>
  ) : null;

  const groupCaptionActions =
    editable && isGroup(storedDraft) ? (
      <div data-group-caption-actions="" className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={groupCaptionBusy !== null}
          aria-busy={groupCaptionBusy === 'apply'}
          // Keeps an open caption open: its blur re-lays the frame under the pointer and the
          // click then lands on whatever moved there. The handler flushes the typing itself.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void handleApplyToAll()}
        >
          Apply to all platforms
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={groupCaptionBusy !== null || !draft.backendDraftId}
          aria-busy={groupCaptionBusy === 'adapt'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void handleAdapt()}
        >
          <Wand2 aria-hidden="true" />
          Adapt for {PUBLISH_PLATFORM_LABELS[framePlatform]}
        </Button>
      </div>
    ) : null;

  const slotScrolls =
    captionEditing ||
    creativeOpen ||
    hashtagsOpen ||
    optionsOpen ||
    productionDetailsOpen ||
    showHyperframePlayer;
  const slotContent = (
    <>
      {productionDetailsOpen && (
        <ContextualPanel title="Details" onClose={() => setProductionDetailsOpen(false)}>
          <div className="flex flex-col gap-2">
            <LifecyclePill status={draft.status} />
            <p className="text-xs text-muted-foreground">
              {draftStatusPresentation(draft.status).label} ·{' '}
              {deriveMediaStageLabel(resolveDraftMediaStage(draft))}
            </p>
            <MediaEnrichmentSummary
              draft={draft}
              onReuseLibrary={() => setMediaSelectOpen(true)}
              onRealize={handleGenerateMedia}
              canRealize={false}
            />
            {draftHook && brandProfileId ? (
              <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2">
                <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Hook
                </span>
                <p className="min-w-0 flex-1 truncate text-sm" title={draftHook}>
                  {draftHook}
                </p>
                <DraftHookViralityBadge brandId={brandProfileId} hook={draftHook} />
              </div>
            ) : null}
            {inspirationSourceUrl && (
              <a
                href={inspirationSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Inspiration source · View original post
              </a>
            )}
          </div>
        </ContextualPanel>
      )}

      {optionsOpen && isPostPlatform(framePlatform) && (
        <ContextualPanel title="Platform options" onClose={() => setOptionsOpen(false)}>
          <div className="flex flex-col gap-3">
            {platformSwitch('Options for')}
            <PublishOptionsPanel
              draft={draftForPreview}
              publishOptions={publishOptions}
              platform={framePlatform}
              format={publishFormat}
              brandId={brandProfileId}
              disabled={!editable}
              onChange={handlePublishOptionsChange}
            />
          </div>
        </ContextualPanel>
      )}

      {creativeOpen && (
        <ContextualPanel title="Creative direction" onClose={() => setCreativeOpen(false)}>
          <InlinePreviewTextarea
            value={creativeDirection}
            onChange={(event) => handleCreativeDirectionChange(event.target.value)}
            onBlur={() => {
              void fieldEditor.flush();
            }}
            placeholder="Describe the hook, visual intent, and mood."
            className="min-h-[5rem] text-sm leading-relaxed"
          />
        </ContextualPanel>
      )}

      {hashtagsOpen && (
        <ContextualPanel title="Hashtags" onClose={() => setHashtagsOpen(false)}>
          <HashtagTiers draft={draft} onHashtagsChange={handleHashtagsChange} />
        </ContextualPanel>
      )}

      {showHyperframePlayer ? (
        <div className="flex flex-col gap-3">
          <HyperFramePlayer draft={draftForPreview} brandId={brandProfileId ?? ''} />
          <div className="rounded-xl border border-border/70 bg-background/90 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Caption
            </p>
            <EditableCaption
              value={draft.captionPreview}
              displayValue={sentCaption ?? undefined}
              onChange={handleCaptionChange}
              platform={framePlatform}
              hashtags={draft.hashtags}
              ariaLabel={`${PUBLISH_PLATFORM_LABELS[framePlatform]} caption`}
              editable={editable}
              editing={captionEditing}
              onEditingChange={setCaptionEditing}
            />
          </div>
        </div>
      ) : (
        <div
          className={cn(
            isTextPost
              ? '[container-type:inline-size]'
              : slotScrolls
                ? // Sized by the outer slot (the size container below), so an open caption grows
                  // this box and pushes what follows down instead of spilling over it.
                  'shrink-0'
                : 'min-h-0 flex-1 [container-type:size]',
          )}
        >
          <SocialPostFrame
            platform={framePlatform}
            frame={previewFrame}
            caption={draftForPreview.captionPreview}
            sentCaption={sentCaption}
            title={plan?.options.youtube?.title}
            hashtags={draftForPreview.hashtags}
            brandName={frameAccountName}
            avatarUrl={frameAccount?.avatarUrl ?? plan?.account.avatarUrl}
            timeLabel={whenLabel ?? draft.timeLabel}
            mediaNode={mediaNode}
            onAddMedia={canPostWithoutMedia ? undefined : () => handleFix('media')}
            editable={editable}
            onCaptionChange={handleCaptionChange}
            captionEditing={captionEditing}
            onCaptionEditingChange={setCaptionEditing}
          />
        </div>
      )}

      {slideStrip}

      {addMediaToTextPost}

      {groupCaptionActions}

      {planNotices}

      {placement.canUndo && (
        <button
          type="button"
          onClick={placement.undo}
          className="self-start rounded px-1.5 py-0.5 text-2xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Undo last media change
        </button>
      )}

      {selectedPlatforms.length > 1 && (
        <div className="shrink-0">{platformSwitch('See it on')}</div>
      )}
    </>
  );

  return (
    <DndContext sensors={dndSensors} onDragEnd={handleDragEnd}>
      {/* The plan this panel renders, as the joint fidelity bench reads it against the dry run. */}
      <div
        ref={panelRef}
        data-plan-platform={plan?.platform}
        data-plan-format={plan?.format}
        data-plan-verb={plan?.verb}
        className="flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm"
      >
        <ReviewIdentityRow
          titleRef={titleRef}
          insetStart={insetStart}
          platform={framePlatform}
          accounts={frameAccounts}
          selectedAccountId={draft.targetAccountId ?? null}
          onSelectAccount={editable && draft.backendDraftId ? handleSelectAccount : undefined}
          pickerDisabledReason={fieldEditor.savingFields.has('account') ? 'Saving…' : null}
          accountsLoading={accountsLoading && frameAccounts.length === 0}
          summary={[formatLabel, whenLabel ?? 'Not scheduled'].join(' · ')}
          menu={menu}
          onClose={onClose}
        />

        {/* The frame slot is a size container: the frame sizes itself from the slot's width AND
            height, so the whole post fits without scrolling. An open editor or panel may outgrow
            it, so those states scroll inside the same slot. min-h-0 keeps the flex-1 children
            from growing to their content and being clipped by the panel. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 bg-muted/10 p-3 [container-type:size]">
          {/* One element in both states: swapping it remounted the open caption, which lost
              the focus it returns to on Escape. */}
          <div
            data-preview-frame-slot=""
            className={cn(
              'flex min-h-0 flex-1 flex-col',
              slotScrolls ? 'gap-3 overflow-y-auto' : 'gap-2 overflow-hidden',
            )}
            onLoadCapture={handleMediaLoaded}
            onLoadedMetadataCapture={handleMediaLoaded}
          >
            {slotContent}
          </div>
        </div>

        <ReviewFooter
          when={scheduleChips}
          primary={primaryAction}
          secondary={publishNowAction}
          note={footerNote}
          status={footerStatus}
          alert={footerAlert}
        />
      </div>
      {lightboxNode}
    </DndContext>
  );
}
