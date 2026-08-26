'use client';

import {
  hasApprovablePreview,
  resolveOrganicAgentLabel,
  resolveOrganicGenerationDisplay,
} from '@continuum/contracts';
import {
  AlertCircle,
  Check,
  Clock,
  ImageOff,
  Loader2,
  PencilRuler,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatMediaCarousel } from '@/components/chat/media/ChatMedia';
import { type ChatMedia, mediaFromPreviewUrls } from '@/components/chat/media/media';
import { type LightboxItem, MediaLightbox } from '@/components/organic/primitives/MediaLightbox';
import {
  AgentArtifactCard,
  MetaRow,
  PlatformTag,
  StatusLabel,
} from '@/components/shared/agent-cards/agentCardKit';
import { Progress } from '@/components/ui/progress';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { useDraftRealizedImages, useDraftStoryboard } from '../hooks/useDraftStoryboard';
import { resolveConceptPreviewUrls } from './conceptPreview';
import { type ConceptStatus, resolveConceptStatus } from './conceptStatus';
import { StatusDetail } from './StatusDetail';
import type { CheckpointState, PipelineCardState, PipelineStage, PipelineStageNode } from './types';

// One vocabulary across surfaces: the stepper labels each stage with the SAME canonical
// resolver the generations widget uses, instead of a divergent local map.
const stageLabel = (stage: PipelineStage): string =>
  resolveOrganicGenerationDisplay({ status: 'running', stage }).label;

const IMAGE_OUTLINE = 'outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10';

function qualityPercent(score: number | undefined): number | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return score <= 1 ? Math.round(score * 100) : Math.round(score);
}

/**
 * This card is full width, so unlike the plan row it has the room to page in place: the
 * shared carousel puts its arrows inside the tile on hover and owns the k/N counter, which
 * a bare shadcn Carousel with arrows hanging outside the frame did not.
 */
function PreviewImages({
  media,
  onOpen,
}: {
  media: readonly ChatMedia[];
  onOpen: (index: number) => void;
}) {
  if (media.length === 0) return null;
  return (
    <div className={cn('h-[220px] w-full overflow-hidden rounded-lg', IMAGE_OUTLINE)}>
      <ChatMediaCarousel hoverPlay items={media} onOpen={onOpen} />
    </div>
  );
}

function StageNode({ node, index }: { node: PipelineStageNode; index: number }) {
  const dot =
    node.status === 'active' ? (
      <motion.div
        initial={{ scale: 0.25, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
      >
        <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
      </motion.div>
    ) : node.status === 'done' ? (
      <Check className="h-3 w-3 text-emerald-500" />
    ) : node.status === 'failed' ? (
      <AlertCircle className="h-3 w-3 text-destructive" />
    ) : (
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
    );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.04, duration: 0.15 }}
      className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
    >
      <div className="flex h-3 items-center justify-center">{dot}</div>
      <span
        className={cn(
          'text-2xs leading-none',
          node.status === 'pending' ? 'text-muted-foreground/50' : 'text-muted-foreground',
        )}
      >
        {stageLabel(node.stage)}
      </span>
    </motion.div>
  );
}

// Four experiential enrichment checkpoints shown once copy is received.
const CHECKPOINT_STEPS = [
  { key: 'concept' as const, label: 'Concept' },
  { key: 'copy' as const, label: 'Copy' },
  { key: 'preview' as const, label: 'Preview' },
  { key: 'realized' as const, label: 'Fully fleshed out' },
] as const;

type CheckpointStepKey = (typeof CHECKPOINT_STEPS)[number]['key'];

