import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCalendarStore } from '@/lib/organic/store';
import { useDraftDeletionConfirmation } from '../primitives/DraftDeletionConfirmation';
import type { OrganicCalendarDay } from '../primitives/types';

type UseCalendarSelectionOptions = {
  /**
   * Called whenever the user dismisses the preview (close, collapse, Escape). The URL
   * writer lives at the call site rather than in here so the hook stays a pure selection
   * machine — `?draftId=` has to be stripped, or the workspace's deep-link watcher
   * re-selects the draft on the very next render.
   */
  onDismiss?: () => void;
};

export function useCalendarSelection(
  days: OrganicCalendarDay[] = [],
  { onDismiss }: UseCalendarSelectionOptions = {},
) {
  const { requestDraftDeletion } = useDraftDeletionConfirmation();
  const {
    selectedDraftId,
    setSelectedDraftId,
    selectedDraftIds,
    toggleDraftSelection,
    clearDraftSelection,
    bulkDeleteDrafts,
    setEditingDraftId,
  } = useCalendarStore(
    useShallow((state) => ({
      selectedDraftId: state.selectedDraftId,
      setSelectedDraftId: state.setSelectedDraftId,
      selectedDraftIds: state.selectedDraftIds,
      toggleDraftSelection: state.toggleDraftSelection,
      clearDraftSelection: state.clearDraftSelection,
      bulkDeleteDrafts: state.bulkDeleteDrafts,
      setEditingDraftId: state.setEditingDraftId,
    })),
  );

  const orderedDraftIds = React.useMemo(
    () => days.flatMap((day) => day.slots.map((slot) => slot.id)),
    [days],
  );

  const orderedDraftIndexById = React.useMemo(() => {
    const indexById = new Map<string, number>();
    orderedDraftIds.forEach((id, index) => {
      indexById.set(id, index);
    });
    return indexById;
  }, [orderedDraftIds]);

  // Collapsing is a distinct operation from clearing: the draft stays selected
  // (so the preview can be re-opened without hunting for the row again) while the
  // panel renders at zero width.
  const [isPreviewCollapsed, setIsPreviewCollapsed] = React.useState(false);

  // EVERY draft the user has dismissed from the preview panel, not just the last one.
  // Two effects in the workspace re-select a draft automatically — the `?draftId=` deep
  // link and the last-draft restore — and both fire the instant a selection is nulled.
  // With a single slot, dismissing draft B forgot that A was dismissed, so the deep-link
  // watcher re-selected A and the panel could never be closed at all.
  const [dismissedDraftIds, setDismissedDraftIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const rememberDismissal = React.useCallback((draftId: string | null) => {
    if (!draftId) return;
    setDismissedDraftIds((previous) => {
      if (previous.has(draftId)) return previous;
      const next = new Set(previous);
      next.add(draftId);
      return next;
    });
  }, []);

  const rearmDraft = React.useCallback((draftId: string | null) => {
    if (!draftId) return;
    setDismissedDraftIds((previous) => {
      if (!previous.has(draftId)) return previous;
      const next = new Set(previous);
      next.delete(draftId);
      return next;
    });
  }, []);

  const handleSelect = React.useCallback(
    (id: string, isMulti: boolean = false) => {
      if (isMulti) {
        toggleDraftSelection(id);
        return;
      }
      setSelectedDraftId(id);
      clearDraftSelection();
      setIsPreviewCollapsed(false);
      rearmDraft(id);
    },
    [toggleDraftSelection, setSelectedDraftId, clearDraftSelection, rearmDraft],
  );

  // Dismissing the panel abandons the edit intent too. Without this, the workspace's
  // expand-on-edit effect would re-open the panel the instant it was collapsed.
  const clearAll = React.useCallback(() => {
    rememberDismissal(selectedDraftId);
    setSelectedDraftId(null);
    setEditingDraftId(null);
    clearDraftSelection();
    setIsPreviewCollapsed(false);
    onDismiss?.();
  }, [
    clearDraftSelection,
    onDismiss,
    rememberDismissal,
    selectedDraftId,
    setEditingDraftId,
    setSelectedDraftId,
  ]);

  const collapsePreview = React.useCallback(() => {
    rememberDismissal(selectedDraftId);
    setEditingDraftId(null);
    setIsPreviewCollapsed(true);
    onDismiss?.();
  }, [onDismiss, rememberDismissal, selectedDraftId, setEditingDraftId]);

  // Re-arms only the draft being re-opened. Clearing the whole set here is what let the
  // loop start over: expanding one preview un-suppressed every draft ever dismissed.
  const expandPreview = React.useCallback(() => {
    rearmDraft(selectedDraftId);
    setIsPreviewCollapsed(false);
  }, [rearmDraft, selectedDraftId]);

  const isAutoSelectSuppressed = React.useCallback(
    (candidateDraftId: string | null | undefined) =>
      candidateDraftId != null && dismissedDraftIds.has(candidateDraftId),
    [dismissedDraftIds],
  );

  const handleDelete = React.useCallback(() => {
    const idsToDelete = selectedDraftId ? [selectedDraftId] : selectedDraftIds;
    if (idsToDelete.length > 0) {
      requestDraftDeletion(idsToDelete, (ids) => {
        bulkDeleteDrafts(ids);
        clearAll();
      });
    }
  }, [selectedDraftId, selectedDraftIds, bulkDeleteDrafts, clearAll, requestDraftDeletion]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDelete();
        e.preventDefault();
        return;
      }

      // Escape closes the preview regardless of where the draft sits. Resolving it
      // through the ordered index first left Escape dead for any draft outside the
      // visible range — which is precisely the deep-linked draft the agent opens.
      if (e.key === 'Escape') {
        clearAll();
        return;
      }

      if (!selectedDraftId && selectedDraftIds.length === 0) return;

      const currentId = selectedDraftId || selectedDraftIds[selectedDraftIds.length - 1];
      const currentIndex = orderedDraftIndexById.get(currentId) ?? -1;

      if (currentIndex === -1) return;

      if (e.key === 'ArrowDown') {
        const nextId = orderedDraftIds[currentIndex + 1];
        if (nextId) {
          handleSelect(nextId, e.shiftKey);
          e.preventDefault();
        }
      } else if (e.key === 'ArrowUp') {
        const prevId = orderedDraftIds[currentIndex - 1];
        if (prevId) {
          handleSelect(prevId, e.shiftKey);
          e.preventDefault();
        }
      }
    },
    [
      clearAll,
      handleDelete,
      handleSelect,
      orderedDraftIds,
      orderedDraftIndexById,
      selectedDraftId,
      selectedDraftIds,
    ],
  );

  return {
    selectedId: selectedDraftId,
    selectedIds: selectedDraftIds,
    handleSelect,
    clearAll,
    toggleMulti: toggleDraftSelection,
    handleKeyDown,
    isPreviewCollapsed,
    collapsePreview,
    expandPreview,
    isAutoSelectSuppressed,
  };
}
