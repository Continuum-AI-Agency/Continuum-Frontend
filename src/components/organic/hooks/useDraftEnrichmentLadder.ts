'use client';

import * as React from 'react';

import { useToast } from '@/components/ui/ToastProvider';
import {
  DraftEnrichmentConflictError,
  enqueueBlueprintExpansion,
  enqueueCopyGeneration,
} from '@/lib/organic/draftEnrichment';
import { useCalendarStore } from '@/lib/organic/store';
import { resolveDraftMediaStage } from '../primitives/DraftLifecycle';
import type { OrganicCalendarDraft } from '../primitives/types';

export type LadderStepId = 'copy' | 'blueprint' | 'media';

/**
 * `current` is the one step that offers a Build action. `running` is work already in
 * flight. `locked` is a step whose prerequisite has not landed yet.
 */
export type LadderStepState = 'done' | 'running' | 'current' | 'locked' | 'failed';

export type LadderStep = {
  id: LadderStepId;
  label: string;
  state: LadderStepState;
};

export type DraftLadder = {
  steps: LadderStep[];
  activeStep: LadderStepId | null;
  actionLabel: string | null;
  run: () => void;
  /** Copy already landed and can be rewritten (destructively) before media is realized. */
  canRewriteCopy: boolean;
  rewriteCopy: () => void;
  isBusy: boolean;
  /** Non-null when the active step exists but cannot run yet. Render it on the button. */
  disabledReason: string | null;
  isComplete: boolean;
};

const STEP_LABELS: Record<LadderStepId, string> = {
  copy: 'Copy',
  blueprint: 'Blueprint',
  media: 'Media',
};

const ACTION_LABELS: Record<LadderStepId, string> = {
  copy: 'Generate copy',
  blueprint: 'Build blueprint',
  media: 'Realize media',
};

type LadderOptions = {
  brandProfileId?: string;
  /** Stage 3 already exists (useGenerateDraftMedia / the library picker); the ladder delegates. */
  onMediaStep: () => void;
};

/**
 * Derive the three-step enrichment ladder for one draft, and dispatch the step the
 * user can act on.
 *
 * Stage 1 (copy) auto-enqueues stage 2 (blueprint) on the Backend, so Blueprint
 * normally advances on its own; its Build action is the recovery path for a draft the
 * auto-enqueue left stranded at text_only.
 */
export function useDraftEnrichmentLadder(
  draft: OrganicCalendarDraft,
  { brandProfileId, onMediaStep }: LadderOptions,
): DraftLadder {
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  const { show } = useToast();
  const [isBusy, setIsBusy] = React.useState(false);

  const mediaStage = resolveDraftMediaStage(draft);
  const hasCopy = draft.hasCopy === true;
  const isStreaming = draft.status === 'streaming';
  const blueprintLanded =
    mediaStage === 'storyboard_ready' || mediaStage === 'realizing' || mediaStage === 'realized';

  const steps = React.useMemo<LadderStep[]>(() => {
    const copyState: LadderStepState = hasCopy
      ? 'done'
      : isStreaming
        ? 'running'
        : draft.status === 'failed'
          ? 'failed'
          : 'current';

    const blueprintState: LadderStepState = blueprintLanded
      ? 'done'
      : !hasCopy
        ? 'locked'
        : isStreaming
          ? 'running'
          : mediaStage === 'failed'
            ? 'failed'
            : 'current';

    const mediaState: LadderStepState =
      mediaStage === 'realized'
        ? 'done'
        : mediaStage === 'realizing'
          ? 'running'
          : mediaStage === 'failed'
            ? 'failed'
            : mediaStage === 'storyboard_ready'
              ? 'current'
              : 'locked';

    return [
      { id: 'copy', label: STEP_LABELS.copy, state: copyState },
      { id: 'blueprint', label: STEP_LABELS.blueprint, state: blueprintState },
      { id: 'media', label: STEP_LABELS.media, state: mediaState },
    ];
  }, [blueprintLanded, draft.status, hasCopy, isStreaming, mediaStage]);

  const activeStep =
    steps.find((step) => step.state === 'current' || step.state === 'failed')?.id ?? null;

  const isComplete = mediaStage === 'realized';

  // A brand-new "+" draft has no backendDraftId until the 500ms debounced autosave
  // writes one back. Gate the enqueue rather than awaiting the persist, which never
  // resolves for a draft the autosave does not own.
  const needsBackendDraft = activeStep === 'copy' || activeStep === 'blueprint';
  const disabledReason =
    activeStep === null
      ? null
      : needsBackendDraft && !draft.backendDraftId
        ? 'Saving…'
        : !brandProfileId
          ? 'No brand selected'
          : null;

  const runLadderRequest = React.useCallback(
    async (step: 'copy' | 'blueprint', regenerate: boolean) => {
      if (!brandProfileId || !draft.backendDraftId) return;
      setIsBusy(true);
      try {
        const request = regenerate
          ? { brandId: brandProfileId, regenerate: true }
          : { brandId: brandProfileId };
        if (step === 'copy') {
          await enqueueCopyGeneration(draft.backendDraftId, request);
        } else {
          await enqueueBlueprintExpansion(draft.backendDraftId, request);
        }
        // Optimistic: the row's real transition arrives over Realtime, which bumps the
        // calendar's refetch nonce.
        updateDraft(draft.id, (current) => ({
          ...current,
          status: 'streaming',
          generationError: undefined,
          generationStage: step === 'copy' ? 'Generating copy…' : 'Building blueprint…',
        }));
      } catch (error) {
        const description =
          error instanceof DraftEnrichmentConflictError || error instanceof Error
            ? error.message
            : 'Please try again.';
        show({
          title: `Could not ${ACTION_LABELS[step].toLowerCase()}`,
          description,
          variant: 'error',
        });
      } finally {
        setIsBusy(false);
      }
    },
    [brandProfileId, draft.backendDraftId, draft.id, show, updateDraft],
  );

  const run = React.useCallback(() => {
    if (!activeStep || isBusy || disabledReason) return;
    if (activeStep === 'media') {
      onMediaStep();
      return;
    }
    void runLadderRequest(activeStep, false);
  }, [activeStep, disabledReason, isBusy, onMediaStep, runLadderRequest]);

  // Rewriting under realized pixels would strand them against a new concept, so the
  // Backend 409s there and the affordance is withheld.
  const canRewriteCopy =
    hasCopy && !isStreaming && mediaStage !== 'realizing' && mediaStage !== 'realized';

  const rewriteCopy = React.useCallback(() => {
    if (!canRewriteCopy || isBusy || !draft.backendDraftId) return;
    void runLadderRequest('copy', true);
  }, [canRewriteCopy, draft.backendDraftId, isBusy, runLadderRequest]);

  return {
    steps,
    activeStep,
    actionLabel: activeStep ? ACTION_LABELS[activeStep] : null,
    run,
    canRewriteCopy,
    rewriteCopy,
    isBusy,
    disabledReason,
    isComplete,
  };
}
