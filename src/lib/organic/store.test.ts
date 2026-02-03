import { describe, it, expect, beforeEach } from "vitest";
import { useCalendarStore } from "./store";
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types";

const createDraft = (id: string): OrganicCalendarDraft => ({
  id,
  title: "Test Draft",
  summary: "Test Summary",
  timeLabel: "9:00 AM",
  dateLabel: "Today",
  status: "draft",
  platforms: ["instagram"],
  format: "Post",
  objective: "Test",
  captionPreview: "Test Caption",
  tags: [],
  mediaCount: 1,
});

describe("useCalendarStore", () => {
  beforeEach(() => {
    useCalendarStore.setState({
      days: [{ id: "day-1", label: "Monday", dateLabel: "Jan 1", suggestedTimes: [], slots: [] }],
      unscheduledDrafts: [],
      gridStatus: "idle",
      gridProgress: { percent: 0 },
      gridError: null,
      ghosts: {},
      selectedDraftId: null,
      selectedDraftIds: [],
    });
  });

  it("adds a draft to a specific day", () => {
    const draft = createDraft("d1");
    useCalendarStore.getState().addDraft("day-1", draft);
    
    const state = useCalendarStore.getState();
    expect(state.days[0].slots).toHaveLength(1);
    expect(state.days[0].slots[0].id).toBe("d1");
  });

  it("adds a draft to unscheduled pool", () => {
    const draft = createDraft("d2");
    useCalendarStore.getState().addDraft("unscheduled", draft);
    
    const state = useCalendarStore.getState();
    expect(state.unscheduledDrafts).toHaveLength(1);
    expect(state.unscheduledDrafts[0].id).toBe("d2");
  });

  it("moves a draft from day to day", () => {
    const draft = createDraft("d1");
    useCalendarStore.setState((state) => ({
      days: [...state.days, { id: "day-2", label: "Tuesday", dateLabel: "Jan 2", suggestedTimes: [], slots: [] }],
    }));
    useCalendarStore.getState().addDraft("day-1", draft);
    
    useCalendarStore.getState().moveDraft("d1", "day-2");
    
    const state = useCalendarStore.getState();
    expect(state.days[0].slots).toHaveLength(0);
    expect(state.days[1].slots).toHaveLength(1);
    expect(state.days[1].slots[0].id).toBe("d1");
  });

  it("moves a draft from day to unscheduled", () => {
    const draft = createDraft("d1");
    useCalendarStore.getState().addDraft("day-1", draft);
    
    useCalendarStore.getState().moveDraft("d1", "unscheduled");
    
    const state = useCalendarStore.getState();
    expect(state.days[0].slots).toHaveLength(0);
    expect(state.unscheduledDrafts).toHaveLength(1);
    expect(state.unscheduledDrafts[0].id).toBe("d1");
  });

  it("deletes multiple drafts", () => {
    const d1 = createDraft("d1");
    const d2 = createDraft("d2");
    useCalendarStore.getState().addDraft("day-1", d1);
    useCalendarStore.getState().addDraft("unscheduled", d2);
    
    useCalendarStore.getState().bulkDeleteDrafts(["d1", "d2"]);
    
    const state = useCalendarStore.getState();
    expect(state.days[0].slots).toHaveLength(0);
    expect(state.unscheduledDrafts).toHaveLength(0);
  });

  it("clears the entire calendar", () => {
    const d1 = createDraft("d1");
    useCalendarStore.getState().addDraft("day-1", d1);
    useCalendarStore.getState().setGridStatus("complete");
    
    useCalendarStore.getState().clearCalendar();
    
    const state = useCalendarStore.getState();
    expect(state.days[0].slots).toHaveLength(0);
    expect(state.unscheduledDrafts).toHaveLength(0);
    expect(state.gridStatus).toBe("idle");
  });
});
