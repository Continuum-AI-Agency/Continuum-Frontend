import { expect, test, beforeEach } from "bun:test";
import { useCalendarStore } from "@/lib/organic/store";
import { OrganicCalendarDay, OrganicCalendarDraft } from "@/components/organic/primitives/types";

const mockDrafts: OrganicCalendarDraft[] = [
  {
    id: "draft-1",
    title: "Draft 1",
    summary: "Summary 1",
    timeLabel: "9:00 AM",
    dateLabel: "Monday",
    status: "draft",
    platforms: ["instagram"],
    format: "Post",
    objective: "Retention",
    captionPreview: "Caption 1",
    tags: [],
    mediaCount: 1,
  },
  {
    id: "draft-2",
    title: "Draft 2",
    summary: "Summary 2",
    timeLabel: "10:00 AM",
    dateLabel: "Monday",
    status: "draft",
    platforms: ["instagram"],
    format: "Post",
    objective: "Retention",
    captionPreview: "Caption 2",
    tags: [],
    mediaCount: 1,
  },
];

const mockDays: OrganicCalendarDay[] = [
  {
    id: "day-1",
    label: "Monday",
    dateLabel: "Jan 1",
    suggestedTimes: ["9:00 AM"],
    slots: [mockDrafts[0]],
  },
  {
    id: "day-2",
    label: "Tuesday",
    dateLabel: "Jan 2",
    suggestedTimes: ["9:00 AM"],
    slots: [mockDrafts[1]],
  },
];

beforeEach(() => {
  useCalendarStore.getState().setDays(mockDays);
  useCalendarStore.getState().setUnscheduledDrafts([]);
});

test("bulkMoveDrafts moves multiple drafts to a target day", () => {
  const store = useCalendarStore.getState();
  
  store.bulkMoveDrafts(["draft-1", "draft-2"], "day-2");
  
  const updatedDays = useCalendarStore.getState().days;
  const day1 = updatedDays.find(d => d.id === "day-1")!;
  const day2 = updatedDays.find(d => d.id === "day-2")!;
  
  expect(day1.slots.length).toBe(0);
  expect(day2.slots.length).toBe(2);
  expect(day2.slots.map(s => s.id)).toContain("draft-1");
  expect(day2.slots.map(s => s.id)).toContain("draft-2");
});

test("bulkDeleteDrafts removes multiple drafts", () => {
  const store = useCalendarStore.getState();
  
  store.bulkDeleteDrafts(["draft-1", "draft-2"]);
  
  const updatedDays = useCalendarStore.getState().days;
  expect(updatedDays.every(d => d.slots.length === 0)).toBe(true);
});

test("bulkMoveDrafts to unscheduled", () => {
  const store = useCalendarStore.getState();
  
  store.bulkMoveDrafts(["draft-1"], "unscheduled");
  
  const state = useCalendarStore.getState();
  expect(state.days.find(d => d.id === "day-1")!.slots.length).toBe(0);
  expect(state.unscheduledDrafts.length).toBe(1);
  expect(state.unscheduledDrafts[0].id).toBe("draft-1");
});
