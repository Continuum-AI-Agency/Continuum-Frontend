'use client';

import { hasApprovablePreview } from '@continuum/contracts';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  ChevronDown,
  Clapperboard,
  GalleryHorizontalEnd,
  ImageIcon,
  ImageOff,
  List,
  PencilRuler,
  RectangleVertical,
  RefreshCw,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { type ButtonHTMLAttributes, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChatMediaCarousel, ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import { type ChatMedia, mediaFromPreviewUrls } from '@/components/chat/media/media';
import { type LightboxItem, MediaLightbox } from '@/components/organic/primitives/MediaLightbox';
import { MetaRow, PlatformTag, StatusLabel } from '@/components/shared/agent-cards/agentCardKit';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { resolveConceptPreviewUrls } from './conceptPreview';
import { type ConceptStatus, resolvePlanItemStatus } from './conceptStatus';
import { StatusDetail } from './StatusDetail';
import type { PipelineCardState, PlanItem, PlanItemStatus } from './types';

// --- Vocabulary -------------------------------------------------------------
// Every one of these fields ships on the wire as a machine token. A person reads
// none of them that way, so each becomes the words a marketer would actually use.

const OBJECTIVE_LABELS: Record<PlanItem['objective'], string> = {
  follow: 'Drive follows',
  save: 'Drive saves',
  click: 'Drive clicks',
  comment: 'Spark comments',
  dm: 'Drive DMs',
  share: 'Drive shares',
};

const FUNNEL_LABELS: Record<string, string> = {
  top: 'Top of funnel',
  middle: 'Mid-funnel',
  bottom: 'Bottom of funnel',
  retention: 'Retention',
};

export const FORMAT_LABELS: Record<string, string> = {
  reel: 'Reel',
  post: 'Post',
  carousel: 'Carousel',
  story: 'Story',
};

const FORMAT_ICONS: Record<string, LucideIcon> = {
  reel: Clapperboard,
  carousel: GalleryHorizontalEnd,
  story: RectangleVertical,
  post: ImageIcon,
};

// The well takes the shape of the thing it will hold, so a reel is recognisable as a reel
// before any artwork exists and without reading the label next to it. Height is fixed and
// the aspect decides the width, which is why there is no pixel literal here.
const FORMAT_ASPECT: Record<string, string> = {
  reel: 'aspect-[9/16]',
  story: 'aspect-[9/16]',
  carousel: 'aspect-square',
  post: 'aspect-square',
};

const wellShape = (format: string | null): string =>
  cn('h-24 shrink-0', FORMAT_ASPECT[format ?? ''] ?? 'aspect-square');

const IMAGE_OUTLINE = 'outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10';

/** "Mon 25" — the weekly plan's real ordering key, so a plan reads as a schedule. */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

/** The exact schedule, kept for inspection depth rather than the scannable strip. */
function formatExactSchedule(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// --- Pieces -----------------------------------------------------------------

/**
 * The row's media well. It begins as the quiet mark of the format that is coming and
 * becomes the generated artwork once the pipeline produces it — so a plan visibly fills in
 * as it executes instead of announcing it in text.
 *
 * The FACE carries the cover, the format's shape, a play mark for anything with motion and
 * a slide count. It deliberately does NOT page: at this width the carousel's own arrows
 * would cover the picture they are paging, and flicking four frames in a 96px tile is
 * fiddling, not judging. The strip lives one hover away, where it is big enough to read,
 * and the full-size lightbox is one click.
 */
function MediaWell({
  media,
  format,
  failed,
  caption,
  onOpen,
}: {
  media: readonly ChatMedia[];
  format: string | null;
  failed: boolean;
  caption: string | null;
  onOpen: (index: number) => void;
}) {
  const shape = wellShape(format);
  const cover = media[0];

  if (!cover) {
    const Icon = failed ? ImageOff : (FORMAT_ICONS[format ?? ''] ?? ImageIcon);
    return (
      <div
        aria-hidden="true"
        className={cn(
          'grid place-items-center rounded-md border border-dashed',
          shape,
          failed
            ? 'border-destructive/30 bg-destructive/5 text-destructive/60'
            : 'border-border/60 bg-muted/30 text-muted-foreground/70',
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
    );
  }

  const formatLabel = format ? (FORMAT_LABELS[format] ?? format) : null;

  return (
    <div className={cn('relative', shape)}>
      <HoverCard closeDelay={100} openDelay={180}>
        {/* The trigger IS the cover, not a wrapper around it. Base UI renders a trigger as an
            anchor by default and a nested button would be invalid markup, so the button takes
            its place through `render` — the same shape the plan header's evidence card uses.
            A bare wrapping div is a trigger the preview never opened from. */}
        <HoverCardTrigger
          render={
            <button
              aria-label={`Open ${formatLabel ?? 'preview'}`}
              className={cn(
                'block size-full cursor-zoom-in overflow-hidden rounded-md',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                IMAGE_OUTLINE,
              )}
              onClick={() => onOpen(0)}
              type="button"
            >
              <ChatMediaThumb className="rounded-none" hoverPlay media={cover} />
            </button>
          }
        />
        <HoverCardContent align="start" className="w-72 p-2" side="right">
          <div
            className={cn(
              'w-full overflow-hidden rounded-md',
              FORMAT_ASPECT[format ?? ''] ?? 'aspect-square',
            )}
          >
            <ChatMediaCarousel
              fallbackSeed={formatLabel ?? undefined}
              hoverPlay
              items={media}
              onOpen={onOpen}
            />
          </div>
          <p className="mt-2 text-3xs text-muted-foreground">
            {[formatLabel, media.length > 1 ? `${media.length} slides` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {caption && (
            <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-foreground/85 text-pretty">
              {caption}
            </p>
          )}
        </HoverCardContent>
      </HoverCard>

      {/* Outside the trigger: a badge that swallowed the pointer would close the preview the
          moment the pointer crossed it. */}
      {media.length > 1 && (
        <span className="pointer-events-none absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 font-medium text-3xs text-white backdrop-blur-sm">
          {media.length}
        </span>
      )}
    </div>
  );
}

/** Label / value pair for the inspection block. Renders nothing when there is nothing. */
function BriefRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value || !value.trim()) return null;
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-1">
      <dt className="text-2xs leading-relaxed text-muted-foreground">{label}</dt>
      <dd className="text-xs leading-relaxed text-foreground/85 text-pretty">{value}</dd>
    </div>
  );
}

/** A text-weight row action. The plan footer owns the one filled primary. */
function RowAction({
  icon: Icon,
  children,
  emphasis,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  emphasis?: 'primary' | 'danger';
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-40',
        emphasis === 'primary'
          ? 'font-medium text-foreground/80 hover:bg-muted/60 hover:text-primary'
          : emphasis === 'danger'
            ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        props.className,
      )}
    >
      <Icon className="h-3 w-3" />
      {children}
    </button>
  );
}

// --- The row ----------------------------------------------------------------

type Props = {
  concept: PlanItem;
  status: PlanItemStatus;
  pipeline?: PipelineCardState;
  locked?: boolean;
  /** Resolved by ConceptPlan against the plan's own items — "Mon 25 · Reel". */
  dependsOnLabel?: string | null;
  onGenerate: () => void;
  onDismiss?: () => void;
  onViewDraft?: (draftId: string, target: 'calendar' | 'list') => void;
  /** Stage-2 "Enrich": sketch the blueprint for a text-ready draft. */
  onEnrichDraft?: (draftId: string) => void;
  /** Stage-3 "Generate media": realize a blueprint-ready draft (format-routed). */
  onGenerateMedia?: (draftId: string, format: string, previewRevision: string) => void;
  /**
   * Re-run the job that failed, IN PLACE. `onGenerate` dispatches a NEW job, which for a
   * failure leaves the dead row behind — that is how the queued-jobs counter fills with
   * abandoned work nobody is watching. Only offered when there is a jobId to reset.
   */
  onRetryJob?: (jobId: string) => void;
};

export function ConceptCard({
  concept,
  status,
  pipeline,
  locked,
  dependsOnLabel,
  onGenerate,
  onDismiss,
  onViewDraft,
  onEnrichDraft,
  onGenerateMedia,
  onRetryJob,
}: Props) {
  const [dispatched, setDispatched] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mediaActionSent, setMediaActionSent] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const detailId = useId();
  // Synchronous latch: setDispatched is async and updates too late to stop a fast
  // double-click, so this ref blocks the second onGenerate immediately.
  const dispatchInFlightRef = useRef(false);

  const caption = pipeline?.preview?.caption ?? null;
  const brief = concept.creativeBrief ?? null;
  const draftId = pipeline?.draftId ?? concept.draftId ?? null;

  // A storyboard frame is a still whatever the draft's format is; only realized media may
  // read its kind from the format. Getting this backwards is what put a PNG in a <video>
  // and left every reel concept showing a fallback glyph.
  const mediaStatus = pipeline?.checkpoint?.mediaStatus;
  const previewMedia = useMemo(() => {
    const urls = resolveConceptPreviewUrls(pipeline?.preview);
    if (urls.length === 0) return [];
    const realized = mediaStatus === 'ready' || mediaStatus === 'user_supplied';
    return mediaFromPreviewUrls(
      `concept:${concept.itemId}`,
      urls,
      concept.format,
      realized ? 'realized' : 'storyboard',
    );
  }, [pipeline?.preview, mediaStatus, concept.itemId, concept.format]);

  const lightboxItems: LightboxItem[] = useMemo(
    () =>
      previewMedia.map((item) => ({
        url: item.url,
        caption: item.caption ?? caption ?? '',
        isVideo: item.kind === 'video',
      })),
    [previewMedia, caption],
  );

  const state: ConceptStatus = resolvePlanItemStatus({
    itemStatus: status,
    pipeline: pipeline ?? null,
    dispatched,
  });
  const isFailed = state.kind === 'failed' || state.kind === 'media_failed';

  const hasTextDraft = Boolean(
    draftId &&
      (pipeline?.checkpoint?.textReady ||
        state.kind === 'copy_ready' ||
        state.kind === 'preview_ready' ||
        state.kind === 'realizing' ||
        state.kind === 'realized' ||
        state.kind === 'media_failed'),
  );
  const hasPreviewReady = Boolean(pipeline?.checkpoint?.blueprintReady);
  const previewRevision = pipeline?.checkpoint?.previewRevision;
  // Approve-through media actions: Enrich while only text exists, Generate media once
  // the blueprint landed. Neither shows once media is final/user-supplied or rendering.
  const mediaSettled =
    mediaStatus === 'ready' || mediaStatus === 'user_supplied' || mediaStatus === 'generating';
  const showGenerateMedia = Boolean(
    onGenerateMedia &&
      draftId &&
      hasApprovablePreview(pipeline?.checkpoint) &&
      hasPreviewReady &&
      !mediaSettled,
  );
  // The invariant: an unsettled row always offers an action. Enrich doubles as the
  // recovery for a blueprint that landed without a usable approval token, because
  // re-expanding stamps a fresh previewRevision — which is also the media-failure retry.
  const showEnrich = Boolean(
    onEnrichDraft &&
      draftId &&
      pipeline?.checkpoint?.textReady &&
      !mediaSettled &&
      !showGenerateMedia,
  );

  // Clear the latch when a job fails so the retry action can dispatch again; a
  // successful run swaps the row away from the generate action entirely.
  useEffect(() => {
    if (isFailed) dispatchInFlightRef.current = false;
  }, [isFailed]);

  const failedJobId = isFailed ? (pipeline?.jobId ?? null) : null;
  const canRetryInPlace = Boolean(failedJobId && onRetryJob);

  const handleGenerateClick = () => {
    if (dispatchInFlightRef.current) return;
    dispatchInFlightRef.current = true;
    setDispatched(true);
    if (canRetryInPlace && failedJobId) {
      onRetryJob?.(failedJobId);
      return;
    }
    onGenerate();
  };

  // The lead line is whatever the post will actually SAY, at the best fidelity we
  // have: the written caption once copy lands, the planner's locked hook before
  // that. Both are the post's own voice, so both are quoted. The angle is the
  // strategist's direction, NOT words anyone will read — it is never quoted, and it
  // only takes the lead when there is no voice to show yet.
  const spokenLine = caption ?? brief?.hook ?? null;
  const leadLine = spokenLine ?? concept.angle;
  const showAngleBeneath = Boolean(spokenLine) && Boolean(concept.angle);

  const metaItems = [
    formatDayLabel(concept.scheduledAt),
    concept.format ? (FORMAT_LABELS[concept.format] ?? concept.format) : undefined,
    OBJECTIVE_LABELS[concept.objective],
    brief?.funnelStage ? FUNNEL_LABELS[brief.funnelStage] : undefined,
  ];

  return (
    <article data-slot="concept-row" data-status-kind={state.kind} className="flex gap-3 py-3">
      <MediaWell
        caption={caption}
        failed={state.kind === 'media_failed'}
        format={concept.format}
        media={previewMedia}
        onOpen={setLightboxIndex}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* ── Metadata strip: scannable, never competing with the content ── */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <PlatformTag platform={concept.platform} />
            <MetaRow items={metaItems} className="text-2xs" />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {state.kind !== 'concept' && (
              <StatusLabel
                detail={
                  <StatusDetail
                    checkpoint={pipeline?.checkpoint ?? null}
                    diagnostic={state.diagnostic}
                    error={pipeline?.error?.message ?? null}
                    pct={pipeline?.pct ?? null}
                    stageLabel={state.label}
                  />
                }
                title={state.diagnostic ?? undefined}
                tone={state.tone}
              >
                {state.label}
              </StatusLabel>
            )}
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailId}
              aria-label={expanded ? 'Hide creative brief' : 'Show creative brief'}
              onClick={() => setExpanded((v) => !v)}
              className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-transform duration-150',
                  expanded && 'rotate-180',
                )}
              />
            </button>
          </div>
        </div>

        {/* ── What the post will say ─────────────────────────────────────── */}
        <p
          className={cn(
            'max-w-[68ch] text-sm font-medium leading-snug text-foreground text-pretty',
            !expanded && 'line-clamp-3',
          )}
        >
          {spokenLine ? `“${leadLine}”` : leadLine}
        </p>
        {showAngleBeneath && (
          <p
            className={cn(
              'max-w-[68ch] text-xs leading-relaxed text-muted-foreground text-pretty',
              !expanded && 'line-clamp-2',
            )}
          >
            {concept.angle}
          </p>
        )}

        {/* ── Why this post: the rationale + its trend, the trust pair ────── */}
        {(concept.rationale || concept.trendTitle) && (
          <div className="max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
            {/* Three lines, not two: "why this post" is the trust half of the row and the
                end state is that a person can read it WITHOUT clicking. Three lines holds
                most rationales whole; the disclosure covers the rest. */}
            {concept.rationale && (
              <p className={cn('text-pretty', !expanded && 'line-clamp-3')}>
                <span className="mr-1.5 font-medium text-foreground/70">Why</span>
                {concept.rationale}
              </p>
            )}
            {concept.trendTitle && (
              <p className="mt-1 truncate text-2xs text-muted-foreground">
                <span aria-hidden="true">↑ </span>
                Trending: {concept.trendTitle}
              </p>
            )}
          </div>
        )}

        {isFailed && pipeline?.error?.message && (
          <p className="max-w-[68ch] text-2xs leading-relaxed text-destructive/80 text-pretty">
            {pipeline.error.message}
          </p>
        )}

        {/* ── Inspection depth ───────────────────────────────────────────── */}
        {expanded && (
          <dl
            id={detailId}
            className="mt-1 max-w-[68ch] divide-y divide-border/40 rounded-lg border border-border/40 bg-muted/20 px-3 py-1.5"
          >
            <BriefRow label="Scheduled" value={formatExactSchedule(concept.scheduledAt)} />
            <BriefRow label="Audience" value={brief?.targetAudience ?? concept.audienceSegment} />
            <BriefRow label="Segment" value={brief ? concept.audienceSegment : null} />
            <BriefRow label="Tone & voice" value={brief?.toneAndVoice} />
            <BriefRow label="Objective" value={brief?.contentObjective} />
            <BriefRow label="Trend use" value={brief?.trendIntegration} />
            <BriefRow label="Your direction" value={concept.guidancePrompt} />
            <BriefRow
              label="Production notes"
              value={brief?.productionNotes?.length ? brief.productionNotes.join(' · ') : null}
            />
          </dl>
        )}

        {/* Progress belongs to the ROW, so it sits at the row's foot and spans it.
            A run we have lost sight of keeps the track but leaves it EMPTY: no fake
            fill, no pulse. Healthy progress animates; "no updates yet" visibly does not. */}
        {state.advancing ? (
          <Progress
            value={Math.max(5, Math.min(100, pipeline?.pct ?? 10))}
            className="mt-2 h-0.5 bg-muted/50 [&_[data-slot=progress-indicator]]:bg-brand-primary [&_[data-slot=progress-indicator]]:transition-transform [&_[data-slot=progress-indicator]]:duration-500"
          />
        ) : state.kind === 'blind' ? (
          <div
            title={state.diagnostic ?? undefined}
            className="mt-2 h-0.5 rounded-full bg-muted-foreground/15"
          />
        ) : null}

        {/* ── Actions ────────────────────────────────────────────────────── */}
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {dependsOnLabel && (
            <p className="text-2xs text-muted-foreground">Follows {dependsOnLabel}</p>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-0.5">
            {hasTextDraft && draftId && onViewDraft ? (
              <>
                <RowAction icon={CalendarDays} onClick={() => onViewDraft(draftId, 'calendar')}>
                  Calendar
                </RowAction>
                <RowAction icon={List} onClick={() => onViewDraft(draftId, 'list')}>
                  List
                </RowAction>
                {showEnrich && (
                  <RowAction
                    icon={PencilRuler}
                    emphasis="primary"
                    disabled={mediaActionSent}
                    title={
                      state.kind === 'media_failed'
                        ? 'Re-sketch the blueprint and try the media again'
                        : hasPreviewReady
                          ? 'Rebuild the blueprint to refresh its preview approval'
                          : 'Sketch a low-cost blueprint before final media'
                    }
                    onClick={() => {
                      setMediaActionSent(true);
                      onEnrichDraft?.(draftId);
                    }}
                  >
                    {mediaActionSent
                      ? 'Enriching…'
                      : state.kind === 'media_failed'
                        ? 'Try media again'
                        : hasPreviewReady
                          ? 'Rebuild preview'
                          : 'Enrich'}
                  </RowAction>
                )}
                {showGenerateMedia && (
                  <RowAction
                    icon={Wand2}
                    emphasis="primary"
                    disabled={mediaActionSent}
                    title="Render the final media from the approved blueprint"
                    onClick={() => {
                      setMediaActionSent(true);
                      if (previewRevision) {
                        onGenerateMedia?.(draftId, concept.format ?? '', previewRevision);
                      }
                    }}
                  >
                    {mediaActionSent ? 'Generating…' : 'Generate media'}
                  </RowAction>
                )}
              </>
            ) : state.advancing || state.kind === 'blind' || state.kind === 'queued' ? null : (
              <>
                <RowAction
                  icon={X}
                  emphasis="danger"
                  disabled={locked || !onDismiss}
                  onClick={onDismiss}
                  aria-label="Dismiss this concept"
                >
                  Dismiss
                </RowAction>
                <RowAction
                  icon={isFailed ? RefreshCw : Sparkles}
                  emphasis="primary"
                  disabled={locked}
                  onClick={handleGenerateClick}
                  aria-label={isFailed ? 'Retry copy draft' : 'Write copy for this concept'}
                >
                  {isFailed ? 'Retry' : 'Write copy'}
                </RowAction>
              </>
            )}
          </div>
        </div>
      </div>

      {/* The lightbox is the one component in the repo that already renders video properly,
          so a reel opens as a reel rather than as a still of one. */}
      {lightboxItems.length > 0 && (
        <MediaLightbox
          index={lightboxIndex ?? 0}
          items={lightboxItems}
          onIndexChange={setLightboxIndex}
          onOpenChange={(open) => setLightboxIndex(open ? (lightboxIndex ?? 0) : null)}
          open={lightboxIndex !== null}
          title={concept.format ? (FORMAT_LABELS[concept.format] ?? concept.format) : 'Preview'}
        />
      )}
    </article>
  );
}
