import { expect, test } from "bun:test";

import {
  buildScheduledAt,
  buildWeekDays,
  formatDayId,
  moveDraftToDay,
  startOfWeek,
} from "@/components/organic/primitives/calendar-utils";
import type { OrganicCalendarDay } from "@/components/organic/primitives/types";

test("moveDraftToDay moves a draft into the target day", () => {
  const days: OrganicCalendarDay[] = [
    {
      id: "2026-01-01",
      label: "Thu",
      dateLabel: "Jan 1",
      suggestedTimes: ["9:00 AM"],
      slots: [
        {
          id: "draft-1",
          title: "Draft",
          summary: "Summary",
          timeLabel: "9:00 AM",
          dateLabel: "Thu, Jan 1",
          status: "draft",
          platforms: ["instagram"],
          format: "Reel",
          objective: "Awareness",
          captionPreview: "Caption",
          tags: [],
          mediaCount: 1,
        },
      ],
    },
    {
      id: "2026-01-02",
      label: "Fri",
      dateLabel: "Jan 2",
      suggestedTimes: ["11:00 AM"],
      slots: [],
    },
  ];

  const next = moveDraftToDay(days, "draft-1", "2026-01-02");

  expect(next[0].slots).toHaveLength(0);
  expect(next[1].slots).toHaveLength(1);
  expect(next[1].slots[0]?.dateLabel).toBe("Fri, Jan 2");
});

test("startOfWeek returns Monday as the week start", () => {
  const input = new Date(2026, 0, 28, 10, 0, 0);
  const weekStart = startOfWeek(input);

  expect(weekStart.getDay()).toBe(1);
});

test("buildWeekDays returns 7 days starting on Monday", () => {
  const weekStart = startOfWeek(new Date(2026, 0, 26, 9, 0, 0));
  const days = buildWeekDays(weekStart);

  expect(days).toHaveLength(7);
  expect(days[0]?.label).toBe("Mon");
  expect(days[6]?.label).toBe("Sun");
  expect(days[0]?.id).toBe(formatDayId(weekStart));
});

test("buildScheduledAt returns an ISO timestamp for valid inputs", () => {
  const scheduledAt = buildScheduledAt("2026-01-26", "9:00 AM");
  expect(typeof scheduledAt).toBe("string");
  expect(scheduledAt).not.toBeNull();
});

test("buildScheduledAt returns null for invalid date ids", () => {
  expect(buildScheduledAt("not-a-date", "9:00 AM")).toBeNull();
});
