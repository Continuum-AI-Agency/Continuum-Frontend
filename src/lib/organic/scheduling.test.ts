import { describe, expect, it } from "bun:test"

import {
  getNowLocalDateTimeInputValue,
  isFutureLocalDateTime,
  isValidTimeLabel,
  normalizeTimeLabel,
  parseLocalDateTime,
  parseTimeLabel,
} from "./scheduling"

describe("organic scheduling utilities", () => {
  it("parses and normalizes valid 12-hour time labels", () => {
    expect(parseTimeLabel("9:00 AM")).toEqual({ hour24: 9, minute: 0 })
    expect(parseTimeLabel("12:45 PM")).toEqual({ hour24: 12, minute: 45 })
    expect(normalizeTimeLabel("09:05 am")).toBe("9:05 AM")
  })

  it("rejects invalid time labels", () => {
    expect(isValidTimeLabel("9 AM")).toBe(false)
    expect(isValidTimeLabel("13:00 PM")).toBe(false)
    expect(isValidTimeLabel("25:00")).toBe(false)
    expect(normalizeTimeLabel("invalid")).toBeNull()
  })

  it("parses local datetime values and validates future time", () => {
    expect(parseLocalDateTime("2026-03-07T09:30")).not.toBeNull()
    expect(parseLocalDateTime("2026/03/07 09:30")).toBeNull()

    const now = new Date("2026-03-07T09:00:00")
    expect(isFutureLocalDateTime("2026-03-07T09:00", now)).toBe(true)
    expect(isFutureLocalDateTime("2026-03-07T09:30", now)).toBe(true)
    expect(isFutureLocalDateTime("2026-03-07T08:59", now)).toBe(false)
  })

  it("formats minimum datetime-local input values", () => {
    const value = getNowLocalDateTimeInputValue(new Date("2026-03-07T09:04:45"))
    expect(value).toBe("2026-03-07T09:04")
  })
})
