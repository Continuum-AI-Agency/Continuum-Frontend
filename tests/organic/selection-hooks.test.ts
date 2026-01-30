import { expect, test, beforeEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useCalendarSelection } from "@/components/organic/hooks/useCalendarSelection";
import { useCalendarStore } from "@/lib/organic/store";

beforeEach(() => {
  useCalendarStore.getState().setSelectedDraftId(null);
  useCalendarStore.getState().clearDraftSelection();
});

test("useCalendarSelection single select", () => {
  const { result } = renderHook(() => useCalendarSelection());
  
  act(() => {
    result.current.handleSelect("draft-1", false);
  });
  
  expect(result.current.selectedId).toBe("draft-1");
  expect(result.current.selectedIds).toHaveLength(0);
});

test("useCalendarSelection multi select", () => {
  const { result } = renderHook(() => useCalendarSelection());
  
  act(() => {
    result.current.handleSelect("draft-1", true);
  });
  
  expect(result.current.selectedIds).toContain("draft-1");
  
  act(() => {
    result.current.handleSelect("draft-2", true);
  });
  
  expect(result.current.selectedIds).toContain("draft-1");
  expect(result.current.selectedIds).toContain("draft-2");
});

test("useCalendarSelection clear all", () => {
  const { result } = renderHook(() => useCalendarSelection());
  
  act(() => {
    result.current.handleSelect("draft-1", false);
    result.current.handleSelect("draft-2", true);
  });
  
  act(() => {
    result.current.clearAll();
  });
  
  expect(result.current.selectedId).toBeNull();
  expect(result.current.selectedIds).toHaveLength(0);
});
