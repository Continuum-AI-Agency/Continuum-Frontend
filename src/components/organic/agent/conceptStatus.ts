import {
  ORGANIC_MEDIA_STAGE_LABELS,
  type OrganicGenerationStatus,
  type OrganicLifecyclePhase,
  type OrganicMediaStage,
  type OrganicStatusTone,
  type PipelineStage,
  resolveOrganicLifecycle,
} from '@continuum/contracts';
import type { CheckpointState, PipelineCardState, PlanItemStatus } from './types';

/**
 * The concept surfaces' PROJECTION of the one lifecycle vocabulary. Every word and
 * every tone comes from `resolveOrganicLifecycle` in the contracts; this file only
 * translates a phase into the two things these particular surfaces need and the
 * contract deliberately does not carry:
 *
 *  1. `kind` — a discriminator the plan row and the pipeline card branch on for
 *     layout (which button to offer, whether to animate).
 *  2. `tone` in `agentCardKit`'s own five-word palette, which predates the semantic
 *     tone set and is what `StatusLabel` speaks.
 *
 * It is NOT allowed to invent a label. When this file used to own its own words
 * ("Copy ready" here, "Enriching…" in the ticker, "Draft" in the planner) one row
 * read three different ways depending on where you looked at it.
 */
export type ConceptStatusKind =
  | 'concept'
  | 'queued'
  | 'working'
  | 'blind'
  | 'copy_ready'
  | 'preview_ready'
  | 'realizing'
  | 'realized'
  | 'media_failed'
  | 'failed'
  | 'cancelled';

/** The tones `agentCardKit`'s StatusLabel already speaks. */
export type ConceptStatusTone = 'neutral' | 'running' | 'waiting' | 'done' | 'failed';

export type ConceptStatus = {
  kind: ConceptStatusKind;
  /** What a person reads. Never a diagnostic. */
  label: string;
  tone: ConceptStatusTone;
  /** Engineer-facing detail for `title=`. Null when the label already says everything. */
  diagnostic: string | null;
  /** Work is genuinely advancing — the only case that earns an animated progress bar. */
  advancing: boolean;
};

/**
 * Collapse the checkpoint into the canonical media stage the resolver understands.
 * Exported so the pipeline card and the plan row derive it identically.
 */
export function mediaStageFromCheckpoint(
  checkpoint: CheckpointState | null | undefined,
): OrganicMediaStage | null {
  if (!checkpoint) return null;
  if (checkpoint.mediaStatus === 'failed') return 'failed';
  if (checkpoint.mediaStatus === 'ready' || checkpoint.mediaStatus === 'user_supplied')
    return 'realized';
  if (checkpoint.mediaStatus === 'generating') return 'realizing';
  if (checkpoint.blueprintReady) return 'storyboard_ready';
  if (checkpoint.textReady) return 'text_only';
  return null;
}

// Phase -> the layout discriminator these surfaces branch on. `draft_ready` is the
// one phase that splits, because how far the media ladder got decides which action
// the row offers next.
const PHASE_KIND: Record<Exclude<OrganicLifecyclePhase, 'draft_ready'>, ConceptStatusKind> = {
  concept: 'concept',
  seeded: 'concept',
  queued: 'queued',
  working: 'working',
  blind: 'blind',
  scheduled: 'copy_ready',
  published: 'realized',
  media_failed: 'media_failed',
  failed: 'failed',
  cancelled: 'cancelled',
};

const DRAFT_READY_KIND: Record<Exclude<OrganicMediaStage, 'failed'>, ConceptStatusKind> = {
  text_only: 'copy_ready',
  storyboard_ready: 'preview_ready',
  realizing: 'realizing',
  realized: 'realized',
};

type ConceptStatusInput = {
  status: OrganicGenerationStatus;
  stage?: PipelineStage | null;
  checkpoint?: CheckpointState | null;
};

export function resolveConceptStatus(input: ConceptStatusInput): ConceptStatus {
  const checkpoint = input.checkpoint ?? null;
  // A failure that already produced a blueprint is a MEDIA failure, not a dead job:
  // the words are saved and only the image is missing, so the row keeps the copy and
  // offers the media retry instead of greying out work the user still owns.
  const mediaStage: OrganicMediaStage | null =
    input.status === 'failed' && checkpoint?.blueprintReady
      ? 'failed'
      : mediaStageFromCheckpoint(checkpoint);

  const resolved = resolveOrganicLifecycle({
    status: input.status,
    stage: input.stage ?? null,
    mediaStage,
  });

  const kind: ConceptStatusKind =
    resolved.phase === 'draft_ready'
      ? mediaStage && mediaStage !== 'failed'
        ? DRAFT_READY_KIND[mediaStage]
        : 'copy_ready'
      : PHASE_KIND[resolved.phase];

  return {
    kind,
    label: resolved.label,
    tone: conceptTone(resolved.tone, resolved.advancing, mediaStage),
    diagnostic: resolved.diagnostic,
    advancing: resolved.advancing,
  };
}

// The semantic tone set -> agentCardKit's five words. `ready` splits on the media
// ladder for one honest reason: green ("done") would overstate a draft that stopped
// at its copy, and the amber it used to borrow claimed the job was still moving.
function conceptTone(
  tone: OrganicStatusTone,
  advancing: boolean,
  mediaStage: OrganicMediaStage | null,
): ConceptStatusTone {
  if (tone === 'error') return 'failed';
  if (tone === 'active' || advancing) return 'running';
  if (tone === 'ready' || tone === 'scheduled' || tone === 'live') {
    return mediaStage === 'realized' ? 'done' : 'waiting';
  }
  return 'neutral';
}

/**
 * The plan row's status, folding in the pre-dispatch case: an untouched plan item is
 * still a *concept*, not a generation, so the generation vocabulary must not describe it.
 */
export function resolvePlanItemStatus(input: {
  itemStatus: PlanItemStatus;
  pipeline?: PipelineCardState | null;
  /** The card dispatched locally and is waiting for its first frame. */
  dispatched?: boolean;
}): ConceptStatus {
  const { itemStatus, pipeline, dispatched } = input;
  const pipelineStatus = pipeline?.status;

  if (itemStatus === 'pending' && !pipeline && !dispatched) {
    return {
      kind: 'concept',
      label: 'Concept',
      tone: 'neutral',
      diagnostic: null,
      advancing: false,
    };
  }
  if (itemStatus === 'cancelled' && !pipeline) {
    return {
      kind: 'cancelled',
      label: 'Cancelled',
      tone: 'neutral',
      diagnostic: null,
      advancing: false,
    };
  }

  const status: OrganicGenerationStatus =
    itemStatus === 'failed' || pipelineStatus === 'failed'
      ? 'failed'
      : pipelineStatus === 'cancelled'
        ? 'cancelled'
        : itemStatus === 'completed' || pipelineStatus === 'completed'
          ? 'completed'
          : itemStatus === 'executing' || pipelineStatus === 'running'
            ? 'running'
            : dispatched
              ? 'queued'
              : 'running';

  return resolveConceptStatus({
    status,
    stage: pipeline?.currentStage ?? null,
    checkpoint: pipeline?.checkpoint ?? null,
  });
}
