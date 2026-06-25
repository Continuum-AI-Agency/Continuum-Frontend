import { describe, it, expect, beforeEach } from "bun:test";

import { useCalendarStore } from "./store";
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types";

const createDraft = (id: string): OrganicCalendarDraft => ({
  id,
  title: "Test Draft",
  summary: "Test Summary",
  timeLabel: "9:00 AM",
  dateLabel: "Mon, Jan 1",
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
      days: [
        { id: "day-1", label: "Monday", dateLabel: "Jan 1", suggestedTimes: [], slots: [] },
        { id: "day-2", label: "Tuesday", dateLabel: "Jan 2", suggestedTimes: [], slots: [] },
      ],
      gridStatus: "idle",
      gridProgress: { percent: 0 },
      gridError: null,
      ghosts: {},
      selectedDraftId: null,
      selectedDraftIds: [],
      pendingServerDeletes: [],
    });
  });

  it("adds a draft to a specific day", () => {
    const draft = createDraft("d1");
    useCalendarStore.getState().addDraft("day-1", draft);

    const state = useCalendarStore.getState();
    expect(state.days[0]?.slots).toHaveLength(1);
    expect(state.days[0]?.slots[0]?.id).toBe("d1");
  });

  it("moves a draft from day to day", () => {
    const draft = createDraft("d1");
    useCalendarStore.getState().addDraft("day-1", draft);

    useCalendarStore.getState().moveDraft("d1", "day-2");

    const state = useCalendarStore.getState();
    expect(state.days[0]?.slots).toHaveLength(0);
    expect(state.days[1]?.slots).toHaveLength(1);
    expect(state.days[1]?.slots[0]?.id).toBe("d1");
  });

  it("deletes multiple drafts", () => {
    const d1 = createDraft("d1");
    const d2 = createDraft("d2");
    useCalendarStore.getState().addDraft("day-1", d1);
    useCalendarStore.getState().addDraft("day-2", d2);

    useCalendarStore.getState().bulkDeleteDrafts(["d1", "d2"]);

    const state = useCalendarStore.getState();
    expect(state.days[0]?.slots).toHaveLength(0);
    expect(state.days[1]?.slots).toHaveLength(0);
  });

  it("queues backend ids for server deletion and clears them", () => {
    const d1: OrganicCalendarDraft = { ...createDraft("d1"), backendDraftId: "srv-1" };
    const d2 = createDraft("d2"); // no backendDraftId — local only, nothing to delete server-side
    useCalendarStore.getState().addDraft("day-1", d1);
    useCalendarStore.getState().addDraft("day-2", d2);

    useCalendarStore.getState().bulkDeleteDrafts(["d1", "d2"]);

    expect(useCalendarStore.getState().pendingServerDeletes).toEqual(["srv-1"]);

    useCalendarStore.getState().clearPendingServerDeletes(["srv-1"]);
    expect(useCalendarStore.getState().pendingServerDeletes).toEqual([]);
  });

  it("supports complete_with_errors grid status", () => {
    useCalendarStore.getState().setGridStatus("complete_with_errors");
    expect(useCalendarStore.getState().gridStatus).toBe("complete_with_errors");
  });

  it("clears the entire calendar", () => {
    const d1 = createDraft("d1");
    useCalendarStore.getState().addDraft("day-1", d1);
    useCalendarStore.getState().setGridStatus("complete");

    useCalendarStore.getState().clearCalendar();

    const state = useCalendarStore.getState();
    expect(state.days[0]?.slots).toHaveLength(0);
    expect(state.gridStatus).toBe("idle");
  });

  it("strips backendDraftId when duplicating a draft", () => {
    const draft: OrganicCalendarDraft = { ...createDraft("d1"), backendDraftId: "supabase-uuid-123" };
    useCalendarStore.getState().addDraft("day-1", draft);

    useCalendarStore.getState().duplicateDraft("d1");

    const state = useCalendarStore.getState();
    const slots = state.days[0]?.slots ?? [];
    const copy = slots.find((s) => s.id !== "d1");
    expect(copy).toBeDefined();
    expect(copy?.backendDraftId).toBeUndefined();
  });
});
