'use client';

import {
  hasApprovablePreview,
  type OrganicGenerationStatus,
  type OrganicGenerationTone,
  type OrganicMediaStage,
  resolveOrganicGenerationDisplay,
} from '@continuum/contracts';
import {
  CalendarDays,
  List,
  Loader2,
  PencilRuler,
  RefreshCw,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import { mediaFromPreviewUrls } from '@/components/chat/media/media';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { AgentArtifactCard, MetaRow, PlatformTag, StatusLabel } from './agentCardKit';
import { resolveConceptPreviewUrl } from './conceptPreview';
import type { CheckpointState, PipelineCardState, PlanItem, PlanItemStatus } from './types';

type CardTone = 'neutral' | 'running' | 'done' | 'failed';

const STATUS_TONE: Record<PlanItemStatus, CardTone> = {
  pending: 'neutral',
  executing: 'running',
  completed: 'done',
  failed: 'failed',
  cancelled: 'neutral',
};

// Pre-dispatch / non-generation fallback labels. The in-flight + terminal labels
// come from the canonical resolveOrganicGenerationDisplay so the concept card
// never describes a job differently from the ticker or the calendar.
const STATUS_LABEL: Record<PlanItemStatus, string> = {
  pending: 'Concept',
  executing: 'Copy in progress',
  completed: 'Copy ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

// Bridge the canonical generation tone onto the card-kit StatusLabel vocabulary.
const TONE_TO_CARD_TONE: Record<OrganicGenerationTone, CardTone> = {
  pending: 'neutral',
  active: 'running',
  success: 'done',
  error: 'failed',
  neutral: 'neutral',
};

// Collapse the three-step checkpoint into the canonical media stage the resolver
// understands — the running-label fallback when no pipeline stage is set yet.
function deriveCardMediaStage(checkpoint: CheckpointState | undefined): OrganicMediaStage | null {
  if (!checkpoint) return null;
  if (checkpoint.mediaStatus === 'ready' || checkpoint.mediaStatus === 'user_supplied')
    return 'realized';
  if (checkpoint.mediaStatus === 'generating') return 'realizing';
  if (checkpoint.blueprintReady) return 'storyboard_ready';
  if (checkpoint.textReady) return 'text_only';
  return null;
}

const IMAGE_OUTLINE = 'outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10';

function formatScheduledAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

type Props = {
  concept: PlanItem;
  status: PlanItemStatus;
  pipeline?: PipelineCardState;
  locked?: boolean;
  onGenerate: () => void;
  onDismiss?: () => void;
  onViewDraft?: (draftId: string, target: 'calendar' | 'list') => void;
  /** Stage-2 "Enrich": sketch the blueprint for a text-ready draft. */
  onEnrichDraft?: (draftId: string) => void;
  /** Stage-3 "Generate media": realize a blueprint-ready draft (format-routed). */
  onGenerateMedia?: (draftId: string, format: string, previewRevision: string) => void;
};

export function ConceptCard({
  concept,
  status,
  pipeline,
  locked,
  onGenerate,
  onDismiss,
  onViewDraft,
  onEnrichDraft,
  onGenerateMedia,
}: Props) {
  const [dispatched, setDispatched] = useState(false);
  // Synchronous latch: setDispatched is async and updates too late to stop a fast
  // double-click, so this ref blocks the second onGenerate immediately.
  const dispatchInFlightRef = useRef(false);

  const image = resolveConceptPreviewUrl(pipeline?.preview);
  const caption = pipeline?.preview?.caption ?? null;
  const isGenerating = status === 'executing' || pipeline?.status === 'running';
  const isDone = status === 'completed' || pipeline?.status === 'completed';
  const isFailed = status === 'failed' || pipeline?.status === 'failed';
  const pct = Math.max(5, Math.min(100, pipeline?.pct ?? 10));
  const draftId = pipeline?.draftId ?? concept.draftId ?? null;
  const hasTextDraft = Boolean(draftId && (pipeline?.checkpoint?.textReady || isDone));
  const mediaStatus = pipeline?.checkpoint?.mediaStatus;
  const hasPreviewReady = Boolean(pipeline?.checkpoint?.blueprintReady);
  const previewRevision = pipeline?.checkpoint?.previewRevision;
  // Approve-through media actions: Enrich while only text exists, Generate media
  // once the blueprint landed. Neither shows once media is final/user-supplied
  // or already rendering.
  const mediaSettled =
    mediaStatus === 'ready' || mediaStatus === 'user_supplied' || mediaStatus === 'generating';
  const showGenerateMedia = Boolean(
    onGenerateMedia &&
      draftId &&
      hasApprovablePreview(pipeline?.checkpoint) &&
      hasPreviewReady &&
      !mediaSettled,
  );
  // Same invariant as PipelineCard: an unsettled card always offers an action. Enrich
  // doubles as the recovery for a blueprint that landed without a usable approval
  // token, because re-expanding stamps a fresh previewRevision.
  const showEnrich = Boolean(
    onEnrichDraft &&
      draftId &&
      pipeline?.checkpoint?.textReady &&
      !mediaSettled &&
      !showGenerateMedia,
  );
  const [mediaActionSent, setMediaActionSent] = useState(false);

  // Clear the latch when a job fails so the retry button can dispatch again; a
  // successful run swaps the card away from the generate button entirely.
  useEffect(() => {
    if (isFailed) dispatchInFlightRef.current = false;
  }, [isFailed]);

  const handleGenerateClick = () => {
    if (dispatchInFlightRef.current) return;
    dispatchInFlightRef.current = true;
    setDispatched(true);
    onGenerate();
  };

  // One canonical (status, stage) -> label/tone so the in-flight + terminal copy
  // matches the ticker and calendar. Pre-dispatch the card is still a "Concept",
  // not a generation, so the resolver only drives the dispatched/running states.
  const isInFlight = isGenerating || (dispatched && !isFailed);
  const genStatus: OrganicGenerationStatus = isFailed
    ? 'failed'
    : isDone
      ? 'completed'
      : isGenerating
        ? 'running'
        : 'queued';
  const genDisplay = resolveOrganicGenerationDisplay({
    status: genStatus,
    stage: pipeline?.currentStage ?? null,
    mediaStage: deriveCardMediaStage(pipeline?.checkpoint),
  });

  const statusLabel =
    mediaStatus === 'ready' || mediaStatus === 'user_supplied'
      ? 'Fully fleshed out'
      : mediaStatus === 'generating'
        ? 'Fleshing out'
        : hasPreviewReady
          ? 'Preview ready'
          : hasTextDraft
            ? 'Copy ready'
            : isInFlight
              ? genDisplay.label
              : STATUS_LABEL[status];
  const statusTone: CardTone = hasTextDraft
    ? 'done'
    : isInFlight
      ? TONE_TO_CARD_TONE[genDisplay.tone]
      : STATUS_TONE[status];

  return (
    <AgentArtifactCard className="mt-0 flex flex-col p-0">
      {/* ── Image / placeholder ──────────────────────────────── */}
      <div className="relative aspect-square w-full">
        {image ? (
          <ChatMediaThumb
            media={mediaFromPreviewUrls('concept', [image], concept.format)[0]}
            className={cn('rounded-none', IMAGE_OUTLINE)}
          />
        ) : (
          <div className="flex h-full flex-col justify-between bg-gradient-to-br from-muted/80 via-muted/50 to-muted/20 p-3">
            <PlatformTag platform={concept.platform} />
            {concept.angle && (
              <p className="line-clamp-5 text-sm font-semibold leading-snug text-foreground/90 text-pretty">
                {concept.angle}
              </p>
            )}
          </div>
        )}

        {image && (
          <div className="absolute inset-x-0 top-0 p-2.5">
            <PlatformTag
              platform={concept.platform}
              className="bg-black/40 text-white backdrop-blur-[2px]"
            />
          </div>
        )}

        {isGenerating && (
          <Progress
            value={pct}
            className="absolute inset-x-0 bottom-0 h-0.5 rounded-none bg-muted/40 [&_[data-slot=progress-indicator]]:bg-brand-primary [&_[data-slot=progress-indicator]]:transition-transform [&_[data-slot=progress-indicator]]:duration-500"
          />
        )}
      </div>

      {/* ── Scrollable metadata ──────────────────────────────── */}
      <div className="flex max-h-[84px] flex-1 flex-col gap-1 overflow-y-auto p-3 [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center justify-between gap-1">
          <MetaRow
            items={[concept.format ?? undefined, formatScheduledAt(concept.scheduledAt)]}
            className="text-2xs"
          />
          <StatusLabel tone={statusTone}>{statusLabel}</StatusLabel>
        </div>
        {concept.trendTitle && (
          <p className="text-2xs text-muted-foreground/60">↑ {concept.trendTitle}</p>
        )}
        {(caption ?? concept.rationale) && (
          <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
            {caption ?? concept.rationale}
          </p>
        )}
        {isFailed && pipeline?.error?.message && (
          <p className="text-2xs text-destructive/80">{pipeline.error.message}</p>
        )}
      </div>

      {/* ── Action row ──────────────────────────────────────── */}
      <div className="flex items-stretch border-t border-border/40">
        {hasTextDraft && draftId && onViewDraft ? (
          <>
            <button
              type="button"
              onClick={() => onViewDraft(draftId, 'calendar')}
              className="flex flex-1 items-center justify-center gap-1 py-2.5 text-2xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <CalendarDays className="h-3 w-3" />
              Calendar
            </button>
            <div className="w-px self-stretch bg-border/40" />
            <button
              type="button"
              onClick={() => onViewDraft(draftId, 'list')}
              className="flex flex-1 items-center justify-center gap-1 py-2.5 text-2xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <List className="h-3 w-3" />
              List
            </button>
            {showEnrich && (
              <>
                <div className="w-px self-stretch bg-border/40" />
                <button
                  type="button"
                  title={
                    hasPreviewReady
                      ? 'Rebuild the blueprint to refresh its preview approval'
                      : 'Sketch a low-cost blueprint before final media'
                  }
                  disabled={mediaActionSent}
                  onClick={() => {
                    setMediaActionSent(true);
                    onEnrichDraft?.(draftId);
                  }}
                  className="flex flex-1 items-center justify-center gap-1 py-2.5 text-2xs text-muted-foreground transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                >
                  <PencilRuler className="h-3 w-3" />
                  {mediaActionSent ? 'Enriching…' : hasPreviewReady ? 'Rebuild preview' : 'Enrich'}
                </button>
              </>
            )}
            {showGenerateMedia && (
              <>
                <div className="w-px self-stretch bg-border/40" />
                <button
                  type="button"
                  title="Render the final media from the approved blueprint"
                  disabled={mediaActionSent}
                  onClick={() => {
                    setMediaActionSent(true);
                    if (previewRevision) {
                      onGenerateMedia?.(draftId, concept.format ?? '', previewRevision);
                    }
                  }}
                  className="flex flex-1 items-center justify-center gap-1 py-2.5 text-2xs text-muted-foreground transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                >
                  <Wand2 className="h-3 w-3" />
                  {mediaActionSent ? 'Generating…' : 'Generate media'}
                </button>
              </>
            )}
          </>
        ) : isInFlight ? (
          <div className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-2xs text-muted-foreground/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {genDisplay.label}…
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={locked || !onDismiss}
              onClick={onDismiss}
              className={cn(
                'flex flex-1 items-center justify-center py-2.5',
                'text-muted-foreground/30 transition-[color,transform] duration-150',
                'hover:text-destructive active:scale-[0.96]',
                'disabled:pointer-events-none disabled:opacity-20',
              )}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="w-px self-stretch bg-border/40" />
            <button
              type="button"
              aria-label={isFailed ? 'Retry copy draft' : 'Create copy draft'}
              title={isFailed ? 'Retry copy draft' : 'Create copy draft'}
              disabled={locked || isGenerating}
              onClick={handleGenerateClick}
              className={cn(
                'flex flex-1 items-center justify-center py-2.5',
                'text-muted-foreground/30 transition-[color,transform] duration-150',
                'hover:text-emerald-500 active:scale-[0.96]',
                'disabled:pointer-events-none disabled:opacity-20',
              )}
            >
              {isFailed ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            </button>
          </>
        )}
      </div>
    </AgentArtifactCard>
  );
}
