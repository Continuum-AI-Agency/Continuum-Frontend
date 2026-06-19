import { beforeEach, describe, expect, it } from "bun:test";

import { useCalendarStore } from "@/lib/organic/store";
import type { OrganicCalendarDay } from "@/components/organic/primitives/types";
import { noteIfDraftLandedOffWindow } from "./useCalendarRealtimeSync";

const day = (id: string): OrganicCalendarDay => ({
  id,
  label: id,
  dateLabel: id,
  suggestedTimes: [],
  slots: [],
});

describe("noteIfDraftLandedOffWindow", () => {
  beforeEach(() => {
    useCalendarStore.setState({ days: [day("2026-06-15"), day("2026-06-21")], draftsElsewhere: 0 });
  });

  it("flags a brand-new draft scheduled outside the loaded week", () => {
    noteIfDraftLandedOffWindow({ eventType: "INSERT", new: { id: "draft-1", scheduled_date: "2026-07-01T12:00:00Z" } });
    expect(useCalendarStore.getState().draftsElsewhere).toBe(1);
    expect(useCalendarStore.getState().draftsElsewhereTarget).toEqual({
      draftId: "draft-1",
      scheduledDate: "2026-07-01",
    });
  });

  it("ignores a draft scheduled inside the loaded window", () => {
    noteIfDraftLandedOffWindow({ eventType: "INSERT", new: { scheduled_date: "2026-06-18T12:00:00Z" } });
    expect(useCalendarStore.getState().draftsElsewhere).toBe(0);
  });

  it("ignores UPDATEs so blueprint/media writes on an existing draft don't over-count", () => {
    noteIfDraftLandedOffWindow({ eventType: "UPDATE", new: { scheduled_date: "2026-07-01T12:00:00Z" } });
    expect(useCalendarStore.getState().draftsElsewhere).toBe(0);
  });

  it("ignores a deleted row and rows with no scheduled_date (backlog)", () => {
    noteIfDraftLandedOffWindow({ eventType: "INSERT", new: { scheduled_date: "2026-07-01T12:00:00Z", status: "deleted" } });
    noteIfDraftLandedOffWindow({ eventType: "INSERT", new: { scheduled_date: null } });
    expect(useCalendarStore.getState().draftsElsewhere).toBe(0);
  });
});
