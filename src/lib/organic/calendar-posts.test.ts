import { describe, expect, test } from "bun:test"

import {
  formatPostedTimeLabel,
  getVisibleMonthRange,
  getWeekRange,
} from "@/lib/organic/calendar-posts"

describe("organic calendar posts helpers", () => {
  test("returns the full visible month grid range", () => {
    const range = getVisibleMonthRange(new Date(2026, 3, 15))

    expect(range).toEqual({
      start: "2026-03-29",
      end: "2026-05-02",
    })
  })

  test("returns a seven day week range", () => {
    const range = getWeekRange(new Date(2026, 3, 27))

    expect(range).toEqual({
      start: "2026-04-27",
      end: "2026-05-03",
    })
  })

  test("formats posted timestamps as time labels", () => {
    expect(formatPostedTimeLabel("2026-04-27T16:05:00.000Z")).toMatch(/\d{1,2}:05\s?(AM|PM)/)
  })
})