function checkpointStepStatus(
  key: CheckpointStepKey,
  cp: CheckpointState,
): 'done' | 'active' | 'awaiting' | 'generating' | 'ready' | 'user_supplied' | 'pending' {
  if (key === 'concept') return cp.textReady ? 'done' : 'active';
  if (key === 'copy') return cp.textReady ? 'done' : 'active';
  if (key === 'preview') {
    if (!cp.textReady) return 'pending';
    return cp.blueprintReady ? 'done' : 'active';
  }
  if (!cp.blueprintReady) return 'pending';
  if (cp.awaitingMediaChoice) return 'awaiting';
  if (cp.mediaStatus === 'generating') return 'generating';
  if (cp.mediaStatus === 'ready') return 'ready';
  if (cp.mediaStatus === 'user_supplied') return 'user_supplied';
  return 'pending';
}

function CheckpointStepNode({
  stepKey,
  label,
  checkpoint,
}: {
  stepKey: CheckpointStepKey;
  label: string;
  checkpoint: CheckpointState;
}) {
  const status = checkpointStepStatus(stepKey, checkpoint);

  const dot =
    status === 'done' ? (
      <Check className="h-3 w-3 text-emerald-500" />
    ) : status === 'active' || status === 'generating' ? (
      <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
    ) : status === 'awaiting' ? (
      <Clock className="h-3 w-3 text-muted-foreground" />
    ) : status === 'ready' || status === 'user_supplied' ? (
      <Sparkles className="h-3 w-3 text-emerald-500" />
    ) : (
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
    );

  const sublabel =
    status === 'awaiting'
      ? 'Awaiting your choice'
      : status === 'generating'
        ? 'Fleshing out…'
        : status === 'user_supplied'
          ? 'Your creative'
          : status === 'ready'
            ? 'Ready'
            : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <div className="flex h-4 items-center justify-center">{dot}</div>
      <span
        className={cn(
          'text-center text-2xs leading-none',
          status === 'pending' ? 'text-muted-foreground/40' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      {sublabel && (
        <span className="text-center text-3xs leading-none text-muted-foreground/70">
          {sublabel}
        </span>
      )}
    </div>
  );
}

function CheckpointStepper({ checkpoint }: { checkpoint: CheckpointState }) {
  return (
    <div className="grid gap-2 rounded-lg bg-muted/25 px-2.5 py-2">
      <div className="flex items-start gap-1">
        {CHECKPOINT_STEPS.map(({ key, label }) => (
          <CheckpointStepNode key={key} stepKey={key} label={label} checkpoint={checkpoint} />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1">
        {CHECKPOINT_STEPS.map(({ key }) => {
          const stepStatus = checkpointStepStatus(key, checkpoint);
          const active = stepStatus !== 'pending';
          return (
            <span
              key={key}
              className={cn(
                'h-0.5 rounded-full',
                active ? 'bg-brand-primary/70' : 'bg-muted-foreground/15',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

type PipelineCardProps = {
  card: PipelineCardState;
  /** Stage-2 "Enrich": sketch the blueprint for a text-ready draft. */
  onEnrichDraft?: (draftId: string) => void;
  /** Stage-3 "Generate media": realize a blueprint-ready draft (format-routed). */
  onGenerateMedia?: (draftId: string, format: string, previewRevision: string) => void;
};

export function PipelineCard({ card, onEnrichDraft, onGenerateMedia }: PipelineCardProps) {
  const quality = qualityPercent(card.quality?.overallScore);
  // ONE status presentation with the plan row: the resolver owns the vocabulary,
  // conceptStatus adds the `kind` that separates real progress from a run we have
  // lost sight of, and media failure from a job that died with nothing to show.
  const state: ConceptStatus = resolveConceptStatus({
    status: card.status,
    stage: card.currentStage ?? null,
    checkpoint: card.checkpoint ?? null,
  });

  // While a named stage is genuinely advancing, surface WHO is working + WHAT stage
  // ("Copywriter · Writing copy"), matching the generations widget. A blind run has
  // nobody to name, so it must not borrow that confident shape.
  const activeNode = card.stages.find((node) => node.status === 'active');
  const liveLabel =
    state.advancing && activeNode
      ? [resolveOrganicAgentLabel(activeNode.agentName), stageLabel(activeNode.stage)]
          .filter(Boolean)
          .join(' · ')
      : null;

  // A finished single-post pipeline persists a calendar draft; signal the calendar
  // to reconcile so it appears without a manual reload (debounced workspace-side).
  const requestCalendarRefetch = useCalendarStore((state) => state.requestCalendarRefetch);
  // Fall back to the persisted draft's storyboard (re-signed on calendar load) when
  // the live blueprint frame didn't populate card.preview — the expand job usually
  // finishes after the chat stream closes, so this is the reliable inline source.
  const realizedImages = useDraftRealizedImages(card.draftId);
  const draftStoryboard = useDraftStoryboard(card.draftId);
  const cardImages = resolveConceptPreviewUrls(card.preview);
  // Final realized media (re-signed on calendar load) wins over the live blueprint
  // preview and the storyboard concept, so the card upgrades to the finished image
  // after "Generate media"; before realize, the live blueprint frame wins over the
  // durable storyboard fallback.
  const usingRealized = realizedImages.length > 0;
  const previewImages = usingRealized
    ? realizedImages
    : cardImages.length > 0
      ? cardImages
      : draftStoryboard;

  // Only realized media may read its kind from the draft's format. A storyboard frame is a
  // still even for a reel, and calling it a video puts a PNG in a <video> tag.
  const previewMedia = useMemo(
    () =>
      mediaFromPreviewUrls(
        `preview:${card.jobId}`,
        previewImages,
        card.preview?.format,
        usingRealized ? 'realized' : 'storyboard',
      ),
    [card.jobId, previewImages, card.preview?.format, usingRealized],
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxItems: LightboxItem[] = useMemo(
    () =>
      previewMedia.map((item) => ({
        url: item.url,
        caption: item.caption ?? card.preview?.caption ?? '',
        isVideo: item.kind === 'video',
      })),
    [previewMedia, card.preview?.caption],
  );

  // Approve-through media actions, wired exactly like ConceptCard's: Enrich while
  // only text exists, Generate media once the blueprint landed. Neither shows once
  // media is final/user-supplied or already rendering.
  const draftId = card.draftId ?? null;
  const mediaStatus = card.checkpoint?.mediaStatus;
  const mediaSettled =
    mediaStatus === 'ready' || mediaStatus === 'user_supplied' || mediaStatus === 'generating';
  // Generate media needs the approval token: the realize path re-reads the draft's
  // stamped revision and rejects an absent or stale one, so a button without it would
  // only ever return preview_approval_required / preview_changed.
  const canApprovePreview = hasApprovablePreview(card.checkpoint);
  const showGenerateMedia = Boolean(
    onGenerateMedia &&
      draftId &&
      canApprovePreview &&
      card.checkpoint?.blueprintReady &&
      !mediaSettled,
  );
  // THE INVARIANT: an unsettled card must always offer something to click. Enrich
  // re-runs the blueprint expansion, which stamps a FRESH previewRevision — so it is
  // both the pre-blueprint action and the recovery when a blueprint landed without a
  // usable token (preview signing failed, or an older row hydrated stage-only). Without
  // this fallback the card renders "Awaiting media choice" and dies there.
  const showEnrich = Boolean(
    onEnrichDraft && draftId && card.checkpoint?.textReady && !mediaSettled && !showGenerateMedia,
  );
  const [mediaActionSent, setMediaActionSent] = useState(false);

  const reconciledRef = useRef(false);
  useEffect(() => {
    if (reconciledRef.current) return;
    if (card.status === 'completed' && card.draftId) {
      reconciledRef.current = true;
      requestCalendarRefetch();
    }
  }, [card.status, card.draftId, requestCalendarRefetch]);

  return (
    <AgentArtifactCard className="gap-[var(--card-gap)] p-[var(--card-pad)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {card.platform && <PlatformTag platform={card.platform} />}
          <MetaRow items={[card.preview?.format ?? undefined]} />
        </div>
        <StatusLabel
          detail={
            <StatusDetail
              agentName={activeNode?.agentName}
              checkpoint={card.checkpoint ?? null}
              diagnostic={state.diagnostic}
              error={card.error?.message ?? null}
              pct={card.pct ?? null}
              stageLabel={activeNode ? stageLabel(activeNode.stage) : state.label}
            />
          }
          title={state.diagnostic ?? undefined}
          tone={state.tone}
        >
          {liveLabel ?? state.label}
          {quality != null ? ` · ${quality}%` : ''}
        </StatusLabel>
      </div>

      {card.checkpoint ? (
        <CheckpointStepper checkpoint={card.checkpoint} />
      ) : (
        <div className="flex items-start gap-1">
          {card.stages.map((node, idx) => (
            <StageNode key={node.stage} node={node} index={idx} />
          ))}
        </div>
      )}

      {/* Healthy progress animates. A run with no stage frames keeps the bar's space
          but shows an EMPTY track — no invented percentage, no pulse. */}
      {state.advancing ? (
        <Progress
          value={Math.max(5, Math.min(100, card.pct ?? 10))}
          className="h-1 bg-muted/70 [&_[data-slot=progress-indicator]]:bg-brand-primary [&_[data-slot=progress-indicator]]:transition-transform [&_[data-slot=progress-indicator]]:duration-500"
        />
      ) : state.kind === 'blind' ? (
        <div
          className="h-1 rounded-full bg-muted-foreground/15"
          title={state.diagnostic ?? undefined}
        />
      ) : null}

      <PreviewImages media={previewMedia} onOpen={setLightboxIndex} />

      {card.preview?.caption && (
        <p className="line-clamp-2 text-sm leading-relaxed text-foreground text-pretty">
          {card.preview.caption}
        </p>
      )}

      {state.kind === 'media_failed' && (
        <p className="flex items-start gap-1.5 text-sm text-destructive/85 text-pretty">
          <ImageOff aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>The copy is saved — only the media failed to render.</span>
        </p>
      )}

      {(state.kind === 'failed' || state.kind === 'media_failed') && card.error?.message && (
        <p className="line-clamp-2 text-sm text-destructive/80">{card.error.message}</p>
      )}

      {(showEnrich || showGenerateMedia) && draftId && (
        <div className="-mx-[var(--card-pad)] -mb-[var(--card-pad)] flex items-stretch border-t border-border/40">
          {showEnrich && (
            <button
              type="button"
              title={
                state.kind === 'media_failed'
                  ? 'Re-sketch the blueprint and try the media again'
                  : card.checkpoint?.blueprintReady
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
              {mediaActionSent
                ? 'Enriching…'
                : state.kind === 'media_failed'
                  ? 'Try media again'
                  : card.checkpoint?.blueprintReady
                    ? 'Rebuild preview'
                    : 'Enrich'}
            </button>
          )}
          {showGenerateMedia && (
            <button
              type="button"
              title="Render the final media from the approved blueprint"
              disabled={mediaActionSent}
              onClick={() => {
                setMediaActionSent(true);
                if (card.checkpoint?.previewRevision) {
                  onGenerateMedia?.(
                    draftId,
                    card.preview?.format ?? '',
                    card.checkpoint.previewRevision,
                  );
                }
              }}
              className="flex flex-1 items-center justify-center gap-1 py-2.5 text-2xs text-muted-foreground transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-40"
            >
              <Wand2 className="h-3 w-3" />
              {mediaActionSent ? 'Generating…' : 'Generate media'}
            </button>
          )}
        </div>
      )}

      {lightboxItems.length > 0 && (
        <MediaLightbox
          index={lightboxIndex ?? 0}
          items={lightboxItems}
          onIndexChange={setLightboxIndex}
          onOpenChange={(open) => setLightboxIndex(open ? (lightboxIndex ?? 0) : null)}
          open={lightboxIndex !== null}
          title={card.preview?.format ?? 'Preview'}
        />
      )}
    </AgentArtifactCard>
  );
}
