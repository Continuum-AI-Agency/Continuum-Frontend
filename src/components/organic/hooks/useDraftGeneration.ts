import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '@/components/ui/ToastProvider';
import { enqueueCopyGeneration } from '@/lib/organic/draftEnrichment';
import { useCalendarStore } from '@/lib/organic/store';
import type { OrganicCalendarDraft } from '../primitives/types';

/**
 * Per-draft generation actions for the calendar card.
 *
 * The whole-week batch run this hook used to own is gone: generation is now something
 * you do to ONE draft, through the enrichment ladder (see useDraftEnrichmentLadder).
 * What remains are the two card-level actions — retry a draft's copy, and clear a
 * failed draft back to a placeholder.
 */
export function useDraftGeneration({
  brandProfileId,
  drafts,
}: {
  brandProfileId?: string;
  drafts: OrganicCalendarDraft[];
}) {
  const {
    gridStatus,
    setGridError,
    updateDraft: updateDraftById,
  } = useCalendarStore(
    useShallow((state) => ({
      gridStatus: state.gridStatus,
      setGridError: state.setGridError,
      updateDraft: state.updateDraft,
    })),
  );

  const { show: showToast } = useToast();

  // Regenerate rewrites this draft's copy in place, through the ladder's Copy stage.
  // The Backend clears the text checkpoint first, so the worker genuinely regenerates
  // rather than resuming past text generation. Unlike the old batch path, this works
  // for ANY persisted draft, not only trend-seeded ones.
  const handleRegenerate = React.useCallback(
    async (draftId: string) => {
      const draft = drafts.find((item) => item.id === draftId);
      if (!draft) return;

      if (!brandProfileId) {
        setGridError('Missing brand context. Please reconnect your brand profile.');
        return;
      }
      // The autosave assigns backendDraftId within ~500ms of creation.
      if (!draft.backendDraftId) {
        setGridError('This draft is still saving. Try again in a moment.');
        return;
      }

      updateDraftById(draftId, (current) => ({
        ...current,
        status: 'streaming',
        generationError: undefined,
        generationStage: 'Regenerating copy…',
        generationAttempts: (current.generationAttempts ?? 0) + 1,
      }));

      try {
        await enqueueCopyGeneration(draft.backendDraftId, {
          brandId: brandProfileId,
          regenerate: true,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Regeneration failed. Retry or clear this slot.';
        updateDraftById(draftId, (current) => ({
          ...current,
          status: 'failed',
          generationError: message,
        }));
        showToast({ title: 'Could not regenerate', description: message, variant: 'error' });
      }
    },
    [brandProfileId, drafts, setGridError, showToast, updateDraftById],
  );

  const handleClearFailure = React.useCallback(
    (draftId: string) => {
      updateDraftById(draftId, (draft) => ({
        ...draft,
        status: 'placeholder',
        generationError: undefined,
      }));
    },
    [updateDraftById],
  );

  return {
    gridStatus,
    handleRegenerate,
    handleClearFailure,
  };
}
