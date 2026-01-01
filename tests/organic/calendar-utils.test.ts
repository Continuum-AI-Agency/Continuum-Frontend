import { expect, test } from "bun:test";

import { moveDraftToDay } from "@/components/organic/primitives/calendar-utils";
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
