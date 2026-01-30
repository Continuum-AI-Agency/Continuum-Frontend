import * as React from "react";
import { useCalendarStore } from "@/lib/organic/store";
import type { OrganicCalendarDay } from "../primitives/types";

export function useCalendarSelection(days: OrganicCalendarDay[] = []) {
  const {
    selectedDraftId,
    setSelectedDraftId,
    selectedDraftIds,
    toggleDraftSelection,
    clearDraftSelection,
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

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
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
    [days, selectedDraftId, selectedDraftIds, handleSelect, clearAll]
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
