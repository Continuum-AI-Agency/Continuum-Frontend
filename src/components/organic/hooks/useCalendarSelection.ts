import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCalendarStore } from '@/lib/organic/store';
import { useDraftDeletionConfirmation } from '../primitives/DraftDeletionConfirmation';
import type { OrganicCalendarDay } from '../primitives/types';

export function useCalendarSelection(days: OrganicCalendarDay[] = []) {
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

  // The draft the user last dismissed from the preview panel. Two effects in the
  // workspace re-select a draft automatically — the `?draftId=` deep link and the
  // last-draft restore — and both fire the instant a selection is nulled, which
  // made close, collapse and Escape all read as dead buttons whenever the URL
  // carried a draftId. Those effects consult this before re-selecting.
  const [dismissedDraftId, setDismissedDraftId] = React.useState<string | null>(null);

  const handleSelect = React.useCallback(
    (id: string, isMulti: boolean = false) => {
      if (isMulti) {
        toggleDraftSelection(id);
        return;
      }
      setSelectedDraftId(id);
      clearDraftSelection();
      setIsPreviewCollapsed(false);
      setDismissedDraftId(null);
    },
    [toggleDraftSelection, setSelectedDraftId, clearDraftSelection],
  );

  // Dismissing the panel abandons the edit intent too. Without this, the workspace's
  // expand-on-edit effect would re-open the panel the instant it was collapsed.
  const clearAll = React.useCallback(() => {
    setDismissedDraftId(selectedDraftId);
    setSelectedDraftId(null);
    setEditingDraftId(null);
    clearDraftSelection();
    setIsPreviewCollapsed(false);
  }, [selectedDraftId, setSelectedDraftId, setEditingDraftId, clearDraftSelection]);

  const collapsePreview = React.useCallback(() => {
    setDismissedDraftId(selectedDraftId);
    setEditingDraftId(null);
    setIsPreviewCollapsed(true);
  }, [selectedDraftId, setEditingDraftId]);

  const expandPreview = React.useCallback(() => {
    setDismissedDraftId(null);
    setIsPreviewCollapsed(false);
  }, []);

  const isAutoSelectSuppressed = React.useCallback(
    (candidateDraftId: string | null | undefined) =>
      candidateDraftId != null && candidateDraftId === dismissedDraftId,
    [dismissedDraftId],
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
