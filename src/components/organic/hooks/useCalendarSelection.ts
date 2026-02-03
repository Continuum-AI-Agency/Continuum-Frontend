import * as React from "react";
import { useCalendarStore } from "@/lib/organic/store";
import type { OrganicCalendarDay, OrganicCalendarDraft } from "../primitives/types";

export function useCalendarSelection(
  days: OrganicCalendarDay[] = [],
  unscheduledDrafts: OrganicCalendarDraft[] = []
) {
  const {
    selectedDraftId,
    setSelectedDraftId,
    selectedDraftIds,
    toggleDraftSelection,
    clearDraftSelection,
    bulkDeleteDrafts,
  } = useCalendarStore();

  const handleSelect = React.useCallback(
    (id: string, isMulti: boolean = false) => {
      if (isMulti) {
        toggleDraftSelection(id);
      } else {
        setSelectedDraftId(id);
        clearDraftSelection();
      }
    },
    [toggleDraftSelection, setSelectedDraftId, clearDraftSelection]
  );

  const clearAll = React.useCallback(() => {
    setSelectedDraftId(null);
    clearDraftSelection();
  }, [setSelectedDraftId, clearDraftSelection]);

  const handleDelete = React.useCallback(() => {
    const idsToDelete = selectedDraftId ? [selectedDraftId] : selectedDraftIds;
    if (idsToDelete.length > 0) {
      bulkDeleteDrafts(idsToDelete);
      clearAll();
    }
  }, [selectedDraftId, selectedDraftIds, bulkDeleteDrafts, clearAll]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        handleDelete();
        e.preventDefault();
        return;
      }

      if (!selectedDraftId && selectedDraftIds.length === 0) return;

      const currentId = selectedDraftId || selectedDraftIds[selectedDraftIds.length - 1];
      let flatSlots: string[] = [];
      let currentIndex = -1;

      days.forEach((day) => {
        day.slots.forEach((slot) => {
          flatSlots.push(slot.id);
          if (slot.id === currentId) currentIndex = flatSlots.length - 1;
        });
      });

      unscheduledDrafts.forEach((slot) => {
        flatSlots.push(slot.id);
        if (slot.id === currentId) currentIndex = flatSlots.length - 1;
      });

      if (currentIndex === -1) return;

      if (e.key === "ArrowDown") {
        const nextId = flatSlots[currentIndex + 1];
        if (nextId) {
          handleSelect(nextId, e.shiftKey);
          e.preventDefault();
        }
      } else if (e.key === "ArrowUp") {
        const prevId = flatSlots[currentIndex - 1];
        if (prevId) {
          handleSelect(prevId, e.shiftKey);
          e.preventDefault();
        }
      } else if (e.key === "Escape") {
        clearAll();
      }
    },
    [days, unscheduledDrafts, selectedDraftId, selectedDraftIds, handleSelect, clearAll, handleDelete]
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
