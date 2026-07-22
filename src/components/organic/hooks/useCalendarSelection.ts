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
  } = useCalendarStore(
    useShallow((state) => ({
      selectedDraftId: state.selectedDraftId,
      setSelectedDraftId: state.setSelectedDraftId,
      selectedDraftIds: state.selectedDraftIds,
      toggleDraftSelection: state.toggleDraftSelection,
      clearDraftSelection: state.clearDraftSelection,
      bulkDeleteDrafts: state.bulkDeleteDrafts,
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

  const handleSelect = React.useCallback(
    (id: string, isMulti: boolean = false) => {
      if (isMulti) {
        toggleDraftSelection(id);
      } else {
        setSelectedDraftId(id);
        clearDraftSelection();
      }
    },
    [toggleDraftSelection, setSelectedDraftId, clearDraftSelection],
  );

  const clearAll = React.useCallback(() => {
    setSelectedDraftId(null);
    clearDraftSelection();
  }, [setSelectedDraftId, clearDraftSelection]);

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
      } else if (e.key === 'Escape') {
        clearAll();
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
  };
}
